import requests
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ANS_API_KEY")
API_SECRET = os.getenv("ANS_API_SECRET")
BASE_URL = "https://api.godaddy.com/v1/agents"
HEADERS = {
    "Authorization": f"sso-key {API_KEY}:{API_SECRET}",
    "Accept": "application/json"
}

# ─────────────────────────────────────────
# DOMAIN CLASSIFICATION
# ─────────────────────────────────────────

def classify_domain(host):
    if not host:
        return "UNKNOWN"
    if "agenthost.club" in host:
        return "WOOCOMMERCE"
    if "helpagent.club" in host:
        return "GODADDY_SUPPORT"
    if "agentworks.fr" in host:
        return "AGENTWORKS"
    return "INDEPENDENT"

def is_test_agent(agent):
    name = (agent.get("agentDisplayName") or "").lower()
    desc = (agent.get("agentDescription") or "").lower()
    host = (agent.get("agentHost") or "").lower()
    return any(word in name + desc + host for word in [
        "smoke", "test", "staging", "canary", "dev", "sandbox"
    ])

# ─────────────────────────────────────────
# FETCHING
# ─────────────────────────────────────────

def get_agents_page(limit=20, offset=0):
    response = requests.get(
        BASE_URL,
        headers=HEADERS,
        params={"limit": limit, "offset": offset}
    )
    return response.json()

def fetch_agent_card(metadata_url, agent_host=None):
    urls_to_try = [
        metadata_url,
        f"https://{agent_host}/.well-known/agent.json" if agent_host else None,
        f"https://{agent_host}/.well-known/agent-card.json" if agent_host else None,
    ]
    for url in urls_to_try:
        if not url:
            continue
        try:
            response = requests.get(url, timeout=15)
            if response.status_code == 200:
                return response.json()
        except Exception:
            continue
    return None

def check_agint_manifest(agent_host, domain_type):
    # WooCommerce and GoDaddy support agents never have AGINT manifests
    if domain_type in ["WOOCOMMERCE", "GODADDY_SUPPORT"]:
        return None
    try:
        url = f"https://{agent_host}/.well-known/agint/manifest.json"
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None

def probe_mcp_tools(agent_host, agent_url):
    # Only attempt for MCP agents
    try:
        endpoint = agent_url or f"https://{agent_host}/mcp"
        response = requests.post(
            endpoint,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None

# ─────────────────────────────────────────
# MANIFEST BUILDING
# ─────────────────────────────────────────

def build_woocommerce_manifest(agent):
    host = agent.get("agentHost") or ""
    # Derive store name from host
    store_name = host.replace(".agenthost.club", "").replace("-", " ").title()
    return {
        "manifest_version": "1.0",
        "agent": host,
        "display_name": store_name,
        "description": "WooCommerce e-commerce store offering product search and discovery",
        "protocol": "MCP",
        "manifest_source": "TEMPLATE_WOOCOMMERCE",
        "intent_categories": ["ecommerce", "product_search", "shopping"],
        "primary_domain": "ecommerce",
        "tools": [
            {
                "name": "search_products",
                "description": "Search for products in this WooCommerce store",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Product search query"
                        }
                    },
                    "required": ["query"]
                }
            }
        ],
        "routing_tags": ["ecommerce", "woocommerce", "product-search", "shopping"],
        "confidence": 0.95
    }

# ─────────────────────────────────────────
# AGENT PROCESSING
# ─────────────────────────────────────────

def process_agent(agent):
    agent_id = agent.get("agentId")
    name = agent.get("agentDisplayName")
    description = agent.get("agentDescription")
    host = agent.get("agentHost")
    ans_name = agent.get("ansName")
    registration_timestamp = agent.get("registrationTimestamp")
    status = agent.get("status")

    # Endpoint details
    endpoints = agent.get("endpoints", [])
    endpoint = endpoints[0] if endpoints else {}
    agent_url = endpoint.get("agentUrl")
    protocol = endpoint.get("protocol")
    metadata_url = endpoint.get("metaDataUrl")
    functions = endpoint.get("functions", [])
    transports = endpoint.get("transports", [])

    # Classify
    domain_type = classify_domain(host)
    test_agent = is_test_agent(agent)

    # Fetch agent card (skip WooCommerce because we know they don't have one)
    agent_card = None
    if domain_type != "WOOCOMMERCE":
        agent_card = fetch_agent_card(metadata_url, host)

    # Check for AGINT manifest
    agint_manifest = check_agint_manifest(host, domain_type)

    # Probe MCP tools if applicable
    mcp_tools = None
    if protocol == "MCP" and domain_type not in ["WOOCOMMERCE"]:
        mcp_tools = probe_mcp_tools(host, agent_url)

    # Determine manifest source and routing status
    if test_agent:
        manifest_source = "TEST_AGENT"
        routing_status = "EXCLUDED"
    elif agint_manifest:
        manifest_source = "AGINT_NATIVE"
        routing_status = "ROUTABLE"
    elif domain_type == "WOOCOMMERCE":
        manifest_source = "TEMPLATE_WOOCOMMERCE"
        routing_status = "ROUTABLE"
    elif mcp_tools:
        manifest_source = "MCP_PROBED"
        routing_status = "ROUTABLE"
    elif agent_card:
        manifest_source = "NEEDS_LLM_ENRICHMENT"
        routing_status = "ROUTABLE_WITH_FALLBACK"
    else:
        manifest_source = "NONE"
        routing_status = "NEEDS_REVIEW"

    # Build synthetic manifest for WooCommerce
    synthetic_manifest = None
    if domain_type == "WOOCOMMERCE":
        synthetic_manifest = build_woocommerce_manifest(agent)

    return {
        "agentId": agent_id,
        "ansName": ans_name,
        "name": name,
        "description": description,
        "host": host,
        "endpoint": agent_url,
        "protocol": protocol,
        "transports": transports,
        "registrationTimestamp": registration_timestamp,
        "domainType": domain_type,
        "isTestAgent": test_agent,
        "source": "ANS_IMPORT",
        "manifestSource": manifest_source,
        "routingStatus": routing_status,
        "agentCard": agent_card,
        "agintManifest": agint_manifest,
        "syntheticManifest": synthetic_manifest,
        "mcpTools": mcp_tools,
        "functions": functions
    }

# ─────────────────────────────────────────
# MAIN CRAWLER
# ─────────────────────────────────────────

def run_crawler(max_agents=100):
    print(f"Starting ANS crawler — fetching up to {max_agents} agents...\n")

    results = []
    offset = 0
    limit = 20
    total_fetched = 0

    # Stats
    stats = {
        "AGINT_NATIVE": 0,
        "TEMPLATE_WOOCOMMERCE": 0,
        "MCP_PROBED": 0,
        "NEEDS_LLM_ENRICHMENT": 0,
        "TEST_AGENT": 0,
        "NONE": 0
    }

    domain_counts = {
        "WOOCOMMERCE": 0,
        "GODADDY_SUPPORT": 0,
        "AGENTWORKS": 0,
        "INDEPENDENT": 0,
        "UNKNOWN": 0
    }

    while total_fetched < max_agents:
        print(f"Fetching agents {offset} to {offset + limit}...")
        page = get_agents_page(limit=limit, offset=offset)

        agents = page.get("agents", [])
        if not agents:
            print("No more agents returned.")
            break

        for agent in agents:
            if total_fetched >= max_agents:
                break

            record = process_agent(agent)
            results.append(record)

            # Update stats
            ms = record["manifestSource"]
            if ms in stats:
                stats[ms] += 1
            
            dt = record["domainType"]
            if dt in domain_counts:
                domain_counts[dt] += 1

            total_fetched += 1
            flag = " ⚠️  TEST" if record["isTestAgent"] else ""
            print(f"  [{total_fetched}] {record['name']} | {record['domainType']} | {record['manifestSource']}{flag}")

            time.sleep(0.1)

        if not page.get("hasMore"):
            print("Reached end of agent list.")
            break

        offset += limit
        time.sleep(0.5)

    # Save results
    with open("crawler_results.json", "w") as f:
        json.dump(results, f, indent=2)

    # Print summary
    print(f"\n{'='*50}")
    print(f"CRAWLER COMPLETE")
    print(f"{'='*50}")
    print(f"Total agents fetched:       {total_fetched}")
    print(f"\nBy domain type:")
    for domain, count in domain_counts.items():
        print(f"  {domain:<20} {count}")
    print(f"\nBy manifest source:")
    for source, count in stats.items():
        print(f"  {source:<25} {count}")
    print(f"\nRouting ready:")
    routable = sum(1 for r in results if r["routingStatus"] == "ROUTABLE")
    fallback = sum(1 for r in results if r["routingStatus"] == "ROUTABLE_WITH_FALLBACK")
    review = sum(1 for r in results if r["routingStatus"] == "NEEDS_REVIEW")
    excluded = sum(1 for r in results if r["routingStatus"] == "EXCLUDED")
    print(f"  ROUTABLE:               {routable}")
    print(f"  ROUTABLE_WITH_FALLBACK: {fallback}")
    print(f"  NEEDS_REVIEW:           {review}")
    print(f"  EXCLUDED:               {excluded}")
    print(f"\nResults saved to crawler_results.json")

if __name__ == "__main__":
    run_crawler(max_agents=100)
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
    if "godaddy.com" in host:
        return "GODADDY_INTERNAL"
    if "agentnameregistry.com" in host:
        return "GODADDY_INTERNAL"
    return "INDEPENDENT"

def is_test_agent(agent):
    name = (agent.get("agentDisplayName") or "").lower()
    desc = (agent.get("agentDescription") or "").lower()
    # Only check name and description, NOT host
    # Host names like "aginttest.net" shouldn't trigger this
    return any(word in name + desc for word in [
        "smoke test", "test agent", "staging", "canary", "sandbox"
    ])

# ─────────────────────────────────────────
# FETCHING
# ─────────────────────────────────────────

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
    # Only agents on aginttest.net are known to have AGINT manifests
    # All other domains (including GODADDY_SUPPORT, AGENTWORKS, WOOCOMMERCE) won't have one
    if not agent_host or "aginttest.net" not in agent_host:
        return None
    try:
        url = f"https://{agent_host}/.well-known/agint/manifest.json"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None

def probe_mcp_tools(agent_host, agent_url):
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

    endpoints = agent.get("endpoints", [])
    endpoint = endpoints[0] if endpoints else {}
    agent_url = endpoint.get("agentUrl")
    protocol = endpoint.get("protocol")
    metadata_url = endpoint.get("metaDataUrl")
    functions = endpoint.get("functions", [])
    transports = endpoint.get("transports", [])

    domain_type = classify_domain(host)
    test_agent = is_test_agent(agent)

    # Fetch agent card (skip WooCommerce)
    agent_card = None
    if domain_type != "WOOCOMMERCE":
        agent_card = fetch_agent_card(metadata_url, host)

    # Probe MCP tools if applicable
    mcp_tools = None
    if protocol == "MCP" and domain_type not in ["WOOCOMMERCE"]:
        mcp_tools = probe_mcp_tools(host, agent_url)

    # Build synthetic manifest for WooCommerce
    synthetic_manifest = None
    if domain_type == "WOOCOMMERCE":
        synthetic_manifest = build_woocommerce_manifest(agent)

    # Determine manifest source and routing status
    if test_agent:
        manifest_source = "TEST_AGENT"
        routing_status = "EXCLUDED"
    elif "aginttest.net" in (host or ""):
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
        "syntheticManifest": synthetic_manifest,
        "mcpTools": mcp_tools,
        "functions": functions
    }

# ─────────────────────────────────────────
# MAIN CRAWLER
# ─────────────────────────────────────────

def run_crawler():
    print("Running crawler against sample_agents.json...\n")

    with open("sample_agents.json") as f:
        all_agents = json.load(f)

    results = []
    total_fetched = 0

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
    "GODADDY_INTERNAL": 0,
    "UNKNOWN": 0
    }

    for agent in all_agents:
        record = process_agent(agent)
        results.append(record)

        ms = record["manifestSource"]
        if ms in stats:
            stats[ms] += 1

        dt = record["domainType"]
        if dt in domain_counts:
            domain_counts[dt] += 1

        total_fetched += 1
        flag = " ⚠️  TEST" if record["isTestAgent"] else ""
        print(f"  [{total_fetched}] {record['name']} | {record['domainType']} | {record['manifestSource']}{flag}", flush = True)

        time.sleep(0.1)

    # Save results
    with open("sample_results.json", "w") as f:
        json.dump(results, f, indent=2)

    # Print summary
    print(f"\n{'='*50}")
    print(f"CRAWLER COMPLETE")
    print(f"{'='*50}")
    print(f"Total agents processed:     {total_fetched}")
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
    print(f"\nResults saved to sample_results.json")

if __name__ == "__main__":
    run_crawler()
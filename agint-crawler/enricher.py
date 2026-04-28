import json
import os
import time
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def call_llm(prompt):
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "gpt-4o-mini",
            "max_tokens": 1000,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        },
        timeout=30
    )
    return response.json()

def get_source_type(protocol):
    mapping = {
        "A2A": "a2a_card",
        "MCP": "mcp",
        "HTTP-API": "other"
    }
    return mapping.get(protocol, "unknown")

def get_interface_type(protocol):
    mapping = {
        "A2A": "a2a",
        "MCP": "mcp",
        "HTTP-API": "http"
    }
    return mapping.get(protocol, "other")

def get_auth_mode(agent_card):
    if not agent_card:
        return "none"
    schemes = agent_card.get("securitySchemes", {})
    auth = agent_card.get("authentication", {})
    security = agent_card.get("security", [])
    if auth.get("schemes"):
        scheme = auth["schemes"][0].lower()
        if "bearer" in scheme:
            return "bearer"
        if "oauth" in scheme:
            return "oauth2"
        if "apikey" in scheme or "api_key" in scheme:
            return "apiKey"
    if schemes:
        return "apiKey"
    return "none"

def build_prompt(agent):
    domain_type = agent.get("domainType")
    name = agent.get("name") or ""
    description = agent.get("description") or ""
    card = agent.get("agentCard") or {}
    skills = card.get("skills", [])
    protocol = agent.get("protocol") or ""
    host = agent.get("host") or ""

    skills_text = ""
    for s in skills:
        skills_text += f"- {s.get('name')}: {s.get('description', '')} (tags: {s.get('tags', [])})\n"

    metadata = card.get("metadata", {})
    pricing = card.get("pricing", {})
    authentication = card.get("authentication", {})

    prompt = f"""You are building a capability manifest for an AI agent registry called AGINT.

Given this agent metadata, generate a structured JSON manifest.

AGENT INFO:
Name: {name}
Description: {description}
Protocol: {protocol}
Host: {host}
Domain Type: {domain_type}
Skills:
{skills_text if skills_text else "None provided"}
Metadata: {json.dumps(metadata) if metadata else "None"}
Pricing: {json.dumps(pricing) if pricing else "None"}
Authentication: {json.dumps(authentication) if authentication else "None"}

Generate a JSON manifest with EXACTLY these fields:
{{
  "intent_categories": [list of 2-4 intent categories like "customer_support", "ecommerce", "legal", "agriculture", "travel"],
  "primary_domain": "the actual business domain like automotive, food_and_beverage, healthcare, legal, ecommerce, finance — NOT the domain type",
  "routing_tags": [list of 4-8 specific routing tags],
  "capabilities": [
    {{
      "capId": "snake_case_id",
      "name": "Human readable name",
      "description": "what this capability does in one clear sentence",
      "tags": ["relevant", "tags"],
      "intents": ["intent_category_1", "intent_category_2"],
      "examples": {{
        "userQueries": ["example query 1", "example query 2"]
      }}
    }}
  ],
  "confidence": 0.0 to 1.0 based on how much data was available for THIS specific agent,
  "inferred_industry": "the specific industry or sector this agent serves",
  "inferred_fields": ["list of fields that were inferred rather than directly sourced"],
  "language": "language code like en, fr, es or null if unknown"
}}

RULES:
- primary_domain must be a real business domain like automotive, healthcare, food_and_beverage — never use GODADDY_SUPPORT, AGENTWORKS, or INDEPENDENT
- confidence must reflect how much useful data was available for THIS specific agent:
    0.9+ only if agent has detailed skills with descriptions, examples, and metadata
    0.7-0.89 if agent has a clear name and description but limited skill detail
    0.5-0.69 if inference is based mostly on business name with little other signal
    0.3-0.49 if the name is ambiguous or unclear and very little data exists
- capabilities should map to the agent's skills — max 5 capabilities even if more skills exist
- intents inside each capability should come from the intent_categories list
- Return ONLY valid JSON, no explanation, no markdown backticks"""

    return prompt

def build_capabilities_from_mcp_tools(mcp_tools, agent, llm_result):
    tools = []
    try:
        content = mcp_tools.get("result", {})
        if isinstance(content, dict):
            tools = content.get("tools", [])
        elif isinstance(content, list):
            tools = content
    except Exception:
        pass

    if not tools:
        return build_capabilities_from_llm(llm_result, agent)

    capabilities = []
    protocol = agent.get("protocol", "MCP")
    endpoint_url = agent.get("endpoint", "")
    card = agent.get("agentCard") or {}
    input_modes = card.get("defaultInputModes", ["text/plain"])
    output_modes = card.get("defaultOutputModes", ["text/plain"])
    auth_mode = get_auth_mode(card)
    interface_type = get_interface_type(protocol)

    for tool in tools[:5]:
        cap = {
            "capId": tool.get("name", "unknown").replace("-", "_").lower(),
            "name": tool.get("name", "Unknown Tool"),
            "description": tool.get("description", ""),
            "tags": [],
            "intents": llm_result.get("intent_categories", []) if llm_result else [],
            "interfaces": [{
                "type": interface_type,
                "endpoint": {"url": endpoint_url},
                "auth": {"mode": auth_mode},
                "io": {
                    "inputModes": input_modes,
                    "outputModes": output_modes
                },
                "features": {
                    "streaming": card.get("capabilities", {}).get("streaming", False),
                    "notifications": card.get("capabilities", {}).get("pushNotifications", False),
                    "tools": True
                }
            }]
        }
        if tool.get("inputSchema"):
            cap["interfaces"][0]["endpoint"]["schemaUrl"] = None
            cap["domainModel"] = {
                "operations": [tool.get("name")]
            }
        capabilities.append(cap)

    return capabilities

def build_capabilities_from_llm(llm_result, agent):
    if not llm_result:
        return []

    protocol = agent.get("protocol", "A2A")
    endpoint_url = agent.get("endpoint", "")
    card = agent.get("agentCard") or {}
    input_modes = card.get("defaultInputModes", ["text/plain"])
    output_modes = card.get("defaultOutputModes", ["text/plain"])
    auth_mode = get_auth_mode(card)
    interface_type = get_interface_type(protocol)
    streaming = card.get("capabilities", {}).get("streaming", False)
    notifications = card.get("capabilities", {}).get("pushNotifications", False)

    capabilities = []
    for cap in llm_result.get("capabilities", []):
        capabilities.append({
            "capId": cap.get("capId", "unknown"),
            "name": cap.get("name", "Unknown"),
            "description": cap.get("description", ""),
            "tags": cap.get("tags", llm_result.get("routing_tags", [])),
            "intents": cap.get("intents", llm_result.get("intent_categories", [])),
            "examples": cap.get("examples", {}),
            "interfaces": [{
                "type": interface_type,
                "endpoint": {"url": endpoint_url},
                "auth": {"mode": auth_mode},
                "io": {
                    "inputModes": input_modes,
                    "outputModes": output_modes
                },
                "features": {
                    "streaming": streaming,
                    "notifications": notifications,
                    "tools": protocol == "MCP"
                }
            }]
        })

    return capabilities

def build_nam_v0(agent, llm_result):
    now = datetime.now(timezone.utc).isoformat()
    host = agent.get("host") or ""
    protocol = agent.get("protocol") or "A2A"
    card = agent.get("agentCard") or {}
    mcp_tools = agent.get("mcpTools")
    source_type = get_source_type(protocol)

    # Source URL — where we fetched the agent card from
    endpoints = agent.get("functions") or []
    source_url = card.get("url") or agent.get("endpoint") or f"https://{host}"
    metadata_url = f"https://{host}/.well-known/agent.json"

    # Capabilities — prefer MCP probed tools, fall back to LLM
    if mcp_tools and protocol == "MCP":
        capabilities = build_capabilities_from_mcp_tools(mcp_tools, agent, llm_result)
        capabilities_source = "mcp_probed"
    else:
        capabilities = build_capabilities_from_llm(llm_result, agent)
        capabilities_source = "llm_inferred"

    # Ensure at least one capability
    if not capabilities:
        capabilities = [{
            "capId": "general",
            "name": "General Agent",
            "description": agent.get("description") or "AI agent",
            "tags": [],
            "intents": [],
            "interfaces": [{
                "type": get_interface_type(protocol),
                "endpoint": {"url": agent.get("endpoint") or f"https://{host}"},
                "auth": {"mode": "none"},
                "io": {"inputModes": ["text/plain"], "outputModes": ["text/plain"]},
                "features": {"streaming": False, "notifications": False}
            }]
        }]

    # Publisher from agent card provider
    provider = card.get("provider") or {}
    publisher = {}
    if provider.get("organization"):
        publisher["org"] = provider["organization"]
    if provider.get("url"):
        publisher["contact"] = {"url": provider["url"]}

    # Provenance
    inferred_fields = llm_result.get("inferred_fields", [
        "intent_categories", "primary_domain", "routing_tags"
    ]) if llm_result else []

    confidence = llm_result.get("confidence", 0.5) if llm_result else 0.5

    notes = ["Imported from GoDaddy ANS registry"]
    if agent.get("source") == "ANS_IMPORT":
        notes.append("ANS KYC domain verification inherited")
    if agent.get("domainType") == "WOOCOMMERCE":
        notes.append("WooCommerce store — template manifest applied")
    if capabilities_source == "mcp_probed":
        notes.append("Capabilities sourced from live MCP tools/list probe")
    if capabilities_source == "llm_inferred":
        notes.append("Capabilities sourced from WooCommerce template — no LLM call made")

    nam = {
        "manifestVersion": "nam.v0",

        "identity": {
            "domain": host,
            "agentId": agent.get("agentId") or host,
            "displayName": agent.get("name") or "",
            "description": agent.get("description") or card.get("description") or ""
        },

        "publisher": publisher if publisher else None,

        "discovery": {
            "sourceType": source_type,
            "sourceUrl": metadata_url,
            "retrievedAt": now,
            "anchor": {
                "anchoredToDomain": True,
                "anchorEvidence": [
                    "ANS_KYC",
                    "ACME_DNS01",
                    f"ans_agent_id:{agent.get('agentId', '')}"
                ]
            }
        },

        "endpoints": {
            "primary": {
                "url": agent.get("endpoint") or f"https://{host}",
                "protocol": protocol,
                "transport": card.get("preferredTransport") or "JSONRPC"
            }
        },

        "capabilities": capabilities,

        "provenance": {
            "generatedBy": {
                "generator": "AGINT-ANS-crawler",
                "generatorVersion": "1.0"
            },
            "inputs": {
                "rawManifestUrls": [metadata_url]
            },
            "inference": {
                "inferredFields": inferred_fields,
                "confidence": confidence
            },
            "notes": notes
        }
    }

    # Clean up None publisher
    if nam["publisher"] is None:
        del nam["publisher"]

    return nam

def enrich_agent(agent):
    # WooCommerce agents get a template so no LLM needed
    if agent.get("domainType") == "WOOCOMMERCE":
        host = agent.get("host") or ""
        store_name = host.replace(".agenthost.club", "").replace("-", " ").title()
        llm_result = {
            "intent_categories": ["ecommerce", "product_search", "shopping"],
            "primary_domain": "ecommerce",
            "routing_tags": ["ecommerce", "woocommerce", "product-search", "shopping"],
            "capabilities": [{
                "capId": "search_products",
                "name": "Search Products",
                "description": f"Search for products in the {store_name} WooCommerce store",
                "tags": ["ecommerce", "woocommerce", "product-search"],
                "intents": ["ecommerce", "product_search"],
                "examples": {
                    "userQueries": [
                        f"Search for products on {store_name}",
                        "Find me a product",
                        "What do you sell?"
                    ]
                }
            }],
            "confidence": 0.95,
            "inferred_industry": "ecommerce",
            "inferred_fields": ["store_name_from_host"],
            "language": "en"
        }
        nam = build_nam_v0(agent, llm_result)
        return {"success": True, "nam": nam, "llm_result": llm_result}

    # All other agents — call LLM
    prompt = build_prompt(agent)
    response = call_llm(prompt)

    try:
        content = response["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        llm_result = json.loads(content.strip())
        nam = build_nam_v0(agent, llm_result)
        return {"success": True, "nam": nam, "llm_result": llm_result}
    except Exception as e:
        return {"success": False, "error": str(e), "raw": response}

def run_enricher():
    print("Loading sample_results.json...")
    with open("sample_results.json") as f:
        agents = json.load(f)

    to_enrich = [a for a in agents if a.get("manifestSource") in [
        "NEEDS_LLM_ENRICHMENT", "TEMPLATE_WOOCOMMERCE", "MCP_PROBED"
    ]]
    print(f"Found {len(to_enrich)} agents to process\n")

    results = []
    success = 0
    failed = 0
    protocol_counts = {"A2A": 0, "MCP": 0, "other": 0}

    for i, agent in enumerate(to_enrich):
        protocol = agent.get("protocol") or "unknown"
        print(f"[{i+1}/{len(to_enrich)}] {agent['name']} | {agent['domainType']} | {protocol}", flush=True)

        result = enrich_agent(agent)

        if result["success"]:
            success += 1
            llm = result.get("llm_result", {})
            nam = result["nam"]
            print(f"  domain: {llm.get('primary_domain')} | confidence: {llm.get('confidence')} | caps: {len(nam['capabilities'])}", flush=True)
            agent["nam"] = nam
            agent["manifestSource"] = "AI_INFERRED" if agent.get("domainType") != "WOOCOMMERCE" else "TEMPLATE_WOOCOMMERCE"

            p = protocol.upper()
            if p in protocol_counts:
                protocol_counts[p] += 1
            else:
                protocol_counts["other"] += 1
        else:
            failed += 1
            print(f"  failed: {result.get('error')}", flush=True)

        results.append(agent)
        time.sleep(0.2)

    # Save full results
    with open("enriched_results.json", "w") as f:
        json.dump(results, f, indent=2)

    # Save NAM v0 manifests only
    nams = [a["nam"] for a in results if a.get("nam")]
    with open("nam_manifests.json", "w") as f:
        json.dump(nams, f, indent=2)

    print(f"\n{'='*50}")
    print(f"ENRICHMENT COMPLETE")
    print(f"{'='*50}")
    print(f"Total processed: {len(to_enrich)}")
    print(f"Success:         {success}")
    print(f"Failed:          {failed}")
    print(f"\nBy protocol:")
    for p, c in protocol_counts.items():
        print(f"  {p}: {c}")
    print(f"\nFiles saved:")
    print(f"  enriched_results.json — full agent records with NAM")
    print(f"  nam_manifests.json    — NAM v0 manifests only (ready for AGINT)")

if __name__ == "__main__":
    run_enricher()
// capabilities manifest
const MANIFEST = {
  manifest_version: "1.0",
  agent: "whois-agent.tbfwang.workers.dev",
  display_name: "WHOIS Lookup",
  description: "Returns WHOIS registration information for a domain name.",
  mcp: {
    endpoint: "https://whois-agent.tbfwang.workers.dev/v1/mcp/tools/call",
    protocol_version: "1.0"
  },
  tools: [
    {
      name: "whois_lookup",
      description: "Returns WHOIS registration details for a given domain name.",
      input_schema: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "Domain name to look up (e.g. google.com)"
          }
        },
        required: ["domain"]
      },
      output_schema: {
        type: "object",
        properties: {
          domain: { type: "string" },
          registrar: { type: "string" },
          creation_date: { type: "string" },
          expiration_date: { type: "string" },
          updated_date: { type: "string" },
          status: { type: "string" },
          name_servers: { type: "array" },
          source: { type: "string" }
        }
      }
    }
  ],
  provenance: {
    publisher: "AGINT",
    publisher_type: "agint_derived",
    upstream: ["https://rdap.org"],
    verified_owner: false
  },
  limits: {
    rate_limit_per_minute: 60
  }
};

async function whoisLookup(domain) {
  const url = `https://rdap.org/domain/${domain}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`RDAP API error: ${response.status}`);
  }

  const data = await response.json();

  // extract name servers
  const nameServers = (data.nameservers || []).map(ns => ns.ldhName);

  // extract dates
  let creationDate = null;
  let expirationDate = null;
  let updatedDate = null;

  for (const event of data.events || []) {
    if (event.eventAction === "registration") creationDate = event.eventDate;
    if (event.eventAction === "expiration") expirationDate = event.eventDate;
    if (event.eventAction === "last changed") updatedDate = event.eventDate;
  }

  // extract registrar
  let registrar = null;
  for (const entity of data.entities || []) {
    if (entity.roles && entity.roles.includes("registrar")) {
      registrar = entity.vcardArray?.[1]?.find(f => f[0] === "fn")?.[3] || null;
    }
  }

  return {
    domain: domain,
    registrar: registrar,
    creation_date: creationDate,
    expiration_date: expirationDate,
    updated_date: updatedDate,
    status: (data.status || []).join(", "),
    name_servers: nameServers,
    source: "rdap.org"
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // path 1: serve the manifest
    if (path === "/.well-known/agint/manifest.json") {
      return new Response(JSON.stringify(MANIFEST, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // path 2: MCP tool call
    if (path === "/v1/mcp/tools/call" && request.method === "POST") {
      const body = await request.json();
      const toolName = body.tool;
      const toolInput = body.input || {};

      if (toolName !== "whois_lookup") {
        return new Response(JSON.stringify({ error: `Unknown tool: ${toolName}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!toolInput.domain) {
        return new Response(JSON.stringify({ error: "Missing required input: domain" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const output = await whoisLookup(toolInput.domain.toLowerCase());

        return new Response(JSON.stringify({
          ok: true,
          agent: "whois-agent.tbfwang.workers.dev",
          tool: toolName,
          output
        }, null, 2), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // fallback
    return new Response("Not found", { status: 404 });
  }
};
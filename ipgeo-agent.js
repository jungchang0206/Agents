// capabilities manifest
const MANIFEST = {
  manifest_version: "1.0",
  agent: "ipgeo-agent.tbfwang.workers.dev",
  display_name: "IP Geolocation",
  description: "Returns geolocation data for the requesting IP address including city, region, country, coordinates, timezone, and ISP.",
  mcp: {
    endpoint: "https://ipgeo-agent.tbfwang.workers.dev/v1/mcp/tools/call",
    protocol_version: "1.0"
  },
  tools: [
    {
      name: "get_ip_geolocation",
      description: "Returns geolocation information for the caller's IP address.",
      input_schema: {
        type: "object",
        properties: {},
        required: []
      },
      output_schema: {
        type: "object",
        properties: {
          ip: { type: "string" },
          city: { type: "string" },
          region: { type: "string" },
          country: { type: "string" },
          continent: { type: "string" },
          latitude: { type: "string" },
          longitude: { type: "string" },
          timezone: { type: "string" },
          postal_code: { type: "string" },
          asn: { type: "number" },
          isp: { type: "string" }
        }
      }
    }
  ],
  provenance: {
    publisher: "AGINT",
    publisher_type: "agint_derived",
    upstream: [
      "https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties"
    ],
    verified_owner: false
  },
  limits: {
    rate_limit_per_minute: 60
  }
};

// gets information from the request.cf object
// every request that hits a Cloudfare Worker will have a request.cf object
function getGeoData(request) {
  const cf = request.cf;
  return {
    ip: request.headers.get("CF-Connecting-IP"),
    city: cf?.city,
    region: cf?.region,
    country: cf?.country,
    continent: cf?.continent,
    latitude: cf?.latitude,
    longitude: cf?.longitude,
    timezone: cf?.timezone,
    postal_code: cf?.postalCode,
    asn: cf?.asn,
    isp: cf?.asOrganization,
  };
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // path 1: serve the manifest
    if (path === "/.well-known/agint/manifest.json") {
      return new Response(JSON.stringify(MANIFEST, null, 2), { // displays the capabilities manifest
        headers: { "Content-Type": "application/json" }
      });
    }

    // path 2: MCP tool call
    if (path === "/v1/mcp/tools/call" && request.method === "POST") { // if path matches + is a post request
      const body = await request.json();
      const toolName = body.tool;

      if (toolName !== "get_ip_geolocation") { // checks if it is asking to use a tool that exists
        return new Response(JSON.stringify({ error: `Unknown tool: ${toolName}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const output = getGeoData(request);

      return new Response(JSON.stringify({
        ok: true,
        agent: "ipgeo-agent.tbfwang.workers.dev",
        tool: toolName,
        output
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // fallback
    return new Response("Not found", { status: 404 });
  }
};
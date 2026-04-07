// capabilities manifest
const MANIFEST = {
  manifest_version: "1.0",
  agent: "exchange-agent.tbfwang.workers.dev",
  display_name: "Exchange Rate",
  description: "Returns the current exchange rate between two currencies using Frankfurter.",
  mcp: {
    endpoint: "https://exchange-agent.tbfwang.workers.dev/v1/mcp/tools/call",
    protocol_version: "1.0"
  },
  tools: [
    {
      name: "get_exchange_rate",
      description: "Returns the current exchange rate between two currencies (e.g. USD to EUR).",
      input_schema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Base currency code (e.g. USD, EUR, GBP)"
          },
          to: {
            type: "string",
            description: "Target currency code (e.g. EUR, JPY, GBP)"
          }
        },
        required: ["from", "to"]
      },
      output_schema: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          rate: { type: "number" },
          date: { type: "string" },
          source: { type: "string" }
        }
      }
    }
  ],
  provenance: {
    publisher: "AGINT",
    publisher_type: "agint_derived",
    upstream: ["https://api.frankfurter.app"],
    verified_owner: false
  },
  limits: {
    rate_limit_per_minute: 60
  }
};

async function getExchangeRate(from, to) {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Frankfurter API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.rates || !data.rates[to]) {
    throw new Error(`Could not find exchange rate for ${from} to ${to}`);
  }

  return {
    from: from,
    to: to,
    rate: data.rates[to],
    date: data.date,
    source: "frankfurter.app"
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

      if (toolName !== "get_exchange_rate") {
        return new Response(JSON.stringify({ error: `Unknown tool: ${toolName}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!toolInput.from || !toolInput.to) {
        return new Response(JSON.stringify({ error: "Missing required inputs: from and to" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const output = await getExchangeRate(
          toolInput.from.toUpperCase(),
          toolInput.to.toUpperCase()
        );

        return new Response(JSON.stringify({
          ok: true,
          agent: "exchange-agent.tbfwang.workers.dev",
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
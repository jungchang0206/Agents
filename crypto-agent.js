// capabilities manifest
const MANIFEST = {
  manifest_version: "1.0",
  agent: "crypto-agent.tbfwang.workers.dev",
  display_name: "Crypto Price",
  description: "Returns the current price of a cryptocurrency in USD using CoinGecko.",
  mcp: {
    endpoint: "https://crypto-agent.tbfwang.workers.dev/v1/mcp/tools/call",
    protocol_version: "1.0"
  },
  tools: [
    {
      name: "get_crypto_price",
      description: "Returns the current USD price of a cryptocurrency by its CoinGecko ID (e.g. bitcoin, ethereum, solana).",
      input_schema: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "CoinGecko coin ID (e.g. bitcoin, ethereum, solana)"
          }
        },
        required: ["coin"]
      },
      output_schema: {
        type: "object",
        properties: {
          coin: { type: "string" },
          price_usd: { type: "number" },
          source: { type: "string" }
        }
      }
    }
  ],
  provenance: {
    publisher: "AGINT",
    publisher_type: "agint_derived",
    upstream: ["https://api.coingecko.com"],
    verified_owner: false
  },
  limits: {
    rate_limit_per_minute: 60
  }
};

// network call 
async function getCryptoPrice(coin) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`;
  const response = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  } // makes it look like a browser request otherwise we need a key
});

  // HTTP GET request
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data[coin]) {
    throw new Error(`Coin not found: ${coin}`);
  }

  return { // format of our return
    coin: coin,
    price_usd: data[coin].usd,
    source: "coingecko"
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

      if (toolName !== "get_crypto_price") {
        return new Response(JSON.stringify({ error: `Unknown tool: ${toolName}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!toolInput.coin) {
        return new Response(JSON.stringify({ error: "Missing required input: coin" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const output = await getCryptoPrice(toolInput.coin.toLowerCase());

        return new Response(JSON.stringify({
          ok: true,
          agent: "crypto-agent.tbfwang.workers.dev",
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
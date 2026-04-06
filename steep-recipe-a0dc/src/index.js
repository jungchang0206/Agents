var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var TIMEZONE_MAP = {
  // US States
  "california": "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  "seattle": "America/Los_Angeles",
  "portland": "America/Los_Angeles",
  "nevada": "America/Los_Angeles",
  "washington state": "America/Los_Angeles",
  "arizona": "America/Phoenix",
  "phoenix": "America/Phoenix",
  "denver": "America/Denver",
  "colorado": "America/Denver",
  "utah": "America/Denver",
  "texas": "America/Chicago",
  "dallas": "America/Chicago",
  "houston": "America/Chicago",
  "chicago": "America/Chicago",
  "illinois": "America/Chicago",
  "minnesota": "America/Chicago",
  "new york": "America/New_York",
  "new york city": "America/New_York",
  "nyc": "America/New_York",
  "florida": "America/New_York",
  "miami": "America/New_York",
  "boston": "America/New_York",
  "atlanta": "America/New_York",
  "georgia": "America/New_York",
  "washington dc": "America/New_York",
  "hawaii": "Pacific/Honolulu",
  "honolulu": "Pacific/Honolulu",
  "alaska": "America/Anchorage",
  "anchorage": "America/Anchorage",
  // Europe
  "london": "Europe/London",
  "uk": "Europe/London",
  "england": "Europe/London",
  "paris": "Europe/Paris",
  "france": "Europe/Paris",
  "berlin": "Europe/Berlin",
  "germany": "Europe/Berlin",
  "madrid": "Europe/Madrid",
  "spain": "Europe/Madrid",
  "rome": "Europe/Rome",
  "italy": "Europe/Rome",
  "amsterdam": "Europe/Amsterdam",
  "netherlands": "Europe/Amsterdam",
  "brussels": "Europe/Brussels",
  "belgium": "Europe/Brussels",
  "zurich": "Europe/Zurich",
  "switzerland": "Europe/Zurich",
  "stockholm": "Europe/Stockholm",
  "sweden": "Europe/Stockholm",
  "oslo": "Europe/Oslo",
  "norway": "Europe/Oslo",
  "copenhagen": "Europe/Copenhagen",
  "denmark": "Europe/Copenhagen",
  "helsinki": "Europe/Helsinki",
  "finland": "Europe/Helsinki",
  "athens": "Europe/Athens",
  "greece": "Europe/Athens",
  "warsaw": "Europe/Warsaw",
  "poland": "Europe/Warsaw",
  "moscow": "Europe/Moscow",
  "russia": "Europe/Moscow",
  "istanbul": "Europe/Istanbul",
  "turkey": "Europe/Istanbul",
  // Asia
  "tokyo": "Asia/Tokyo",
  "japan": "Asia/Tokyo",
  "beijing": "Asia/Shanghai",
  "shanghai": "Asia/Shanghai",
  "china": "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong",
  "seoul": "Asia/Seoul",
  "korea": "Asia/Seoul",
  "singapore": "Asia/Singapore",
  "mumbai": "Asia/Kolkata",
  "india": "Asia/Kolkata",
  "delhi": "Asia/Kolkata",
  "dubai": "Asia/Dubai",
  "uae": "Asia/Dubai",
  "bangkok": "Asia/Bangkok",
  "thailand": "Asia/Bangkok",
  "jakarta": "Asia/Jakarta",
  "indonesia": "Asia/Jakarta",
  "karachi": "Asia/Karachi",
  "pakistan": "Asia/Karachi",
  "dhaka": "Asia/Dhaka",
  "bangladesh": "Asia/Dhaka",
  "tehran": "Asia/Tehran",
  "iran": "Asia/Tehran",
  "riyadh": "Asia/Riyadh",
  "saudi arabia": "Asia/Riyadh",
  // Australia & Pacific
  "sydney": "Australia/Sydney",
  "australia": "Australia/Sydney",
  "melbourne": "Australia/Melbourne",
  "brisbane": "Australia/Brisbane",
  "perth": "Australia/Perth",
  "auckland": "Pacific/Auckland",
  "new zealand": "Pacific/Auckland",
  // Americas
  "toronto": "America/Toronto",
  "canada": "America/Toronto",
  "vancouver": "America/Vancouver",
  "montreal": "America/Montreal",
  "mexico city": "America/Mexico_City",
  "mexico": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo",
  "brazil": "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires",
  "argentina": "America/Argentina/Buenos_Aires",
  "bogota": "America/Bogota",
  "colombia": "America/Bogota",
  "lima": "America/Lima",
  "peru": "America/Lima",
  "santiago": "America/Santiago",
  "chile": "America/Santiago",
  // Africa
  "cairo": "Africa/Cairo",
  "egypt": "Africa/Cairo",
  "johannesburg": "Africa/Johannesburg",
  "south africa": "Africa/Johannesburg",
  "nairobi": "Africa/Nairobi",
  "kenya": "Africa/Nairobi",
  "lagos": "Africa/Lagos",
  "nigeria": "Africa/Lagos"
};
function resolveTimezone(question) {
  const q = question.toLowerCase();
  const ianaMatch = q.match(
    /\b(america\/\w+|europe\/\w+|asia\/\w+|africa\/\w+|pacific\/\w+|atlantic\/\w+|australia\/\w+|utc)\b/i
  );
  if (ianaMatch) return ianaMatch[0];
  const keys = Object.keys(TIMEZONE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (q.includes(key)) return TIMEZONE_MAP[key];
  }
  return null;
}
__name(resolveTimezone, "resolveTimezone");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.method === "tools/list") {
        return Response.json({
          tools: [
            {
              name: "get_time",
              description: "Get current time for a given location or timezone.",
              input_schema: {
                type: "object",
                properties: {
                  question: { type: "string" }
                },
                required: ["question"]
              }
            }
          ]
        });
      }
      if (body.method === "tools/call" && body.params?.name === "get_time") {
        const question = body.params.arguments.question;
        const resolvedTimezone = resolveTimezone(question);
        let timeData = null;
        let timeError = null;
        try {
          const apiUrl = resolvedTimezone ? `https://time.now/developer/api/timezone/${resolvedTimezone}` : `https://time.now/developer/api/ip`;
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) {
            timeError = `time.now API returned status ${apiRes.status}`;
          } else {
            timeData = await apiRes.json();
          }
        } catch (err) {
          timeError = `Failed to fetch from time.now: ${err.message}`;
        }
        return Response.json({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                resolvedTimezone: resolvedTimezone || "ip-detected",
                timeData,
                timeError
              })
            }
          ]
        });
      }
    }
    if (url.pathname === "/api" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      console.info({ message: "Agent B received payload", fullPayload: body });
      const question = body.question || "No question received";
      const isTimeQuestion = /time|clock|timezone|hour|minute|utc|dst|daylight|what time/i.test(question);
      if (!isTimeQuestion) {
        return new Response(JSON.stringify({
          error: "out_of_scope",
          message: "Agent B only handles time and timezone questions.",
          question,
          capabilities: ["time", "timezone", "utc_offset", "dst", "clock"]
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      const resolvedTimezone = resolveTimezone(question);
      let timeData = null;
      let timeError = null;
      try {
        const apiUrl = resolvedTimezone ? `https://time.now/developer/api/timezone/${resolvedTimezone}` : `https://time.now/developer/api/ip`;
        console.info({ message: "Calling time.now API", apiUrl });
        const apiRes = await fetch(apiUrl);
        if (!apiRes.ok) {
          timeError = `time.now API returned status ${apiRes.status}`;
        } else {
          timeData = await apiRes.json();
        }
      } catch (err) {
        timeError = `Failed to fetch from time.now: ${err.message}`;
      }
      const prompt = `
You are Agent B, a specialist assistant for time and timezone questions only.

User asked:
"${question}"

${timeData ? `Live time data from time.now API: ${JSON.stringify(timeData)}` : ""}
${timeError ? `Note: Time service failed \u2014 ${timeError}` : ""}

Use the live time data above to answer accurately.
Respond naturally and concisely.
`;
      const aiResponse = await env.AI.run(
        "@cf/meta/llama-3-8b-instruct",
        { prompt }
      );
      return new Response(JSON.stringify({
        question,
        answer: aiResponse.response,
        resolvedTimezone: resolvedTimezone || "ip-detected",
        timeData: timeData || void 0,
        timeError: timeError || void 0,
        receivedPayload: body
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

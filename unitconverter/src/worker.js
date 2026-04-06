/**
 * worker.js — Unit Converter Agent (Cloudflare Worker)
 *
 * An AGINT-compliant unit conversion service.
 * No external API keys required — all conversions are computed locally.
 *
 * Supported conversion types:
 *   - length      (mm, cm, m, km, in, ft, yd, mi, nautical miles)
 *   - weight      (mg, g, kg, t, oz, lb, st, short_ton)
 *   - temperature (celsius, fahrenheit, kelvin, rankine)
 *   - currency    (fixed reference rates — not live)
 *   - timezone    (convert a datetime string between IANA timezones)
 *
 * Run "npm run dev" to start a development server
 * Run "npm run deploy" to publish
 * Learn more at https://developers.cloudflare.com/workers/
 */

import {
  LENGTH_TO_METRES,
  WEIGHT_TO_GRAMS,
  CURRENCY_RATES_FROM_USD,
  EXAMPLE_TIMEZONES,
} from './conversions.js';

import MANIFEST from './manifest.json';
import LANDING_HTML from './landing.html';

// ═══════════════════════════════════════════════════════════════════════════════
// Worker entry point
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // Capabilities manifest
    if (url.pathname === '/.well-known/agint/manifest.json') {
      return jsonResponse(MANIFEST);
    }

    // MCP tool dispatcher
    if (url.pathname === '/v1/mcp/tools/call' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      console.info({ message: 'Unit Converter agent received request', tool: body.tool });

      const { tool, arguments: args = {} } = body;

      switch (tool) {
        case 'convert_length': return handleLength(args);
        case 'convert_weight': return handleWeight(args);
        case 'convert_temperature': return handleTemperature(args);
        case 'convert_currency': return handleCurrency(args);
        case 'convert_timezone': return handleTimezone(args);
        case 'list_units': return handleListUnits(args);
        default:
          return jsonResponse({
            error: `Unknown tool: "${tool}". Valid tools: convert_length, convert_weight, convert_temperature, convert_currency, convert_timezone, list_units`
          }, 400);
      }
    }

    // Landing page
    return new Response(LANDING_HTML, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tool handlers
// ═══════════════════════════════════════════════════════════════════════════════

function handleLength({ value, from, to }) {
  if (value === undefined || !from || !to) {
    return jsonResponse({ error: 'Required fields: value (number), from (unit), to (unit)' }, 400);
  }
  from = from.toLowerCase();
  to = to.toLowerCase();

  if (!LENGTH_TO_METRES[from]) return jsonResponse({ error: `Unknown "from" unit: "${from}". Valid: ${Object.keys(LENGTH_TO_METRES).join(', ')}` }, 400);
  if (!LENGTH_TO_METRES[to]) return jsonResponse({ error: `Unknown "to" unit: "${to}". Valid: ${Object.keys(LENGTH_TO_METRES).join(', ')}` }, 400);

  const metres = parseFloat(value) * LENGTH_TO_METRES[from];
  const result = metres / LENGTH_TO_METRES[to];

  return jsonResponse({
    input: { value: parseFloat(value), unit: from },
    output: { value: round(result, 10), unit: to },
    formula: `${value} ${from} × ${LENGTH_TO_METRES[from]} m/${from} ÷ ${LENGTH_TO_METRES[to]} m/${to}`,
    category: 'length',
    source: 'unit_converter'
  });
}

function handleWeight({ value, from, to }) {
  if (value === undefined || !from || !to) {
    return jsonResponse({ error: 'Required fields: value (number), from (unit), to (unit)' }, 400);
  }
  from = from.toLowerCase();
  to = to.toLowerCase();

  if (!WEIGHT_TO_GRAMS[from]) return jsonResponse({ error: `Unknown "from" unit: "${from}". Valid: ${Object.keys(WEIGHT_TO_GRAMS).join(', ')}` }, 400);
  if (!WEIGHT_TO_GRAMS[to]) return jsonResponse({ error: `Unknown "to" unit: "${to}". Valid: ${Object.keys(WEIGHT_TO_GRAMS).join(', ')}` }, 400);

  const grams = parseFloat(value) * WEIGHT_TO_GRAMS[from];
  const result = grams / WEIGHT_TO_GRAMS[to];

  return jsonResponse({
    input: { value: parseFloat(value), unit: from },
    output: { value: round(result, 10), unit: to },
    formula: `${value} ${from} × ${WEIGHT_TO_GRAMS[from]} g/${from} ÷ ${WEIGHT_TO_GRAMS[to]} g/${to}`,
    category: 'weight',
    source: 'unit_converter'
  });
}

function handleTemperature({ value, from, to }) {
  if (value === undefined || !from || !to) {
    return jsonResponse({ error: 'Required fields: value (number), from (scale), to (scale)' }, 400);
  }
  const VALID = ['celsius', 'fahrenheit', 'kelvin', 'rankine'];
  from = from.toLowerCase();
  to = to.toLowerCase();

  if (!VALID.includes(from)) return jsonResponse({ error: `Unknown "from" scale: "${from}". Valid: ${VALID.join(', ')}` }, 400);
  if (!VALID.includes(to)) return jsonResponse({ error: `Unknown "to" scale: "${to}". Valid: ${VALID.join(', ')}` }, 400);

  const v = parseFloat(value);

  // Convert to Celsius as the intermediate step
  let celsius;
  switch (from) {
    case 'celsius': celsius = v; break;
    case 'fahrenheit': celsius = (v - 32) * 5 / 9; break;
    case 'kelvin': celsius = v - 273.15; break;
    case 'rankine': celsius = (v - 491.67) * 5 / 9; break;
  }

  // Convert from Celsius to target
  let result;
  switch (to) {
    case 'celsius': result = celsius; break;
    case 'fahrenheit': result = celsius * 9 / 5 + 32; break;
    case 'kelvin': result = celsius + 273.15; break;
    case 'rankine': result = (celsius + 273.15) * 9 / 5; break;
  }

  const SYMBOLS = { celsius: '°C', fahrenheit: '°F', kelvin: 'K', rankine: '°R' };

  return jsonResponse({
    input: { value: v, unit: from, symbol: SYMBOLS[from] },
    output: { value: round(result, 6), unit: to, symbol: SYMBOLS[to] },
    category: 'temperature',
    source: 'unit_converter'
  });
}

function handleCurrency({ value, from, to }) {
  if (value === undefined || !from || !to) {
    return jsonResponse({ error: 'Required fields: value (number), from (currency code), to (currency code)' }, 400);
  }
  from = from.toUpperCase();
  to = to.toUpperCase();

  if (!CURRENCY_RATES_FROM_USD[from]) return jsonResponse({ error: `Unknown "from" currency: "${from}". Valid: ${Object.keys(CURRENCY_RATES_FROM_USD).join(', ')}` }, 400);
  if (!CURRENCY_RATES_FROM_USD[to]) return jsonResponse({ error: `Unknown "to" currency: "${to}". Valid: ${Object.keys(CURRENCY_RATES_FROM_USD).join(', ')}` }, 400);

  const v = parseFloat(value);
  const inUSD = v / CURRENCY_RATES_FROM_USD[from];
  const result = inUSD * CURRENCY_RATES_FROM_USD[to];
  const rate = CURRENCY_RATES_FROM_USD[to] / CURRENCY_RATES_FROM_USD[from];

  return jsonResponse({
    input: { value: v, currency: from },
    output: { value: round(result, 4), currency: to },
    exchange_rate: round(rate, 6),
    note: 'Rates are fixed approximations and not live market data.',
    rates_base: 'USD',
    category: 'currency',
    source: 'unit_converter'
  });
}

function handleTimezone({ datetime, from, to }) {
  if (!datetime || !from || !to) {
    return jsonResponse({ error: 'Required fields: datetime (ISO 8601 string), from (IANA timezone), to (IANA timezone)' }, 400);
  }

  let sourceDate;
  try {
    sourceDate = new Date(datetime);
    if (isNaN(sourceDate.getTime())) throw new Error('Invalid date');
  } catch {
    return jsonResponse({ error: `Could not parse datetime: "${datetime}". Use ISO 8601 format, e.g. "2024-06-15T14:30:00"` }, 400);
  }

  // Validate timezones by trying to format
  try {
    sourceDate.toLocaleString('en-US', { timeZone: from });
  } catch {
    return jsonResponse({ error: `Invalid "from" timezone: "${from}". Use IANA format, e.g. "America/New_York"` }, 400);
  }

  try {
    sourceDate.toLocaleString('en-US', { timeZone: to });
  } catch {
    return jsonResponse({ error: `Invalid "to" timezone: "${to}". Use IANA format, e.g. "Europe/London"` }, 400);
  }

  // ISO string in a given timezone
  const toISO = (tz) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(sourceDate).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };

  // UTC offset helper
  const getOffset = (tz) => {
    const match = sourceDate.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).match(/GMT([+-]\d{1,2}:\d{2}|[+-]\d{4}|Z)?/);
    return match ? match[0] : 'GMT';
  };

  return jsonResponse({
    input: { datetime: toISO(from), timezone: from, utc_offset: getOffset(from) },
    output: { datetime: toISO(to), timezone: to, utc_offset: getOffset(to) },
    utc: sourceDate.toISOString(),
    unix_ms: sourceDate.getTime(),
    category: 'timezone',
    source: 'unit_converter'
  });
}

function handleListUnits({ category }) {
  const all = {
    length: { units: Object.keys(LENGTH_TO_METRES), note: 'Base unit: metre (m)' },
    weight: { units: Object.keys(WEIGHT_TO_GRAMS), note: 'Base unit: gram (g)' },
    temperature: { units: ['celsius', 'fahrenheit', 'kelvin', 'rankine'], note: 'Converted via Celsius' },
    currency: { units: Object.keys(CURRENCY_RATES_FROM_USD), note: 'Fixed reference rates. Base: USD' },
    timezone: { units: EXAMPLE_TIMEZONES, note: 'Any valid IANA timezone string accepted' }
  };

  if (category) {
    const cat = category.toLowerCase();
    if (!all[cat]) return jsonResponse({ error: `Unknown category: "${category}". Valid: ${Object.keys(all).join(', ')}` }, 400);
    return jsonResponse({ category: cat, ...all[cat], source: 'unit_converter' });
  }

  return jsonResponse({ categories: all, source: 'unit_converter' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function round(value, decimals) {
  return parseFloat(value.toFixed(decimals));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
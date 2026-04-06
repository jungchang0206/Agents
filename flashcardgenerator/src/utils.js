/**
 * utils.js — Shared helper functions
 */

/** Extract text from whatever shape Workers AI returns */
export function extractText(output) {
  return (
    output?.response         ||
    output?.result?.response ||
    output?.output_text      ||
    ''
  );
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}

export function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
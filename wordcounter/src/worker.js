/**
 * worker.js — Word Counter Agent (Cloudflare Worker)
 *
 * An AGINT-compliant word counting service.
 * No API key required.
 *
 * Run "npm run dev" to start a development server
 * Run "npm run deploy" to publish
 * Learn more at https://developers.cloudflare.com/workers/
 */

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
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Capabilities manifest
    if (url.pathname === '/.well-known/agint/manifest.json') {
      return jsonResponse(MANIFEST);
    }

    // MCP tool dispatcher
    if (url.pathname === '/v1/mcp/tools/call' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      console.info({ message: 'Word Counter received request', body });

      const { tool, arguments: args } = body;

      if (tool === 'count_words') {
        return handleCountWords(args);
      }

      return jsonResponse({ error: 'Invalid tool. Valid tools: count_words' }, 400);
    }

    // Landing page
    return new Response(LANDING_HTML, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tool handler
// ═══════════════════════════════════════════════════════════════════════════════

function handleCountWords(args) {
  if (!args || !args.text) {
    return jsonResponse({ error: 'Missing required field: text (string)' }, 400);
  }

  const text = args.text;

  // Words: split on whitespace, drop empty strings
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

  // Characters
  const characterCount = text.length;
  const characterCountNoSpaces = text.replace(/\s/g, '').length;

  // Sentences: split on . ! ? — filter out empty fragments
  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  // Paragraphs: split on one or more blank lines
  const paragraphCount = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

  return jsonResponse({
    word_count: wordCount,
    character_count: characterCount,
    character_count_no_spaces: characterCountNoSpaces,
    sentence_count: sentenceCount,
    paragraph_count: paragraphCount,
    source: 'word_counter'
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
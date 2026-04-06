/**
 * AI Translator & Summarizer — Cloudflare Worker
 * Entry point: handles routing only.
 */

import { handleTranslatorTools } from './tools.js';
import { buildManifest }         from './manifest.js';
import { landingPage }           from './landing.js';
import { jsonResponse, corsResponse } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Capabilities manifest
    if (url.pathname === '/.well-known/agint/manifest.json') {
      return jsonResponse(buildManifest());
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // MCP tool dispatcher
    if (url.pathname === '/v1/mcp/tools/call' && request.method === 'POST') {
      return handleTranslatorTools(request, env);
    }

    // Landing page
    return new Response(landingPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
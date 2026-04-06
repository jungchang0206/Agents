/**
 * Slug Generator Agent — Cloudflare Worker
 * Entry point: handles routing only.
 */

import { handleGenerateSlug, handleBatchGenerateSlugs } from './tools.js';
import { buildManifest } from './manifest.js';
import { landingPage }   from './landing.js';
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
      const body = await request.json().catch(() => ({}));
      console.info({ message: 'Slug Generator received request', body });

      const { tool, arguments: args = {} } = body;

      switch (tool) {
        case 'generate_slug':
          if (!args.text) break;
          return handleGenerateSlug(args);
        case 'batch_generate_slugs':
          if (!Array.isArray(args.texts)) break;
          return handleBatchGenerateSlugs(args);
      }

      return jsonResponse({ error: 'Invalid tool or missing required arguments' }, 400);
    }

    // Landing page
    return new Response(landingPage(), {
      headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache' }
    });
  }
};
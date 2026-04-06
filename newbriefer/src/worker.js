/**
 * NewsBriefing Agent — Cloudflare Worker
 * Entry point: handles routing only.
 *
 * Required environment variables:
 *   NEWS_API_KEY — Your API key from https://newsapi.org/
 */

import { handleGetNewsBriefing, handleSummarizeArticle } from './tools.js';
import { buildManifest } from './manifest.js';
import { landingPage } from './landing.js';
import { jsonResponse, corsResponse } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // Capabilities manifest
    if (url.pathname === '/.well-known/agint/manifest.json') {
      return jsonResponse(buildManifest(url.hostname));
    }

    // MCP tool dispatcher
    if (url.pathname === '/v1/mcp/tools/call' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      console.info({ message: 'NewsBriefing agent received request', tool: body.tool });

      const { tool, arguments: args = {} } = body;

      switch (tool) {
        case 'get_news_briefing': return handleGetNewsBriefing(args, env);
        case 'summarize_article': return handleSummarizeArticle(args, env);
        default:
          return jsonResponse({
            error: `Unknown tool: "${tool}". Valid tools: get_news_briefing, summarize_article`
          }, 400);
      }
    }

    // Landing page
    return new Response(landingPage(url.hostname), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
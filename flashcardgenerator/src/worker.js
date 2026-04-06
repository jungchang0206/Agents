/**
 * Flashcard Generator Agent — Cloudflare Worker
 * Entry point: routes requests to the appropriate handler.
 */

import { handleGenerateFlashcards, handleGenerateQuiz, handleSimplifyCard } from './tools.js';
import { buildManifest } from './manifest.js';
import { landingPage }   from './landing.js';
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
      return jsonResponse(buildManifest());
    }

    // MCP tool dispatcher
    if (url.pathname === '/v1/mcp/tools/call' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      console.info({ message: 'Flashcard agent received request', tool: body.tool });

      const { tool, arguments: args = {} } = body;

      try {
        switch (tool) {
          case 'generate_flashcards': return await handleGenerateFlashcards(args, env);
          case 'generate_quiz':       return await handleGenerateQuiz(args, env);
          case 'simplify_card':       return await handleSimplifyCard(args, env);
          default:
            return jsonResponse({
              error: `Unknown tool: "${tool}". Valid tools: generate_flashcards, generate_quiz, simplify_card`
            }, 400);
        }
      } catch (err) {
        console.error('Tool error:', err.message, err.stack);
        return jsonResponse({ error: 'Server error: ' + err.message }, 500);
      }
    }

    // Landing page
    return new Response(landingPage(), { headers: { 'Content-Type': 'text/html' } });
  }
};
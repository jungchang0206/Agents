/**
 * tools.js — Core AI operations and MCP tool handlers.
 *
 * Core helpers (also exported for reuse):
 *   aiTranslate(text, targetLangName, env)
 *   aiSummarize(text, env)
 *
 * MCP handler:
 *   handleTranslatorTools(request, env)
 */

import { MODEL, extractText, resolveCode, jsonResponse } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Core AI helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function aiTranslate(text, targetLangName, env) {
  const output = await env.LLM.run(MODEL, {
    messages: [
      {
        role: 'system',
        content: 'You are a precise translator. Output ONLY the translated text — nothing else. No explanations, introductions, quotes, markdown, or extra words.'
      },
      {
        role: 'user',
        content: `Translate this text to ${targetLangName}:\n\n${text}`
      }
    ],
    max_tokens:  1200,
    temperature: 0.3
  });

  return extractText(output) || '[Translation failed]';
}

export async function aiSummarize(text, env) {
  const maxChars = Math.floor(text.length * 0.5);

  const output = await env.LLM.run(MODEL, {
    messages: [
      {
        role: 'system',
        content: 'You are a strict text compression engine.'
      },
      {
        role: 'user',
        content: `Summarize the text below.
The summary MUST be shorter than the original.
Maximum length allowed: ${maxChars} characters.
Be concise and remove all redundancy.
Output ONLY the summary text.

Text:
${text}`
      }
    ],
    max_tokens:  200,
    temperature: 0.2
  });

  let summary = extractText(output) || '[Summary failed]';

  // Hard safety trim if model ignores the instruction
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars).trim();
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export async function handleTranslatorTools(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}

  const tool = body.tool || body.name;
  const args = body.arguments || body.args || {};

  try {
    // ── translate_text ──────────────────────────────────────────────────────
    if (tool === 'translate_text' && args.text && args.target_language) {
      const translated = await aiTranslate(args.text, args.target_language, env);

      return jsonResponse({
        translated_text: translated,
        source_language: args.source_language || 'auto',
        target_language: resolveCode(args.target_language),
        source: 'ai_translator'
      });
    }

    // ── summarize_text ──────────────────────────────────────────────────────
    if (tool === 'summarize_text' && args.text) {
      const summary = await aiSummarize(args.text, env);

      return jsonResponse({
        summary,
        original_length: args.text.length,
        summary_length:  summary.length,
        source: 'ai_summarizer'
      });
    }

    // ── translate_and_summarize ─────────────────────────────────────────────
    if (tool === 'translate_and_summarize' && args.text && args.target_language) {
      const translated = await aiTranslate(args.text, args.target_language, env);
      const summary    = await aiSummarize(translated, env);

      return jsonResponse({
        translated_text: translated,
        summary,
        target_language: resolveCode(args.target_language),
        source: 'ai_translator_summarizer'
      });
    }

    return jsonResponse({ error: 'Invalid tool or missing required arguments' }, 400);

  } catch (err) {
    console.error('Tool error:', err.message, err.stack);
    return jsonResponse({ error: 'Server error: ' + err.message }, 500);
  }
}
/**
 * tools.js — Core slug generation logic and tool handlers.
 *
 * Exports:
 *   generateSlug          — pure slug-generation function
 *   handleGenerateSlug    — MCP handler for generate_slug
 *   handleBatchGenerateSlugs — MCP handler for batch_generate_slugs
 */

import { jsonResponse } from './utils.js';

const STOPWORDS = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

export function generateSlug(text, options = {}) {
  const {
    separator        = '-',
    max_length,
    lowercase        = true,
    remove_stopwords = false
  } = options;

  if (!text) return { slug: '', metadata: {} };

  let slug = text.trim();

  if (lowercase) {
    slug = slug.toLowerCase();
  }

  if (remove_stopwords) {
    slug = slug
      .split(/\s+/)
      .filter(word => !STOPWORDS.has(word.toLowerCase()))
      .join(' ');
  }

  slug = slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // strip accents
    .replace(/[^\w\s-]/g, '')              // remove non-word chars
    .replace(/[\s_]+/g, separator)         // spaces/underscores → separator
    .replace(new RegExp(`${separator}+`, 'g'), separator)  // collapse duplicates
    .replace(new RegExp(`^${separator}|${separator}$`, 'g'), ''); // trim separators

  const originalLength = slug.length;
  let truncated = false;

  if (max_length && slug.length > max_length) {
    slug = slug.substring(0, max_length).replace(new RegExp(`${separator}$`), '');
    truncated = true;
  }

  return {
    slug,
    metadata: {
      word_count:      text.trim().split(/\s+/).length,
      original_length: originalLength,
      slug_length:     slug.length,
      separator_used:  separator,
      truncated
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: generate_slug
// ─────────────────────────────────────────────────────────────────────────────

export function handleGenerateSlug(args) {
  const result = generateSlug(args.text, {
    separator:        args.separator,
    max_length:       args.max_length,
    lowercase:        args.lowercase,
    remove_stopwords: args.remove_stopwords
  });

  return jsonResponse({
    slug:          result.slug,
    original_text: args.text,
    metadata:      result.metadata,
    source:        'slug_generator'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: batch_generate_slugs
// ─────────────────────────────────────────────────────────────────────────────

export function handleBatchGenerateSlugs(args) {
  const slugs = args.texts.map(text => ({
    original: text,
    slug: generateSlug(text, { separator: args.separator, lowercase: args.lowercase }).slug
  }));

  return jsonResponse({ slugs, count: slugs.length, source: 'slug_generator' });
}
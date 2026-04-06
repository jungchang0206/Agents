/**
 * landing.js — Serves the landing page HTML.
 * The HTML source lives in landing.html; this module loads it via
 * Cloudflare Workers' static asset binding (or a raw import).
 *
 * If you're using Workers Static Assets (wrangler.toml [assets] block),
 * swap the import for `import html from './landing.html'` — Cloudflare's
 * bundler will inline it as a string automatically.
 */

import html from './landing.html';

export function landingPage() {
  return html;
}
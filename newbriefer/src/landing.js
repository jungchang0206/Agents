/**
 * landing.js — Serves the landing page HTML.
 *
 * The HTML source lives in landing.html. Cloudflare's bundler inlines it
 * as a string via the `import ... from '*.html'` static asset pattern.
 *
 * The hostname is injected at runtime so example URLs in the page stay
 * accurate in both local dev and production.
 */

import template from './landing.html';

export function landingPage(hostname) {
  // Replace the placeholder host used in example snippets, if present.
  return template.replace(/\{\{hostname\}\}/g, hostname);
}
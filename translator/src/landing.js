/**
 * landing.js — Serves the landing page HTML.
 * Cloudflare's bundler inlines landing.html as a string at build time.
 */

import html from './landing.html';

export function landingPage() {
  return html;
}
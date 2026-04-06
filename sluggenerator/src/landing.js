/**
 * landing.js — Serves the landing page HTML.
 * The HTML source lives in landing.html and is inlined at build time
 * by Cloudflare's bundler via the static asset import pattern.
 */

import html from './landing.html';

export function landingPage() {
  return html;
}
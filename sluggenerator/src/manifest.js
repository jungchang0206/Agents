/**
 * manifest.js — Re-exports the static manifest.json.
 *
 * Unlike the News Briefer, the slug generator's endpoint and agent fields
 * are hardcoded to a fixed domain, so no runtime patching is needed.
 * All content lives in manifest.json.
 */

import data from './manifest.json' assert { type: 'json' };

export function buildManifest() {
  return data;
}
/**
 * manifest.js — Re-exports the static manifest.json.
 * All content lives in manifest.json; no runtime patching needed
 * since the endpoint is hardcoded to a fixed domain.
 */

import data from './manifest.json' assert { type: 'json' };

export function buildManifest() {
  return data;
}
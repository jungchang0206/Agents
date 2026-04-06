/**
 * manifest.js — Exports buildManifest() for the AGINT capabilities endpoint.
 * The canonical data lives in manifest.json; this module re-exports it as a function
 * so worker.js can call it uniformly with jsonResponse(buildManifest()).
 */

import data from './manifest.json' assert { type: 'json' };

export function buildManifest() {
  return data;
}
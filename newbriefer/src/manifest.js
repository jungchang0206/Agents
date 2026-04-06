/**
 * manifest.js — Loads the static manifest.json and patches in the
 * two runtime-only values: mcp.endpoint and agent (both derived from hostname).
 *
 * All static content — tool schemas, descriptions, provenance, limits — lives
 * in manifest.json and is never duplicated here.
 */

import base from './manifest.json' assert { type: 'json' };

export function buildManifest(hostname) {
    return {
        ...base,
        mcp: { ...base.mcp, endpoint: `https://${hostname}/v1/mcp/tools/call` },
        agent: hostname
    };
}
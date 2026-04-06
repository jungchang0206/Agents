/**
 * utils.js — Shared constants, helpers, and response factories.
 */

export const MODEL = '@cf/meta/llama-3.1-8b-instruct';

/** Language name → ISO code map */
export const LANG_MAP = {
  English:    'en',
  Spanish:    'es',
  French:     'fr',
  German:     'de',
  Japanese:   'ja',
  Chinese:    'zh',
  Korean:     'ko',
  Italian:    'it',
  Portuguese: 'pt',
  Russian:    'ru',
  Arabic:     'ar',
  Hindi:      'hi',
};

/** Extract text from whatever shape Workers AI returns */
export function extractText(output) {
  return (
    output?.response        ||
    output?.result?.response ||
    output?.output_text     ||
    ''
  ).trim();
}

/** Resolve a language name or code to a 2-letter ISO code */
export function resolveCode(langName) {
  return LANG_MAP[langName] || langName.toLowerCase().slice(0, 2);
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}

export function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
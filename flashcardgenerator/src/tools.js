/**
 * tools.js — Tool handler functions
 *
 * Exports:
 *   handleGenerateFlashcards
 *   handleGenerateQuiz
 *   handleSimplifyCard
 */

import { extractText, jsonResponse } from './utils.js';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

// ─────────────────────────────────────────────────────────────────────────────
// Tool: generate_flashcards
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGenerateFlashcards({ text, count = 5, difficulty = 'medium', subject = '' }, env) {
  if (!text || text.trim().length < 20) {
    return jsonResponse({ error: 'Field "text" is required and must be at least 20 characters.' }, 400);
  }

  const safeCount      = Math.min(Math.max(parseInt(count) || 5, 1), 20);
  const safeDifficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const subjectHint    = subject ? `Subject area: ${subject}.` : '';

  const messages = [
    {
      role: 'system',
      content:
        'You are a flashcard generation engine. ' +
        'You ONLY output valid JSON. No markdown, no explanation, no preamble. ' +
        'Output a JSON array of objects with exactly two string fields: "question" and "answer".'
    },
    {
      role: 'user',
      content: `
Generate exactly ${safeCount} flashcards from the study notes below.
Difficulty level: ${safeDifficulty}.
${subjectHint}

Rules:
- Each question must be specific and test a single concept.
- Answers must be concise (1–3 sentences max).
- Do NOT repeat similar questions.
- Output ONLY a raw JSON array. No markdown fences, no extra text.

Format:
[
  { "question": "...", "answer": "..." },
  ...
]

Study notes:
${text.trim()}
`
    }
  ];

  const output = await env.LLM.run(MODEL, { messages, max_tokens: 1200, temperature: 0.4 });
  const raw    = extractText(output).trim();
  let cards;

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    cards = JSON.parse(cleaned);
    if (!Array.isArray(cards)) throw new Error('Not an array');
    cards = cards
      .filter(c => c && typeof c.question === 'string' && typeof c.answer === 'string')
      .slice(0, safeCount)
      .map((c, i) => ({ id: i + 1, question: c.question.trim(), answer: c.answer.trim() }));
  } catch {
    return jsonResponse({ error: 'LLM returned malformed JSON. Try again or shorten your input.', raw_output: raw }, 500);
  }

  return jsonResponse({ flashcards: cards, count: cards.length, difficulty: safeDifficulty, subject: subject || null, source: 'flashcard_agent' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: generate_quiz
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGenerateQuiz({ flashcards, count = 5 }, env) {
  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    return jsonResponse({ error: 'Field "flashcards" must be a non-empty array of {question, answer} objects.' }, 400);
  }

  const safeCount = Math.min(Math.max(parseInt(count) || 5, 1), flashcards.length);
  const cardText  = flashcards
    .slice(0, 15)
    .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
    .join('\n');

  const messages = [
    {
      role: 'system',
      content:
        'You are a multiple-choice quiz generator. ' +
        'You ONLY output valid JSON. No markdown, no explanation, no preamble.'
    },
    {
      role: 'user',
      content: `
Convert the flashcards below into ${safeCount} multiple-choice quiz questions.

Rules:
- Each question has exactly 4 options labeled A, B, C, D.
- Only one option is correct.
- The other 3 options must be plausible distractors — not obviously wrong.
- Output ONLY a raw JSON array. No markdown fences, no extra text.

Format:
[
  {
    "question": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct": "A",
    "explanation": "Brief explanation of why this is correct."
  }
]

Flashcards:
${cardText}
`
    }
  ];

  const output = await env.LLM.run(MODEL, { messages, max_tokens: 1500, temperature: 0.5 });
  const raw    = extractText(output).trim();
  let questions;

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    questions = JSON.parse(cleaned);
    if (!Array.isArray(questions)) throw new Error('Not an array');
    questions = questions
      .filter(q => q && typeof q.question === 'string' && q.options && q.correct)
      .slice(0, safeCount)
      .map((q, i) => ({ id: i + 1, ...q }));
  } catch {
    return jsonResponse({ error: 'LLM returned malformed JSON. Try again.', raw_output: raw }, 500);
  }

  return jsonResponse({ quiz: questions, count: questions.length, source: 'flashcard_agent' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: simplify_card
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSimplifyCard({ question, answer, level = 'beginner' }, env) {
  if (!question || !answer) {
    return jsonResponse({ error: 'Fields "question" and "answer" are both required.' }, 400);
  }

  const safeLevel = ['beginner', 'intermediate'].includes(level) ? level : 'beginner';

  const messages = [
    {
      role: 'system',
      content:
        'You are a teaching assistant that rewrites flashcards to be easier to understand. ' +
        'You ONLY output valid JSON. No markdown, no explanation, no preamble.'
    },
    {
      role: 'user',
      content: `
Rewrite the flashcard below for a ${safeLevel} audience.
Use simpler vocabulary, shorter sentences, and a real-world analogy if helpful.
Output ONLY a raw JSON object. No markdown fences, no extra text.

Format:
{
  "question": "simplified question",
  "answer": "simplified answer",
  "analogy": "optional one-sentence analogy or memory tip"
}

Original flashcard:
Q: ${question.trim()}
A: ${answer.trim()}
`
    }
  ];

  const output = await env.LLM.run(MODEL, { messages, max_tokens: 400, temperature: 0.3 });
  const raw    = extractText(output).trim();
  let card;

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    card = JSON.parse(cleaned);
    if (typeof card.question !== 'string' || typeof card.answer !== 'string') throw new Error('Bad shape');
  } catch {
    return jsonResponse({ error: 'LLM returned malformed JSON. Try again.', raw_output: raw }, 500);
  }

  return jsonResponse({
    original:   { question: question.trim(), answer: answer.trim() },
    simplified: { question: card.question.trim(), answer: card.answer.trim(), analogy: card.analogy?.trim() || null },
    level:      safeLevel,
    source:     'flashcard_agent'
  });
}
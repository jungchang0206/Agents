/**
 * tools.js — Tool handler functions.
 *
 * Exports:
 *   handleGetNewsBriefing
 *   handleSummarizeArticle
 */

import { VALID_CATEGORIES, VALID_COUNTRIES, stripHtml, splitSentences, jsonResponse } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tool: get_news_briefing
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGetNewsBriefing(args, env) {
    const {
        query = null,
        category = 'general',
        country = 'us',
        count = 5
    } = args;

    const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'general';
    const safeCountry = VALID_COUNTRIES.includes(country) ? country : 'us';
    const safeCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);

    const apiKey = env.NEWS_API_KEY;
    if (!apiKey) {
        return jsonResponse({ error: 'NEWS_API_KEY environment variable is not configured.' }, 500);
    }

    let apiUrl;
    if (query) {
        apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${safeCount}&apiKey=${apiKey}`;
    } else {
        apiUrl = `https://newsapi.org/v2/top-headlines?country=${safeCountry}&category=${safeCategory}&pageSize=${safeCount}&apiKey=${apiKey}`;
    }

    const newsRes = await fetch(apiUrl);
    if (!newsRes.ok) {
        return jsonResponse({ error: `NewsAPI request failed with status ${newsRes.status}` }, 502);
    }

    const data = await newsRes.json();
    if (data.status !== 'ok') {
        return jsonResponse({ error: data.message || 'NewsAPI returned an error.' }, 502);
    }

    const articles = (data.articles || []).map((a, i) => ({
        rank: i + 1,
        title: a.title || 'No title',
        source: a.source?.name || 'Unknown source',
        author: a.author || null,
        published_at: a.publishedAt || null,
        description: a.description || null,
        url: a.url || null,
        image_url: a.urlToImage || null
    }));

    return jsonResponse({
        query: query || null,
        category: safeCategory,
        country: safeCountry,
        total_results: data.totalResults || articles.length,
        returned: articles.length,
        articles,
        source: 'news_briefer'
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: summarize_article
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSummarizeArticle(args, env) {
    const { url: articleUrl, max_sentences = 4 } = args;

    if (!articleUrl || !articleUrl.startsWith('http')) {
        return jsonResponse({ error: 'A valid "url" field is required.' }, 400);
    }

    const safeSentences = Math.min(Math.max(parseInt(max_sentences) || 4, 1), 10);

    let html;
    try {
        const res = await fetch(articleUrl, {
            headers: { 'User-Agent': 'NewsBriefingBot/1.0 (Cloudflare Workers)' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
    } catch (err) {
        return jsonResponse({ error: `Failed to fetch article: ${err.message}` }, 502);
    }

    const text = stripHtml(html);
    const sentences = splitSentences(text);
    const summary = sentences.slice(0, safeSentences).join(' ').trim();
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    return jsonResponse({
        url: articleUrl,
        word_count: wordCount,
        sentence_count: sentences.length,
        summary_sentences: safeSentences,
        summary: summary || 'Could not extract meaningful text from the article.',
        source: 'news_briefer'
    });
}
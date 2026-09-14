const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Gemini is used in this codebase for exactly one thing: re-ranking
 * and explaining a candidate list that real SQL filtering already
 * produced (see smartMatchService). It never queries data itself,
 * never sees anything beyond the compact candidate summaries it's
 * given, and its output is never allowed to directly cause a hire,
 * payment, or eligibility decision — only a ranked list with reasons
 * for a human to look at. That boundary is enforced by smartMatchService,
 * not by this file, but it's the reason this file only exposes a
 * generic "generate JSON from a prompt" primitive rather than any
 * app-specific action.
 */
function isConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

async function generateJson(prompt) {
  if (!isConfigured()) {
    throw new AppError('Smart matching is not configured on this server yet.', 503, 'GEMINI_NOT_CONFIGURED');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Gemini API request failed', { status: response.status, body });
    throw new AppError('Smart matching is temporarily unavailable.', 502, 'GEMINI_REQUEST_FAILED');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AppError('Smart matching returned an unexpected response.', 502, 'GEMINI_EMPTY_RESPONSE');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    logger.error('Gemini response was not valid JSON', { text: text.slice(0, 500) });
    throw new AppError('Smart matching returned an unreadable response.', 502, 'GEMINI_INVALID_JSON');
  }
}

module.exports = { isConfigured, generateJson };

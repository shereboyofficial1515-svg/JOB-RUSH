/**
 * Keyword handling shared by the public worker and job searches.
 *
 * A search like "wiring warri" is split into words and EVERY word must
 * match somewhere (in any of the fields the caller lists), so more words
 * narrow the results the way people expect, while each word can hit a
 * different field (one in the profession, one in the location). LIKE
 * wildcards typed by the user (% and _) are escaped, so they are searched
 * for literally instead of matching everything.
 */
const MAX_TERMS = 6;
const MAX_TERM_LENGTH = 40;

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

function splitTerms(keyword) {
  return String(keyword || '')
    .trim()
    .split(/\s+/)
    .map((t) => t.slice(0, MAX_TERM_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

/**
 * Pushes one parameter per term onto `params` and one AND-ed condition per
 * term onto `conditions`. `fieldsSql(placeholder)` returns the OR-list of
 * ILIKE tests for a single term, e.g. (p) => `a ILIKE ${p} OR b ILIKE ${p}`.
 * Returns the placeholder of the first term (for relevance ordering) or null.
 */
function addKeywordConditions(keyword, params, conditions, fieldsSql) {
  const terms = splitTerms(keyword);
  let first = null;
  for (const term of terms) {
    params.push(`%${escapeLike(term)}%`);
    const placeholder = `$${params.length}`;
    if (first === null) first = placeholder;
    conditions.push(`(${fieldsSql(placeholder)})`);
  }
  return first;
}

module.exports = { escapeLike, splitTerms, addKeywordConditions };

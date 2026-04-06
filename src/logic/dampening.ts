/**
 * Post-fusion dampening for Nucleus
 *
 * Ported from Ori-Mnemos (src/core/dampening.ts) and adapted for
 * line-based document search. Gravity dampening catches "cosine ghosts" —
 * high-scoring results that don't actually contain query terms.
 *
 * Ablation-validated in Drift pipeline (P@5 delta: -0.256)
 */

// ── Stopwords (from Ori-Mnemos) ─────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now", "and", "but", "or", "if", "while", "about", "what",
  "which", "who", "whom", "this", "that", "these", "those", "am", "it",
  "its", "my", "your", "his", "her", "our", "their", "i", "me", "we",
  "you", "he", "she", "they", "them", "up",
]);

// ── Types ────────────────────────────────────────────────────────────

/** Re-export LineResult as DampenableResult for API clarity */
import type { LineResult } from "./rrf.js";
export type DampenableResult = LineResult;

// ── Key term extraction (from Ori-Mnemos) ───────────────────────────

/**
 * Extract key terms from text, minus stopwords.
 * Ported from Ori-Mnemos extractKeyTerms.
 */
export function extractKeyTerms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")   // replace ALL non-alphanumeric (incl hyphens) with space
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

// ── Gravity Dampening (from Ori-Mnemos, adapted for line content) ───

/**
 * Gravity dampening: halve score for high-scoring results that have
 * zero query term overlap with the line content.
 *
 * Catches false positives where BM25/fuzzy scoring produces high
 * scores for lines that don't actually contain relevant terms.
 *
 * @param results - Search results to dampen
 * @param query - Original search query
 * @param threshold - Score threshold; only dampen results above this (default 0.3)
 * @param penalty - Multiplier for dampened results (default 0.5)
 */
export function applyGravityDampening(
  results: DampenableResult[],
  query: string,
  threshold: number = 0.3,
  penalty: number = 0.5,
): DampenableResult[] {
  const queryTerms = extractKeyTerms(query);
  if (queryTerms.size === 0) return results;

  return results.map((result) => {
    if (result.score <= threshold) return result;

    // Check term overlap against line content
    const lineTerms = extractKeyTerms(result.line);
    let hasOverlap = false;
    for (const term of queryTerms) {
      if (lineTerms.has(term)) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      return { ...result, score: result.score * penalty };
    }
    return result;
  });
}

/**
 * BM25 search for Nucleus
 *
 * Ported from Ori-Mnemos (src/core/bm25.ts) and adapted for
 * line-based document search instead of vault-based note search.
 *
 * BM25 (Best Matching 25) is a ranking function used by search engines
 * to estimate relevance of documents to a given search query.
 */

import { STOPWORDS } from "./stopwords.js";

// ── Types ────────────────────────────────────────────────────────────
export interface BM25Index {
  termFreqs: Map<string, Map<number, number>>; // term → { lineNum → count }
  docLengths: Map<number, number>;             // lineNum → token count
  avgDocLength: number;
  docCount: number;
}

export interface BM25Config {
  k1: number;
  b: number;
}

export interface BM25Result {
  line: string;
  lineNum: number;
  score: number;
}

// ── Default config (from Ori-Mnemos) ────────────────────────────────
const DEFAULT_BM25: BM25Config = {
  k1: 1.2,
  b: 0.75,
};

// ── Tokenizer (from Ori-Mnemos) ─────────────────────────────────────
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// ── Build index from document lines ─────────────────────────────────
export function buildBM25Index(
  lines: string[],
): BM25Index {
  const termFreqs = new Map<string, Map<number, number>>();
  const docLengths = new Map<number, number>();

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-indexed
    const tokens = tokenize(lines[i]);

    // Count term frequencies for this line
    const bag = new Map<string, number>();
    for (const t of tokens) {
      bag.set(t, (bag.get(t) ?? 0) + 1);
    }

    docLengths.set(lineNum, tokens.length);

    // Populate inverted index
    for (const [term, count] of bag) {
      let lineMap = termFreqs.get(term);
      if (!lineMap) {
        lineMap = new Map<number, number>();
        termFreqs.set(term, lineMap);
      }
      lineMap.set(lineNum, count);
    }
  }

  const totalLength = Array.from(docLengths.values()).reduce((a, b) => a + b, 0);
  const avgDocLength = lines.length > 0 ? totalLength / lines.length : 0;

  return {
    termFreqs,
    docLengths,
    avgDocLength,
    docCount: lines.length,
  };
}

// ── BM25 search (scoring from Ori-Mnemos) ───────────────────────────
export function searchBM25(
  query: string,
  lines: string[],
  index: BM25Index,
  config: BM25Config = DEFAULT_BM25,
  limit: number = 10,
): BM25Result[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { termFreqs, docLengths, avgDocLength, docCount } = index;
  const { k1, b } = config;
  const N = docCount;

  // Collect scores per line
  const scores = new Map<number, number>();

  for (const term of queryTokens) {
    const lineMap = termFreqs.get(term);
    if (!lineMap) continue;

    const n = lineMap.size; // lines containing term
    const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);

    for (const [lineNum, tf] of lineMap) {
      const dl = docLengths.get(lineNum) ?? 0;
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDocLength)));
      const termScore = idf * tfNorm;
      scores.set(lineNum, (scores.get(lineNum) ?? 0) + termScore);
    }
  }

  // Build result array, sort by score, limit
  const results: BM25Result[] = [];
  for (const [lineNum, score] of scores) {
    results.push({
      line: lines[lineNum - 1] ?? "",
      lineNum,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

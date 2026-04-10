/**
 * TF-IDF semantic search for Nucleus
 *
 * Uses cosine similarity on TF-IDF vectors (from Matryoshka's RAG module)
 * to find lines semantically similar to a query. Unlike BM25 which scores
 * exact term matches, TF-IDF cosine captures the overall "direction" of
 * a query in term space, giving better results for multi-term queries
 * where not all terms need to appear in a single line.
 *
 * Cosine similarity from Ori-Mnemos (src/core/engine.ts cosine function).
 */

import {
  tokenize as ragTokenize,
  inverseDocumentFrequency,
  tfidfVector,
  cosineSimilarity,
} from "../rag/similarity.js";

// ── Types ────────────────────────────────────────────────────────────

export interface SemanticResult {
  line: string;
  lineNum: number;
  score: number;
}

export interface SemanticIndex {
  lineTokens: string[][];
  idf: Map<string, number>;
  lineVectors: Map<string, number>[];
}

// ── Build index from document lines ─────────────────────────────────

export function buildSemanticIndex(lines: string[]): SemanticIndex {
  const lineTokens = lines.map(line => ragTokenize(line));
  const idf = inverseDocumentFrequency(lineTokens);
  const lineVectors = lineTokens.map(tokens => tfidfVector(tokens, idf));
  return { lineTokens, idf, lineVectors };
}

// ── Semantic search ─────────────────────────────────────────────────

/**
 * Search for lines semantically similar to a query using TF-IDF cosine similarity.
 *
 * @param query - Natural language query
 * @param lines - Document lines
 * @param index - Pre-built semantic index
 * @param limit - Max results to return (default 10)
 * @returns Lines ranked by cosine similarity, descending
 */
export function searchSemantic(
  query: string,
  lines: string[],
  index: SemanticIndex,
  limit: number = 10,
): SemanticResult[] {
  const queryTokens = ragTokenize(query);
  if (queryTokens.length === 0) return [];

  const queryVec = tfidfVector(queryTokens, index.idf);

  const results: SemanticResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineVec = index.lineVectors[i];
    if (!lineVec || lineVec.size === 0) continue;
    const score = cosineSimilarity(queryVec, lineVec);
    if (score > 0) {
      results.push({ line: lines[i], lineNum: i + 1, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

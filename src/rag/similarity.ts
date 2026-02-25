/**
 * Lightweight Similarity Search
 *
 * Implements TF-IDF-like similarity without external dependencies.
 * Designed for local-first operation with small knowledge bases.
 */

/**
 * Tokenize text into lowercase words
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s$]/g, " ")  // Keep $ for currency
    .split(/\s+/)
    .filter(word => word.length > 1 || word === "$");  // Skip single chars, but keep $
}

/**
 * Calculate term frequency (TF) for a document
 */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  const length = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / length);
  }
  return tf;
}

/**
 * Calculate inverse document frequency (IDF) for a corpus
 */
export function inverseDocumentFrequency(
  documents: string[][]
): Map<string, number> {
  const docCount = documents.length;
  if (docCount === 0) return new Map();

  const termDocCount = new Map<string, number>();

  // Count how many documents contain each term
  for (const tokens of documents) {
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
    }
  }

  // Calculate IDF: log(N / df)
  const idf = new Map<string, number>();
  for (const [term, df] of termDocCount) {
    idf.set(term, Math.log(docCount / df));
  }

  return idf;
}

/**
 * Calculate TF-IDF vector for a document
 */
export function tfidfVector(
  tokens: string[],
  idf: Map<string, number>
): Map<string, number> {
  const tf = termFrequency(tokens);
  const tfidf = new Map<string, number>();

  for (const [term, tfValue] of tf) {
    const idfValue = idf.get(term) || Math.log(1000);  // Default high IDF for unknown terms
    tfidf.set(term, tfValue * idfValue);
  }

  return tfidf;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(
  vec1: Map<string, number>,
  vec2: Map<string, number>
): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Calculate dot product and norms
  for (const [term, val1] of vec1) {
    const val2 = vec2.get(term) || 0;
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
  }

  for (const [_, val2] of vec2) {
    norm2 += val2 * val2;
  }

  // Handle zero vectors
  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Simple keyword matching with bonus for exact matches
 */
export function keywordMatchScore(
  queryTokens: string[],
  keywords: string[]
): number {
  const querySet = new Set(queryTokens);
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

  let matches = 0;
  let partialMatches = 0;

  for (const query of querySet) {
    if (keywordSet.has(query)) {
      matches++;
    } else {
      // Check for partial matches
      for (const keyword of keywordSet) {
        if (keyword.includes(query) || query.includes(keyword)) {
          partialMatches++;
          break;
        }
      }
    }
  }

  // Score: full matches count more than partial
  const totalKeywords = keywordSet.size || 1;
  return (matches * 2 + partialMatches) / (totalKeywords + queryTokens.length);
}

/**
 * Combined similarity score using multiple signals
 */
export function combinedSimilarity(
  queryTokens: string[],
  docTokens: string[],
  keywords: string[],
  idf: Map<string, number>
): number {
  // TF-IDF similarity (semantic)
  const queryVec = tfidfVector(queryTokens, idf);
  const docVec = tfidfVector(docTokens, idf);
  const tfidfScore = cosineSimilarity(queryVec, docVec);

  // Keyword match score (explicit)
  const keywordScore = keywordMatchScore(queryTokens, keywords);

  // Combine: weight keywords more heavily for small knowledge bases
  return tfidfScore * 0.4 + keywordScore * 0.6;
}

/**
 * Build a search index for a set of documents
 */
export interface SearchIndex {
  /** Tokenized documents */
  documents: string[][];

  /** IDF values for the corpus */
  idf: Map<string, number>;

  /** Original document IDs */
  ids: string[];

  /** Keywords per document */
  keywords: string[][];
}

/**
 * Create a search index from documents
 */
export function buildSearchIndex(
  docs: Array<{ id: string; text: string; keywords: string[] }>
): SearchIndex {
  const documents = docs.map(d => tokenize(d.text));
  const idf = inverseDocumentFrequency(documents);

  return {
    documents,
    idf,
    ids: docs.map(d => d.id),
    keywords: docs.map(d => d.keywords),
  };
}

/**
 * Search the index and return ranked results
 */
export function searchIndex(
  index: SearchIndex,
  query: string,
  topK: number = 5
): Array<{ id: string; score: number }> {
  const queryTokens = tokenize(query);

  const scores: Array<{ id: string; score: number }> = [];

  for (let i = 0; i < index.documents.length; i++) {
    const score = combinedSimilarity(
      queryTokens,
      index.documents[i],
      index.keywords[i],
      index.idf
    );
    scores.push({ id: index.ids[i], score });
  }

  // Sort by score descending and return top K
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

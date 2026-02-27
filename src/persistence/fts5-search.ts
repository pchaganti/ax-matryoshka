/**
 * FTS5Search - Full-text search using SQLite FTS5
 *
 * Provides high-performance text search with:
 * - Boolean operators (AND, OR, NOT)
 * - Phrase queries
 * - Prefix matching
 * - Proximity search (NEAR)
 * - Relevance ranking
 * - Highlighting
 */

import type { SessionDB, DocumentLine } from "./session-db.js";
import { validateRegex } from "../logic/lc-solver.js";

export interface SearchResult extends DocumentLine {
  // Extended with optional fields for advanced queries
}

export interface HighlightResult extends SearchResult {
  highlighted: string;
}

export interface SnippetResult extends SearchResult {
  snippet: string;
}

export interface HighlightOptions {
  openTag?: string;
  closeTag?: string;
}

export class FTS5Search {
  private db: SessionDB;

  constructor(db: SessionDB) {
    this.db = db;
  }

  /**
   * Basic search - returns results in line order
   * Uses raw FTS5 query (caller is responsible for sanitization)
   */
  search(query: string): SearchResult[] {
    return this.db.searchRaw(query);
  }

  /**
   * Search with relevance ranking (BM25)
   */
  searchByRelevance(query: string): SearchResult[] {
    // FTS5 uses bm25() for relevance ranking
    // Since we're using the SessionDB abstraction, we'll sort by occurrence count
    const results = this.db.searchRaw(query);

    // Count occurrences of search terms in each result
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    // Pre-compute relevance scores to avoid recalculating per sort comparison
    const scores = new Map<SearchResult, number>();
    for (const r of results) {
      const lower = r.content.toLowerCase();
      const count = queryTerms.reduce((sum, term) => {
        return sum + (lower.split(term).length - 1);
      }, 0);
      scores.set(r, count);
    }

    return results.sort((a, b) => {
      return (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
    });
  }

  /**
   * Search with highlighted matches
   */
  searchWithHighlights(
    query: string,
    options: HighlightOptions = {}
  ): HighlightResult[] {
    // Sanitize tags to prevent XSS — strip script tags, event handlers, and JS URIs
    const sanitizeTag = (tag: string) => tag
      .replace(/<script\b[^>]*>/gi, "")
      .replace(/<\/script>/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .replace(/javascript\s*:/gi, "");
    const openTag = sanitizeTag(options.openTag ?? "<mark>");
    const closeTag = sanitizeTag(options.closeTag ?? "</mark>");
    const results = this.db.searchRaw(query);

    // Extract search terms (handle phrases and operators)
    const terms = this.extractSearchTerms(query);

    return results.map((result) => {
      let highlighted = result.content;
      for (const term of terms) {
        const regex = new RegExp(`(${this.escapeRegex(term)})`, "gi");
        highlighted = highlighted.replace(regex, `${openTag}$1${closeTag}`);
      }
      return { ...result, highlighted };
    });
  }

  /**
   * Search with relevant snippets
   */
  searchWithSnippets(query: string): SnippetResult[] {
    const results = this.db.searchRaw(query);
    const terms = this.extractSearchTerms(query);

    return results.map((result) => {
      // For single-line documents, snippet is the content with highlight
      let snippet = result.content;
      for (const term of terms) {
        const regex = new RegExp(`(${this.escapeRegex(term)})`, "gi");
        snippet = snippet.replace(regex, "<mark>$1</mark>");
      }
      return { ...result, snippet };
    });
  }

  /**
   * Execute multiple searches efficiently
   */
  searchBatch(queries: string[]): Record<string, SearchResult[]> {
    const results: Record<string, SearchResult[]> = {};
    for (const query of queries) {
      results[query] = this.search(query);
    }
    return results;
  }

  /**
   * Convert simple grep pattern to FTS5 query
   * Falls back to regex for complex patterns
   */
  grepToFTS(pattern: string): SearchResult[] {
    // Check if pattern is a simple word or phrase
    if (/^[\w\s]+$/.test(pattern)) {
      // Simple word/phrase - use FTS5 directly
      return this.search(pattern);
    }

    // Handle alternation pattern: error|warning
    if (/^\w+(\|\w+)+$/.test(pattern)) {
      const terms = pattern.split("|");
      const ftsQuery = terms.map(t => `"${t}"`).join(" OR ");
      return this.search(ftsQuery);
    }

    // Complex regex - fall back to manual search
    return this.regexFallback(pattern);
  }

  /**
   * Fallback regex search when FTS5 can't handle the pattern
   */
  private regexFallback(pattern: string): SearchResult[] {
    try {
      const validation = validateRegex(pattern);
      if (!validation.valid) return [];

      const regex = new RegExp(pattern, "i");
      const totalLines = this.db.getLineCount();
      const CHUNK_SIZE = 5000;
      const results: SearchResult[] = [];

      for (let start = 1; start <= totalLines; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, totalLines);
        const chunk = this.db.getLines(start, end);
        for (const line of chunk) {
          if (regex.test(line.content)) {
            results.push(line);
          }
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Extract actual search terms from FTS5 query
   */
  private extractSearchTerms(query: string): string[] {
    // Remove FTS5 operators and extract plain terms
    const cleaned = query
      .replace(/\bAND\b/gi, " ")
      .replace(/\bOR\b/gi, " ")
      .replace(/\bNOT\b/gi, " ")
      .replace(/\bNEAR\b/gi, " ")
      .replace(/[()]/g, " ")
      .replace(/"/g, "");

    return cleaned
      .split(/\s+/)
      .filter((t) => t.length > 0 && !/^\d+$/.test(t));
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

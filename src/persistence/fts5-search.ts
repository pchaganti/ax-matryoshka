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
   * Caps query terms and delegates to SessionDB for server-side FTS5 scoring.
   */
  searchByRelevance(query: string): SearchResult[] {
    const MAX_SEARCH_TERMS = 100;
    const cappedQuery = query.split(/\s+/).filter(t => t.length > 0).slice(0, MAX_SEARCH_TERMS).join(" ");
    return this.db.searchByRelevance(cappedQuery);
  }

  /**
   * HTML-escape user content so it's safe to wrap with highlight markup.
   * Must be applied BEFORE inserting the (sanitized) wrapper tags, or
   * any HTML in the original document leaks into the output verbatim.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Search with highlighted matches
   */
  searchWithHighlights(
    query: string,
    options: HighlightOptions = {}
  ): HighlightResult[] {
    // Sanitize tags to prevent XSS — strip all HTML tags except safe allowlist, event handlers, and JS URIs
    const ALLOWED_TAGS = /^<\/?(mark|b|i|em|strong|u|span|code|pre|small|sub|sup)(\s+class="[a-zA-Z0-9 _-]*")?\s*>$/i;
    const sanitizeTag = (tag: string) => {
      // Strip all HTML tags that aren't in our allowlist
      return tag.replace(/<[^>]*>/gi, (match) => ALLOWED_TAGS.test(match) ? match : "");
    };
    const openTag = sanitizeTag(options.openTag ?? "<mark>");
    const closeTag = sanitizeTag(options.closeTag ?? "</mark>");
    const results = this.db.searchRaw(query);

    // Extract search terms (handle phrases and operators)
    const terms = this.extractSearchTerms(query);

    const MAX_HIGHLIGHT_LENGTH = 100_000;
    return results.map((result) => {
      // Escape the document content first so any HTML in the source
      // becomes inert text. The highlight wrapper tags are applied AFTER
      // escaping and remain the only real HTML in the output.
      const truncated = result.content.length > MAX_HIGHLIGHT_LENGTH
        ? result.content.slice(0, MAX_HIGHLIGHT_LENGTH)
        : result.content;
      let highlighted = this.escapeHtml(truncated);
      for (const term of terms) {
        // Escape the term the same way so it matches the escaped content.
        const escapedTerm = this.escapeHtml(term);
        const regex = new RegExp(`(${this.escapeRegex(escapedTerm)})`, "gi");
        highlighted = highlighted.replace(regex, `${openTag}$1${closeTag}`);
        if (highlighted.length > MAX_HIGHLIGHT_LENGTH) {
          highlighted = highlighted.slice(0, MAX_HIGHLIGHT_LENGTH);
          break;
        }
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

    const MAX_SNIPPET_LENGTH = 100_000;
    return results.map((result) => {
      // Escape the document content before wrapping matches with <mark>,
      // same reasoning as searchWithHighlights.
      const truncated = result.content.length > MAX_SNIPPET_LENGTH
        ? result.content.slice(0, MAX_SNIPPET_LENGTH)
        : result.content;
      let snippet = this.escapeHtml(truncated);
      for (const term of terms) {
        const escapedTerm = this.escapeHtml(term);
        const regex = new RegExp(`(${this.escapeRegex(escapedTerm)})`, "gi");
        snippet = snippet.replace(regex, "<mark>$1</mark>");
        if (snippet.length > MAX_SNIPPET_LENGTH) {
          snippet = snippet.slice(0, MAX_SNIPPET_LENGTH);
          break;
        }
      }
      return { ...result, snippet };
    });
  }

  /**
   * Execute multiple searches efficiently
   */
  searchBatch(queries: string[]): Record<string, SearchResult[]> {
    const MAX_BATCH_SIZE = 100;
    const MAX_QUERY_LENGTH = 10_000;
    if (queries.length > MAX_BATCH_SIZE) {
      throw new Error(`Too many batch queries: ${queries.length} (max ${MAX_BATCH_SIZE})`);
    }
    const results: Record<string, SearchResult[]> = {};
    for (const query of queries) {
      if (query.length > MAX_QUERY_LENGTH) continue;
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
      const MAX_ALTERNATION_TERMS = 100;
      const terms = pattern.split("|").slice(0, MAX_ALTERNATION_TERMS);
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

      const MAX_FALLBACK_RESULTS = 10000;
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
            if (results.length >= MAX_FALLBACK_RESULTS) return results;
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
    const MAX_EXTRACTED_TERMS = 100;
    const cleaned = query
      .replace(/\bAND\b/gi, " ")
      .replace(/\bOR\b/gi, " ")
      .replace(/\bNOT\b/gi, " ")
      .replace(/\bNEAR\b/gi, " ")
      .replace(/[()]/g, " ")
      .replace(/"/g, "");

    return cleaned
      .split(/\s+/)
      .filter((t) => t.length > 0 && !/^\d+$/.test(t))
      .slice(0, MAX_EXTRACTED_TERMS);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

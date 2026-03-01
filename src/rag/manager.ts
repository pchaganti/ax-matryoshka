/**
 * RAG Manager for Few-Shot Synthesis
 *
 * Manages retrieval of expert examples and failure patterns
 * to help smaller models succeed in the Matryoshka loop.
 */

import {
  EXPERT_EXAMPLES,
  FAILURE_EXAMPLES,
  type ExpertExample,
  type FailureExample,
} from "./knowledge-base.js";
import {
  buildSearchIndex,
  searchIndex,
  type SearchIndex,
} from "./similarity.js";

/**
 * A hint to inject into the model's context
 */
export interface Hint {
  /** Type of hint */
  type: "pattern" | "pitfall" | "failure";

  /** Title/summary */
  title: string;

  /** The actual content */
  content: string;

  /** Relevance score (0-1) */
  score: number;
}

/**
 * Failure record for self-correction learning
 */
export interface FailureRecord {
  /** The query that was attempted */
  query: string;

  /** The code that failed */
  code: string;

  /** The error message */
  error: string;

  /** Timestamp */
  timestamp: number;

  /** Session ID for grouping */
  sessionId?: string;
}

/**
 * RAG Manager for retrieving and managing hints
 */
export class RAGManager {
  private searchIndex: SearchIndex;
  private failureMemory: FailureRecord[] = [];
  private readonly maxFailureMemory = 50;

  constructor() {
    // Build search index from expert examples
    const docs = EXPERT_EXAMPLES.map(ex => ({
      id: ex.id,
      text: `${ex.description} ${ex.keywords.join(" ")} ${ex.rationale}`,
      keywords: ex.keywords,
    }));

    this.searchIndex = buildSearchIndex(docs);
  }

  /**
   * Retrieve relevant hints for a query
   *
   * @param query - The user's natural language query
   * @param topK - Number of hints to retrieve
   * @returns Array of hints sorted by relevance
   */
  getHints(query: string, topK: number = 2): Hint[] {
    const hints: Hint[] = [];

    // Get relevant expert examples
    const results = searchIndex(this.searchIndex, query, topK);

    for (const result of results) {
      const example = EXPERT_EXAMPLES.find(ex => ex.id === result.id);
      if (example && result.score > 0.1) {  // Minimum relevance threshold
        hints.push({
          type: "pattern",
          title: example.description,
          content: this.formatExampleAsHint(example),
          score: result.score,
        });

        // Add pitfalls if present
        if (example.pitfalls && example.pitfalls.length > 0) {
          hints.push({
            type: "pitfall",
            title: `Pitfalls for: ${example.description}`,
            content: example.pitfalls.map(p => `- ${p}`).join("\n"),
            score: result.score * 0.8,  // Slightly lower priority
          });
        }
      }
    }

    // Check for relevant failure patterns
    const relevantFailures = this.getRelevantFailures(query);
    for (const failure of relevantFailures) {
      hints.push({
        type: "failure",
        title: `Avoid: ${failure.intent}`,
        content: this.formatFailureAsHint(failure),
        score: 0.5,  // Standard priority for failures
      });
    }

    // Sort by score and limit
    return hints
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Format an expert example as a hint for the model
   */
  private formatExampleAsHint(example: ExpertExample): string {
    return `**Suggested Pattern:**
\`\`\`javascript
${example.code}
\`\`\`

**Why this works:** ${example.rationale}`;
  }

  /**
   * Format a failure example as a hint
   */
  private formatFailureAsHint(failure: FailureExample): string {
    return `**Don't do this:**
\`\`\`javascript
${failure.badCode}
\`\`\`
Error: ${failure.error}

**Instead:** ${failure.fix}`;
  }

  /**
   * Get relevant failure patterns for a query
   */
  private getRelevantFailures(query: string): FailureExample[] {
    const lowerQuery = query.toLowerCase();
    const relevant: FailureExample[] = [];

    for (const failure of FAILURE_EXAMPLES) {
      // Check if query relates to this failure's intent
      const intentWords = failure.intent.toLowerCase().split(/\s+/);
      const matches = intentWords.filter(word =>
        lowerQuery.includes(word) || (word.length > 3 && lowerQuery.includes(word.slice(0, 4)))
      );

      if (matches.length >= 2) {
        relevant.push(failure);
      }
    }

    return relevant.slice(0, 2);  // Max 2 failure hints
  }

  /**
   * Record a failure for self-correction learning
   *
   * @param record - The failure to record
   */
  recordFailure(record: FailureRecord): void {
    // Cap code and error length to prevent memory exhaustion
    const MAX_CODE_LENGTH = 10_000;
    const MAX_ERROR_LENGTH = 2_000;
    if (record.code && record.code.length > MAX_CODE_LENGTH) {
      record = { ...record, code: record.code.slice(0, MAX_CODE_LENGTH) };
    }
    if (record.error && record.error.length > MAX_ERROR_LENGTH) {
      record = { ...record, error: record.error.slice(0, MAX_ERROR_LENGTH) };
    }
    if (!Number.isFinite(record.timestamp) || record.timestamp < 0) {
      record = { ...record, timestamp: Date.now() };
    }

    // Auto-prune stale failures older than 10 minutes before adding
    const staleCutoff = Date.now() - 10 * 60 * 1000;
    this.failureMemory = this.failureMemory.filter(f => f.timestamp > staleCutoff);

    this.failureMemory.push(record);

    // Prune old failures if over limit
    if (this.failureMemory.length > this.maxFailureMemory) {
      this.failureMemory = this.failureMemory.slice(-this.maxFailureMemory);
    }
  }

  /**
   * Get recent failures for a session (for self-correction)
   *
   * @param sessionId - Optional session to filter by
   * @param maxAge - Max age in milliseconds (default: 5 minutes)
   */
  getRecentFailures(
    sessionId?: string,
    maxAge: number = 5 * 60 * 1000
  ): FailureRecord[] {
    if (!Number.isFinite(maxAge) || maxAge < 0) {
      maxAge = 5 * 60 * 1000;
    }
    const cutoff = Date.now() - maxAge;

    return this.failureMemory.filter(f =>
      f.timestamp > cutoff &&
      (!sessionId || f.sessionId === sessionId)
    );
  }

  /**
   * Format hints for injection into system prompt
   *
   * @param hints - The hints to format
   * @returns Formatted string for prompt injection
   */
  formatHintsForPrompt(hints: Hint[]): string {
    if (hints.length === 0) {
      return "";
    }

    const parts: string[] = [
      "\n## RELEVANT PATTERNS FROM MEMORY\n",
      "Based on your task, here are successful patterns to follow:\n",
    ];

    // Group hints by type
    const patterns = hints.filter(h => h.type === "pattern");
    const pitfalls = hints.filter(h => h.type === "pitfall");
    const failures = hints.filter(h => h.type === "failure");

    // Add patterns
    for (const hint of patterns) {
      parts.push(`### ${hint.title}\n${hint.content}\n`);
    }

    // Add warnings
    if (pitfalls.length > 0 || failures.length > 0) {
      parts.push("\n### ⚠️ IMPORTANT WARNINGS\n");

      for (const hint of pitfalls) {
        parts.push(hint.content);
        parts.push("");
      }

      for (const hint of failures) {
        parts.push(`**${hint.title}**\n${hint.content}\n`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Generate self-correction feedback from recent failures
   */
  generateSelfCorrectionFeedback(sessionId?: string): string | null {
    const recentFailures = this.getRecentFailures(sessionId);

    if (recentFailures.length === 0) {
      return null;
    }

    const parts = [
      "\n## SELF-CORRECTION: Recent Mistakes to Avoid\n",
      "In this session, the following approaches have already failed:\n",
    ];

    for (const failure of recentFailures.slice(-3)) {  // Last 3 failures
      parts.push(`
**Failed Code:**
\`\`\`javascript
${(failure.code || "").slice(0, 200).replace(/`/g, "\\`")}${(failure.code?.length ?? 0) > 200 ? "..." : ""}
\`\`\`
**Error:** ${failure.error}

Do NOT repeat this approach. Try a different strategy.
`);
    }

    return parts.join("\n");
  }

  /**
   * Clear failure memory (e.g., at session end)
   */
  clearFailureMemory(sessionId?: string): void {
    if (sessionId) {
      this.failureMemory = this.failureMemory.filter(
        f => f.sessionId !== sessionId
      );
    } else {
      this.failureMemory = [];
    }
  }

  /**
   * Get statistics about the knowledge base
   */
  getStats(): {
    totalExamples: number;
    totalFailurePatterns: number;
    categories: string[];
    recentFailures: number;
  } {
    const categories = [...new Set(EXPERT_EXAMPLES.map(ex => ex.category))];

    return {
      totalExamples: EXPERT_EXAMPLES.length,
      totalFailurePatterns: FAILURE_EXAMPLES.length,
      categories,
      recentFailures: this.failureMemory.length,
    };
  }
}

/**
 * Singleton instance for global access
 */
let globalManager: RAGManager | null = null;

/**
 * Get or create the global RAG manager
 */
export function getRAGManager(): RAGManager {
  if (!globalManager) {
    globalManager = new RAGManager();
  }
  return globalManager;
}

/**
 * Create a new RAG manager (for testing)
 */
export function createRAGManager(): RAGManager {
  return new RAGManager();
}

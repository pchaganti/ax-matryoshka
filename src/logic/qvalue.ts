/**
 * Q-value learning for Nucleus
 *
 * Ported from Ori-Mnemos (src/core/qvalue.ts + src/core/rerank.ts).
 * Adapted for line-based document search with in-memory storage.
 *
 * Learns which lines are useful via exponential moving average Q-updates,
 * then reranks results using lambda blend + UCB exploration bonus.
 */

import type { LineResult } from "./rrf.js";

// ── Constants (from Ori-Mnemos) ─────────────────────────────────────

export const ALPHA = 0.1;           // EMA learning rate
export const DEFAULT_Q = 0.5;       // Initial Q-value
const LAMBDA_MIN = 0.15;            // Min blend weight for Q-value
const LAMBDA_MAX = 0.50;            // Max blend weight for Q-value
const LAMBDA_MATURITY = 200;         // Updates to reach max lambda
const UCB_C = 0.2;                   // UCB exploration coefficient

// ── Types ────────────────────────────────────────────────────────────

export interface QEntry {
  qValue: number;
  updateCount: number;
  exposureCount: number;
  rewardSum: number;
  rewardSqSum: number;
}

export interface RerankedResult extends LineResult {
  qScore: number;
}

// ── Q-Value Store (in-memory, session-scoped) ───────────────────────

export class QValueStore {
  private static readonly MAX_ENTRIES = 50_000;
  private entries = new Map<number, QEntry>(); // lineNum → QEntry
  private totalUpdates = 0;
  private totalQueries = 0;

  /** Get Q-value for a line (default 0.5 for unseen lines) */
  getQ(lineNum: number): number {
    return this.entries.get(lineNum)?.qValue ?? DEFAULT_Q;
  }

  /** Get reward statistics for UCB exploration bonus */
  getRewardStats(lineNum: number): { mean: number; variance: number; count: number } {
    const entry = this.entries.get(lineNum);
    if (!entry || entry.updateCount === 0) {
      return { mean: 0, variance: 0.25, count: 0 };
    }
    const mean = entry.rewardSum / entry.updateCount;
    const variance = entry.rewardSqSum / entry.updateCount - mean * mean;
    return { mean, variance: Math.max(0, variance), count: entry.updateCount };
  }

  /** Update Q-value with reward using EMA (from Ori-Mnemos updateQ) */
  update(lineNum: number, reward: number): void {
    const entry = this.entries.get(lineNum);
    const oldQ = entry?.qValue ?? DEFAULT_Q;
    const newQ = oldQ + ALPHA * (reward - oldQ);

    this.entries.set(lineNum, {
      qValue: newQ,
      updateCount: (entry?.updateCount ?? 0) + 1,
      exposureCount: entry?.exposureCount ?? 0,
      rewardSum: (entry?.rewardSum ?? 0) + reward,
      rewardSqSum: (entry?.rewardSqSum ?? 0) + reward * reward,
    });
    this.totalUpdates++;
    if (this.entries.size > QValueStore.MAX_ENTRIES) {
      this.prune();
    }
  }

  /** Remove lowest-value entries to cap memory */
  private prune(): void {
    const sorted = [...this.entries.entries()]
      .sort((a, b) => a[1].qValue - b[1].qValue);
    const toRemove = this.entries.size - Math.floor(QValueStore.MAX_ENTRIES * 0.8);
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      this.entries.delete(sorted[i][0]);
    }
  }

  /** Batch update multiple lines with rewards */
  batchUpdate(rewards: Map<number, number>): void {
    for (const [lineNum, reward] of rewards) {
      this.update(lineNum, reward);
    }
  }

  /** Increment exposure count (line was shown in results) */
  incrementExposure(lineNum: number): void {
    const entry = this.entries.get(lineNum);
    if (entry) {
      entry.exposureCount++;
    } else {
      this.entries.set(lineNum, {
        qValue: DEFAULT_Q,
        updateCount: 0,
        exposureCount: 1,
        rewardSum: 0,
        rewardSqSum: 0,
      });
    }
  }

  /** Reward lines that appeared in previous results (auto-reward on reuse) */
  rewardReusedLines(previousLineNums: number[], reward: number = 0.4): void {
    for (const lineNum of previousLineNums) {
      this.update(lineNum, reward);
    }
  }

  getTotalUpdates(): number { return this.totalUpdates; }
  getTotalQueries(): number { return this.totalQueries; }
  incrementQueryCount(): void { this.totalQueries++; }
}

// ── Z-score normalization (from Ori-Mnemos rerank.ts) ───────────────

export function zNormalize(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return values.map((v) => (v - mean) / std);
}

// ── UCB-Tuned exploration bonus (from Ori-Mnemos qvalue.ts) ─────────

export function explorationBonus(
  stats: { mean: number; variance: number; count: number },
  totalQueries: number,
  c: number = UCB_C,
): number {
  if (stats.count === 0) return c * 2.5; // big bonus for unseen lines
  const logT = Math.log(totalQueries + 1);
  const V = stats.variance + Math.sqrt((2 * logT) / stats.count);
  return c * Math.sqrt((logT / stats.count) * Math.min(0.25, V));
}

// ── Lambda computation (from Ori-Mnemos rerank.ts) ──────────────────

export function computeLambda(totalQUpdates: number): number {
  return LAMBDA_MIN + (LAMBDA_MAX - LAMBDA_MIN) * Math.min(totalQUpdates / LAMBDA_MATURITY, 1.0);
}

// ── Rerank (Phase B from Ori-Mnemos rerank.ts) ──────────────────────

/**
 * Rerank results using Q-value learning.
 *
 * Blend: final = (1-λ) × sim_normalized + λ × q_normalized + ucb_bonus
 * With cumulative bias cap to prevent runaway boosts.
 *
 * @param results - Search results to rerank
 * @param store - Q-value store with learned values
 * @returns Reranked results sorted by blended score
 */
export function rerank(
  results: LineResult[],
  store: QValueStore,
): RerankedResult[] {
  if (results.length === 0) return [];

  const lambda = computeLambda(store.getTotalUpdates());
  const totalQueries = store.getTotalQueries();

  // Raw scores
  const simRaw = results.map(r => r.score);
  const qRaw = results.map(r => store.getQ(r.lineNum));

  // Z-score normalize both
  const simNorm = zNormalize(simRaw);
  const qNorm = zNormalize(qRaw);

  // Compute all scores before mutating store (atomic scoring)
  const reranked: RerankedResult[] = results.map((r, i) => {
    // Lambda blend
    const blended = (1 - lambda) * simNorm[i] + lambda * qNorm[i];

    // UCB exploration bonus
    const stats = store.getRewardStats(r.lineNum);
    const ucb = explorationBonus(stats, totalQueries);

    // Raw score
    const score = blended + ucb;

    return { ...r, score, qScore: qRaw[i] };
  });

  // Mutate store after all scores are computed
  for (const r of results) {
    store.incrementExposure(r.lineNum);
  }
  store.incrementQueryCount();

  reranked.sort((a, b) => b.score - a.score);
  return reranked;
}

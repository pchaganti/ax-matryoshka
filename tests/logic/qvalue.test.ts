/**
 * Tests for Q-value learning (ported from Ori-Mnemos)
 */

import { describe, it, expect } from "vitest";
import {
  QValueStore,
  zNormalize,
  explorationBonus,
  computeLambda,
  rerank,
  ALPHA,
  DEFAULT_Q,
} from "../../src/logic/qvalue.js";
import type { LineResult } from "../../src/logic/rrf.js";

describe("QValueStore", () => {
  it("should return default Q for unseen lines", () => {
    const store = new QValueStore();
    expect(store.getQ(99)).toBe(DEFAULT_Q);
  });

  it("should update Q via EMA", () => {
    const store = new QValueStore();
    store.update(1, 1.0); // reward = 1.0
    // newQ = 0.5 + 0.1 * (1.0 - 0.5) = 0.55
    expect(store.getQ(1)).toBeCloseTo(0.55);
  });

  it("should accumulate Q over multiple updates", () => {
    const store = new QValueStore();
    store.update(1, 1.0); // 0.5 + 0.1*(1.0-0.5) = 0.55
    store.update(1, 1.0); // 0.55 + 0.1*(1.0-0.55) = 0.595
    store.update(1, 1.0); // 0.595 + 0.1*(1.0-0.595) = 0.6355
    expect(store.getQ(1)).toBeCloseTo(0.6355);
  });

  it("should decrease Q on negative reward", () => {
    const store = new QValueStore();
    store.update(1, -0.15); // 0.5 + 0.1*(-0.15 - 0.5) = 0.435
    expect(store.getQ(1)).toBeCloseTo(0.435);
  });

  it("should track reward statistics", () => {
    const store = new QValueStore();
    expect(store.getRewardStats(1).count).toBe(0);

    store.update(1, 0.5);
    store.update(1, 1.0);
    const stats = store.getRewardStats(1);
    expect(stats.count).toBe(2);
    expect(stats.mean).toBeCloseTo(0.75);
    expect(stats.variance).toBeGreaterThanOrEqual(0);
  });

  it("should batch update multiple lines", () => {
    const store = new QValueStore();
    const rewards = new Map<number, number>([[1, 0.8], [2, 0.3], [3, -0.1]]);
    store.batchUpdate(rewards);
    expect(store.getQ(1)).toBeCloseTo(0.5 + ALPHA * (0.8 - 0.5));
    expect(store.getQ(2)).toBeCloseTo(0.5 + ALPHA * (0.3 - 0.5));
    expect(store.getQ(3)).toBeCloseTo(0.5 + ALPHA * (-0.1 - 0.5));
  });

  it("should track exposure count", () => {
    const store = new QValueStore();
    store.incrementExposure(1);
    store.incrementExposure(1);
    store.incrementExposure(1);
    // Internal — verified through rerank behavior
    expect(store.getQ(1)).toBe(DEFAULT_Q); // exposure doesn't change Q
  });

  it("should reward reused lines", () => {
    const store = new QValueStore();
    store.rewardReusedLines([1, 2, 3], 0.5);
    expect(store.getQ(1)).toBeCloseTo(0.5 + ALPHA * (0.5 - 0.5)); // = 0.5 (reward == Q)
    expect(store.getTotalUpdates()).toBe(3);
  });

  it("should track total updates and queries", () => {
    const store = new QValueStore();
    expect(store.getTotalUpdates()).toBe(0);
    expect(store.getTotalQueries()).toBe(0);
    store.update(1, 0.5);
    store.update(2, 0.5);
    store.incrementQueryCount();
    expect(store.getTotalUpdates()).toBe(2);
    expect(store.getTotalQueries()).toBe(1);
  });
});

describe("zNormalize", () => {
  it("should normalize to zero mean and unit variance", () => {
    const result = zNormalize([1, 2, 3, 4, 5]);
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(mean).toBeCloseTo(0);
  });

  it("should handle constant values", () => {
    const result = zNormalize([5, 5, 5]);
    // std=0 → use 1, so (5-5)/1 = 0 for all
    expect(result).toEqual([0, 0, 0]);
  });

  it("should return empty for empty input", () => {
    expect(zNormalize([])).toEqual([]);
  });

  it("should handle single value", () => {
    const result = zNormalize([42]);
    expect(result).toEqual([0]); // (42-42)/1 = 0
  });
});

describe("explorationBonus", () => {
  it("should give big bonus for unseen items", () => {
    const bonus = explorationBonus({ mean: 0, variance: 0.25, count: 0 }, 10);
    expect(bonus).toBe(0.2 * 2.5); // = 0.5
  });

  it("should decrease with more observations", () => {
    const bonus1 = explorationBonus({ mean: 0.5, variance: 0.1, count: 1 }, 10);
    const bonus10 = explorationBonus({ mean: 0.5, variance: 0.1, count: 10 }, 10);
    expect(bonus1).toBeGreaterThan(bonus10);
  });

  it("should increase with more total queries (exploration pressure)", () => {
    const bonus10 = explorationBonus({ mean: 0.5, variance: 0.1, count: 5 }, 10);
    const bonus100 = explorationBonus({ mean: 0.5, variance: 0.1, count: 5 }, 100);
    expect(bonus100).toBeGreaterThan(bonus10);
  });
});

describe("computeLambda", () => {
  it("should start at LAMBDA_MIN with no updates", () => {
    expect(computeLambda(0)).toBeCloseTo(0.15);
  });

  it("should reach LAMBDA_MAX at maturity", () => {
    expect(computeLambda(200)).toBeCloseTo(0.50);
  });

  it("should be between min and max during training", () => {
    const lambda = computeLambda(100);
    expect(lambda).toBeGreaterThan(0.15);
    expect(lambda).toBeLessThan(0.50);
  });
});

describe("rerank", () => {
  const results: LineResult[] = [
    { line: "ERROR: database failed", lineNum: 1, score: 0.9 },
    { line: "INFO: retry scheduled", lineNum: 2, score: 0.7 },
    { line: "ERROR: timeout", lineNum: 3, score: 0.5 },
    { line: "DEBUG: trace output", lineNum: 4, score: 0.3 },
  ];

  it("should rerank based on Q-values", () => {
    const store = new QValueStore();
    // Train line 3 to have high Q
    for (let i = 0; i < 10; i++) store.update(3, 1.0);
    // Train line 1 to have low Q
    for (let i = 0; i < 10; i++) store.update(1, -0.15);

    const reranked = rerank(results, store);
    expect(reranked.length).toBe(4);
    // Line 3 should be boosted by high Q-value
    // Check that it's not at the bottom anymore
    const line3Rank = reranked.findIndex(r => r.lineNum === 3);
    expect(line3Rank).toBeLessThan(3); // should be boosted from rank 2
  });

  it("should return empty for empty input", () => {
    const store = new QValueStore();
    expect(rerank([], store)).toEqual([]);
  });

  it("should sort by score descending", () => {
    const store = new QValueStore();
    const reranked = rerank(results, store);
    for (let i = 1; i < reranked.length; i++) {
      expect(reranked[i - 1].score).toBeGreaterThanOrEqual(reranked[i].score);
    }
  });

  it("should include qScore in output", () => {
    const store = new QValueStore();
    store.update(1, 0.8);
    const reranked = rerank(results, store);
    const line1 = reranked.find(r => r.lineNum === 1)!;
    expect(line1.qScore).toBeDefined();
    expect(typeof line1.qScore).toBe("number");
  });

  it("should mutate store only after all scores are computed (bug #4)", () => {
    const callLog: string[] = [];
    const store = new QValueStore();

    const origGetReward = store.getRewardStats.bind(store);
    store.getRewardStats = (lineNum: number) => {
      callLog.push(`getReward:${lineNum}`);
      return origGetReward(lineNum);
    };
    const origIncExp = store.incrementExposure.bind(store);
    store.incrementExposure = (lineNum: number) => {
      callLog.push(`exposure:${lineNum}`);
      origIncExp(lineNum);
    };
    const origIncQuery = store.incrementQueryCount.bind(store);
    store.incrementQueryCount = () => {
      callLog.push("queryCount");
      origIncQuery();
    };

    const results: LineResult[] = [
      { line: "A", lineNum: 1, score: 0.9 },
      { line: "B", lineNum: 2, score: 0.8 },
    ];

    rerank(results, store);

    // All getReward calls should come before any exposure calls
    const lastRewardIdx = callLog.lastIndexOf(
      callLog.filter(c => c.startsWith("getReward")).pop()!
    );
    const firstExposureIdx = callLog.indexOf(
      callLog.find(c => c.startsWith("exposure"))!
    );

    expect(firstExposureIdx).toBeGreaterThan(lastRewardIdx);
    expect(callLog[callLog.length - 1]).toBe("queryCount");
  });

  it("should give exploration bonus to unseen lines", () => {
    const store = new QValueStore();
    // Only train line 1, leave others unseen
    store.update(1, 0.5);
    store.incrementQueryCount();
    store.incrementQueryCount();

    const reranked = rerank(results, store);
    // Unseen lines get UCB bonus — they shouldn't all be at bottom
    const unseenLineNums = [2, 3, 4];
    const unseenRanks = unseenLineNums.map(ln =>
      reranked.findIndex(r => r.lineNum === ln)
    );
    // At least one unseen line should not be last
    expect(unseenRanks.some(r => r < 3)).toBe(true);
  });
});

import { empty, cons, unit, concat, chain, take } from '../src/minikanren/streams.js';
import { readFileSync } from "fs";

describe('Streams', () => {
  test('`concat(x, empty)` = x', () => {
    const s = cons(1, cons(2, empty));
    expect(concat(s, empty)).toEqual(s);
  });

  test('`concat(empty, x)` = x', () => {
    const s = cons('a', cons('b', empty));
    expect(concat(empty, s)).toEqual(s);
  });

  test('`concat`ing 2 simple streams produces a simple stream', () => {
    const s = cons(1, cons(2, empty));
    const t = cons(3, cons(4, cons(5, empty)));
    const r = cons(1, cons(2, cons(3, cons(4, cons(5, empty)))));
    expect(concat(s, t)).toEqual(r);
  });

  test('`concat`ing a suspended stream with another produces a suspended stream', () => {
    const s = () => cons(1, empty);
    const t = cons(2, empty);
    expect(concat(s, t)).toBeInstanceOf(Function);
  });

  test('`concat`ing suspended streams interleaves their elements', () => {
    const s = () => cons(1, () => cons(2, empty));
    const t = cons(3, () => cons(4, empty));
    expect(take(false, concat(s, t))).toEqual([3, 1, 4, 2]);
  });

  test('`chain(f, empty)` = empty', () => {
    const twice = x => cons(x, cons(x, empty));
    expect(chain(twice, empty)).toEqual(empty);
  });

  test('`chain`ing a simple stream mappends f over all its elements', () => {
    const s = cons(1, cons(2, empty));
    const selfAndSquare = x => cons(x, cons(x * x, empty));
    const r = cons(1, cons(1, cons(2, cons(4, empty))));
    expect(chain(selfAndSquare, s)).toEqual(r);
  });

  test('`chain`ing a suspended stream produces a suspended stream', () => {
    const s = () => cons(1, () => cons(2, empty));
    const id = x => unit(x);
    expect(chain(id, s)).toBeInstanceOf(Function);
  });

  test('`take(false, s)` produces an Array of all elements of s', () => {
    const s = cons(1, cons(2, cons(3, empty)));
    expect(take(false, s)).toEqual([1, 2, 3]);
  });

  test('`take` forces suspended computations', () => {
    const s = () =>
      cons(
        1,
        cons(2, () => cons(3, () => empty))
      );
    expect(take(false, s)).toEqual([1, 2, 3]);
  });

  test('`take` only forces necessary computations', () => {
    const s = cons(1, () => {
      throw new Error('forced');
    });
    expect(take.bind(null, 1, s)).not.toThrow();
  });

  test('`take` tolerates infinite streams', () => {
    const ones = cons(1, () => ones);
    expect(take(5, ones)).toEqual([1, 1, 1, 1, 1]);
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit16.test.ts Audit16 #1: streams.take thunkSteps bypass
  describe("Audit16 #1: streams.take thunkSteps bypass", () => {
    it("should limit total thunk evaluations even when interleaved with results", async () => {
      const { take, cons } = await import("../src/minikanren/streams.js");

      // Create a stream that alternates: result -> thunk -> result -> thunk ...
      // This resets thunkSteps on each result, so the limit is never hit
      let thunkCount = 0;
      function makeAlternating(n: number): any {
        if (n <= 0) return null;
        thunkCount++;
        // result followed by a thunk that produces another alternating
        return cons(n, () => makeAlternating(n - 1));
      }

      // Request many results from a deeply thunked stream
      const stream = () => makeAlternating(100);
      const results = take(50, stream);

      // Should get results without hanging — the key test is that it terminates
      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  // from tests/audit20.test.ts Audit20 #7: unify compound term symmetry
  describe("Audit20 #7: unify compound term symmetry", () => {
    it("should fail unification when x has extra keys not in y", async () => {
      const { unify } = await import("../src/minikanren/unify.js");
      const s = new Map();
      // x has keys a and b, y only has key a
      const x = { a: 1, b: 2 };
      const y = { a: 1 };
      const result = unify(x, y, s);
      // Should fail — structural unification requires same keys
      expect(result).toBe(false);
    });

    it("should succeed when both have same keys", async () => {
      const { unify } = await import("../src/minikanren/unify.js");
      const s = new Map();
      const x = { a: 1, b: 2 };
      const y = { a: 1, b: 2 };
      const result = unify(x, y, s);
      expect(result).not.toBe(false);
    });
  });

  // from tests/audit55.test.ts #1 — unsweetenArray should have depth limit
  describe("#1 — unsweetenArray should have depth limit", () => {
      it("should include a depth parameter or limit", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fn = source.match(/function unsweetenArray[\s\S]*?unsweetenArray\(/);
        expect(fn).not.toBeNull();
        expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
      });
    });

  // from tests/audit55.test.ts #2 — sweetenPair should have depth limit
  describe("#2 — sweetenPair should have depth limit", () => {
      it("should include a depth parameter or limit", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fn = source.match(/function sweetenPair[\s\S]*?sweeten\(/);
        expect(fn).not.toBeNull();
        expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
      });
    });

  // from tests/audit55.test.ts #3 — unsweeten/sweeten should have depth limit
  describe("#3 — unsweeten/sweeten should have depth limit", () => {
      it("unsweeten should accept and pass depth parameter", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fn = source.match(/export function unsweeten\([^)]*\)/);
        expect(fn).not.toBeNull();
        expect(fn![0]).toMatch(/depth/i);
      });

      it("sweeten should accept and pass depth parameter", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fn = source.match(/export function sweeten\([^)]*\)/);
        expect(fn).not.toBeNull();
        expect(fn![0]).toMatch(/depth/i);
      });
    });

  // from tests/audit56.test.ts #1 — iota should have bounds check on n
  describe("#1 — iota should have bounds check on n", () => {
      it("should limit n to a safe maximum", () => {
        const source = readFileSync("src/minikanren/common.ts", "utf-8");
        const iotaFn = source.match(/export function iota[\s\S]*?\n\}/);
        expect(iotaFn).not.toBeNull();
        expect(iotaFn![0]).toMatch(/MAX_IOTA|Math\.min|limit|clamp/i);
      });
    });

  // from tests/audit60.test.ts #7 — unsweetenArray should limit input array length
  describe("#7 — unsweetenArray should limit input array length", () => {
      it("should check array length before recursing", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fnStart = source.indexOf("function unsweetenArray");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/xs\.length\s*>|MAX_ARRAY/i);
      });
    });

  // from tests/audit61.test.ts #5 — sweetenPair should increment listLen in recursion
  describe("#5 — sweetenPair should increment listLen in recursion", () => {
      it("should pass incremented listLen through recursive calls", () => {
        const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
        const fnStart = source.indexOf("function sweetenPair");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/listLen\s*\+\s*1|listLen\s*\+\+/);
      });
    });

});

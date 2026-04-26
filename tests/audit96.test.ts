/**
 * Audit #96 — Chiasmus review round 2
 *
 * Issues found by chiasmus_review of matryoshka codebase.
 *
 * 1. HIGH lc-solver.ts — regex flag inconsistency in match/extract/evaluatePredicate
 *    (filter match case-sensitive, but grep+extract case-insensitive)
 * 2. MEDIUM lc-solver.ts — (sum RESULTS) silently sums ALL numbers per grep line
 *    (should take the first numeric token only)
 * 3. MEDIUM lc-solver.ts — module-level lastContext/lastContextLines cache leaks
 *    across SolverTools instances; move lines onto SolverTools itself
 * 4. MEDIUM handle-session.ts — execute() re-serializes the whole array just to
 *    compute a token-savings estimate, defeating the point of handle storage
 * 5. MEDIUM handle-session.ts — redundant eviction guard in execute() duplicates
 *    HandleRegistry.store's own guard; delete the dead check
 * 6. MEDIUM handle-session.ts — expand() returns totalTokens=0 when sliced is
 *    empty but total > 0 (e.g., offset past end)
 * 7. MEDIUM symbol-graph.ts — neighborhood() only walks pure-out or pure-in
 *    paths from the root; misses mixed paths (out→in, in→out). Comment says
 *    "both directions" but implementation doesn't match.
 * 8. MEDIUM parser-registry.ts — shared-parser state across languages (no test,
 *    refactor-only; regression covered by existing tree-sitter suite)
 * 9. MEDIUM sandbox.ts — grep does O(N×L) prefix scan for line numbers (no
 *    test, pure optimization; regression covered by sandbox suite)
 * 10. LOW fts5-search.ts — searchWithHighlights passes raw content through to
 *     the highlighted field, allowing HTML in the document to leak into the
 *     output unescaped
 * 11. LOW lc-parser.ts — parseAll tracks a single depth counter across
 *     `()`, `[]`, `{}` so mismatched brackets yield confusing slices
 * 12. LOW lc-parser.ts — tokenize silently drops tokens past MAX_TOKENS;
 *     should throw so the caller sees an explicit "too large" error
 * 13. LOW lc-solver.ts — findDistinguishingPattern fallback word bypasses
 *     validateRegex (defensive structural guard, not exploitable today)
 * 14. LOW nucleus-engine.ts — setBinding regex rejects hyphens, but auto-
 *     registration of synthesized functions emits `_fn_parse-date`-style
 *     keys; unify on the hyphen-allowing regex
 * 15. LOW lattice-mcp-server.ts, mcp-server.ts, config.ts — `.includes("..")`
 *     path-traversal guards false-positive on legitimate filenames like
 *     `readme..txt`; should be segment-aware
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NucleusEngine } from "../src/engine/nucleus-engine.js";
import type { LCTerm } from "../src/logic/types.js";
import { solve, type SolverTools } from "../src/logic/lc-solver.js";
import { HandleSession } from "../src/engine/handle-session.js";
import { SessionDB } from "../src/persistence/session-db.js";
import { SymbolGraph } from "../src/graph/symbol-graph.js";
import type { Symbol } from "../src/treesitter/types.js";
import { FTS5Search } from "../src/persistence/fts5-search.js";
import { parseAll, parse } from "../src/logic/lc-parser.js";
import { hasTraversalSegment } from "../src/utils/path-safety.js";

describe("Audit #96 — Chiasmus review round 2", () => {
  // =========================================================================
  // #1 HIGH — regex flag consistency in match/predicate
  // =========================================================================
  describe("#1 — match should be case-insensitive like grep", () => {
    let engine: NucleusEngine;

    beforeEach(() => {
      engine = new NucleusEngine();
      engine.loadContent([
        "Error 500: Internal Server Error",
        "WARNING: disk space low",
        "info: all systems nominal",
        "FATAL: database connection lost",
      ].join("\n"));
    });

    it("top-level (match \"Error\" \"error\" 0) returns match (case-insensitive)", async () => {
      // This hits evaluate() match case at lc-solver.ts:547
      const result = await engine.execute('(match "Error 500" "error" 0)');
      expect(result.success).toBe(true);
      // Case-insensitive regex matches "Error"
      expect(result.value).not.toBeNull();
      expect(typeof result.value).toBe("string");
      expect((result.value as string).toLowerCase()).toBe("error");
    });

    it("(filter RESULTS (lambda x (match x \"error\" 0))) keeps upper-case matches", async () => {
      // This hits evaluatePredicate match case at lc-solver.ts:1078
      const grepResult = await engine.execute('(grep "error")');
      expect(grepResult.success).toBe(true);
      // Grep is case-insensitive — finds "Error 500" and "Error" in "Internal Server Error"
      expect(Array.isArray(grepResult.value)).toBe(true);

      const filterResult = await engine.execute(
        '(filter RESULTS (lambda x (match x "error" 0)))'
      );
      expect(filterResult.success).toBe(true);
      expect(Array.isArray(filterResult.value)).toBe(true);
      const kept = filterResult.value as Array<{ line: string }>;
      // The "Error 500: Internal Server Error" line should survive —
      // its source line contains uppercase "Error", and filter match must
      // match case-insensitively.
      const hasError500 = kept.some((r) => r.line.includes("Error 500"));
      expect(hasError500).toBe(true);
    });

    it("(map RESULTS (lambda x (match x \"fatal\" 0))) matches upper-case FATAL", async () => {
      // This hits evaluateWithBinding match case at lc-solver.ts:1184
      const grepResult = await engine.execute('(grep "fatal")');
      expect(grepResult.success).toBe(true);

      const mapResult = await engine.execute(
        '(map RESULTS (lambda x (match x "fatal" 0)))'
      );
      expect(mapResult.success).toBe(true);
      expect(Array.isArray(mapResult.value)).toBe(true);
      const mapped = mapResult.value as Array<string | null>;
      // At least one non-null entry — the FATAL line should produce a match
      const nonNull = mapped.filter((v) => v !== null);
      expect(nonNull.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // #2 MEDIUM — (sum RESULTS) should take first numeric token per line
  // =========================================================================
  describe("#2 — sum over grep results takes first numeric token only", () => {
    function makeTools(lines: string[]): SolverTools {
      return {
        grep: () =>
          lines.map((line, i) => ({
            match: line,
            line,
            lineNum: i + 1,
            index: 0,
            groups: [],
          })),
        fuzzy_search: () => [],
        bm25: () => [],
        semantic: () => [],
        text_stats: () => ({
          length: 0,
          lineCount: lines.length,
          sample: { start: "", middle: "", end: "" },
        }),
        context: lines.join("\n"),
        lines,
      };
    }

    it("sums $100 + $200, NOT $100+5 + $200+10 (multi-number line)", async () => {
      // Before the fix: regex accumulates ALL numbers per line:
      //   Line 1: 100 + 5 = 105
      //   Line 2: 200 + 10 = 210
      //   Total = 315
      // After the fix: take first number per line only:
      //   Line 1: 100
      //   Line 2: 200
      //   Total = 300
      const tools = makeTools(["Item: $100 Qty: 5", "Item: $200 Qty: 10"]);
      const term: LCTerm = {
        tag: "sum",
        collection: { tag: "grep", pattern: "Item" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(300);
    });

    it("sums error code 500 + error code 404 = 904 (no currency case)", async () => {
      // Before the fix: "Error 500: timeout 30s" would sum 500+30 = 530
      //                 "Error 404: attempt 2 of 3" would sum 404+2+3 = 409
      //                 Total = 939 (garbage)
      // After the fix: takes first number per line:
      //                 500 + 404 = 904
      const tools = makeTools([
        "Error 500: timeout 30s",
        "Error 404: attempt 2 of 3",
      ]);
      const term: LCTerm = {
        tag: "sum",
        collection: { tag: "grep", pattern: "Error" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(904);
    });

    it("plain numeric-string entries still parse correctly (no regression)", async () => {
      // Plain strings go through the `typeof val === "string"` branch, not
      // the grep-object branch. Verify that branch is unaffected by the fix.
      const stringEngine = new NucleusEngine();
      stringEngine.loadContent("$1,000\n$2,500.50");
      const result = await stringEngine.execute("(sum (lines 1 2))");
      expect(result.success).toBe(true);
      expect(result.value).toBe(3500.5);
    });
  });

  // =========================================================================
  // #3 MEDIUM — (lines N M) reads from SolverTools, not a module-level cache
  // =========================================================================
  describe("#3 — (lines) uses SolverTools.lines, no cross-session leak", () => {
    function makeTools(context: string, lines: string[]): SolverTools {
      return {
        grep: () => [],
        fuzzy_search: () => [],
        bm25: () => [],
        semantic: () => [],
        text_stats: () => ({
          length: context.length,
          lineCount: lines.length,
          sample: { start: "", middle: "", end: "" },
        }),
        context,
        lines,
      };
    }

    it("(lines 1 2) respects tools.lines even when it diverges from context", async () => {
      // Intentionally construct a tools object where `context` would, if
      // re-split, produce a DIFFERENT array than `lines`. The solver must
      // trust `tools.lines` rather than falling back to a cached reparse of
      // `tools.context` (which is exactly what the old module-level cache did).
      const tools = makeTools("aaa\nbbb\nccc", ["XXX", "YYY", "ZZZ"]);
      const term: LCTerm = { tag: "lines", start: 1, end: 2 };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toEqual(["XXX", "YYY"]);
    });

    it("two tools instances do not leak state between each other", async () => {
      // Call A with one tools, then B with another. If A's call cached data
      // at module scope, B's call could accidentally see it.
      const toolsA = makeTools("line 1\nline 2", ["alpha", "beta"]);
      const toolsB = makeTools("line 3\nline 4", ["gamma", "delta"]);
      const term: LCTerm = { tag: "lines", start: 1, end: 2 };

      const resultA1 = await solve(term, toolsA);
      const resultB = await solve(term, toolsB);
      const resultA2 = await solve(term, toolsA);

      expect(resultA1.value).toEqual(["alpha", "beta"]);
      expect(resultB.value).toEqual(["gamma", "delta"]);
      expect(resultA2.value).toEqual(["alpha", "beta"]);
    });
  });

  // =========================================================================
  // #4 MEDIUM — execute() should not re-serialize full array for token metadata
  // =========================================================================
  describe("#4 — execute() uses DB-side byte size, not full JSON.stringify", () => {
    it("SessionDB.getHandleDataByteSize returns the sum of stored data sizes", async () => {
      const db = new SessionDB();
      // createHandle stores each item as JSON via JSON.stringify
      const handle = db.createHandle(["hello", "world", 42]);
      // JSON-stringified rows: "\"hello\"" (7) + "\"world\"" (7) + "42" (2) = 16
      const size = db.getHandleDataByteSize(handle);
      expect(size).toBe(16);
      db.close();
    });

    it("getHandleDataByteSize returns 0 for unknown handle", async () => {
      const db = new SessionDB();
      expect(db.getHandleDataByteSize("$res999")).toBe(0);
      db.close();
    });

    it("execute() routes token-metadata sizing through SessionDB, not JSON.stringify", async () => {
      const session = new HandleSession();
      session.loadContent(
        Array.from({ length: 500 }, (_, i) => `line ${i} some content`).join("\n"),
      );

      // Spy on the DB method we just added. If execute() still reaches for
      // JSON.stringify(result.value), this spy will never fire. That pins
      // the refactor: future edits that drop the DB path would fail here.
      const dbSpy = vi.spyOn(SessionDB.prototype, "getHandleDataByteSize");

      const result = await session.execute('(grep "line")');

      expect(result.success).toBe(true);
      expect(result.handle).toBeDefined();
      expect(result.tokenMetadata).toBeDefined();
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(0);
      expect(result.tokenMetadata!.stubTokens).toBeGreaterThan(0);
      expect(result.tokenMetadata!.savingsPercent).toBeGreaterThanOrEqual(0);

      // The fix must route through the DB — at least one call, with the
      // freshly-created handle as the argument.
      expect(dbSpy).toHaveBeenCalled();
      const calledWithHandle = dbSpy.mock.calls.some(
        (args) => args[0] === result.handle,
      );
      expect(calledWithHandle).toBe(true);

      dbSpy.mockRestore();
      session.close();
    });

    it("token metadata remains directionally correct (large result → high savings)", async () => {
      const session = new HandleSession();
      session.loadContent(
        Array.from({ length: 200 }, (_, i) => `match ${i} some text`).join("\n"),
      );
      const result = await session.execute('(grep "match")');

      expect(result.success).toBe(true);
      expect(result.tokenMetadata).toBeDefined();
      // Stub is small, full data is large → savings should be substantial
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(
        result.tokenMetadata!.stubTokens,
      );
      expect(result.tokenMetadata!.savingsPercent).toBeGreaterThan(50);

      session.close();
    });
  });

  // =========================================================================
  // #6 MEDIUM — expand() reports totalTokens > 0 when offset is past end
  // =========================================================================
  describe("#6 — expand() reports non-zero totalTokens when slice is empty", () => {
    it("offset past end returns empty slice but still reports true total size", async () => {
      const session = new HandleSession();
      session.loadContent("alpha\nbeta\ngamma\ndelta\nepsilon");
      const grep = await session.execute('(grep "a")');
      expect(grep.success).toBe(true);
      expect(grep.handle).toBeDefined();

      // Grab the real total from metadata first
      const fullExpand = session.expand(grep.handle!);
      expect(fullExpand.success).toBe(true);
      expect(fullExpand.total).toBeGreaterThan(0);
      expect(fullExpand.tokenMetadata!.totalTokens).toBeGreaterThan(0);

      // Now expand with offset past the end of the data
      const beyond = session.expand(grep.handle!, {
        offset: fullExpand.total! + 100,
        limit: 10,
      });
      expect(beyond.success).toBe(true);
      expect(beyond.data!.length).toBe(0);
      // total should still reflect the handle's real count
      expect(beyond.total).toBe(fullExpand.total);
      // BUG: before the fix, totalTokens was 0 because the computation
      // divided by sliced.length which was 0. The LLM would then conclude
      // "the handle is empty" and make bad decisions.
      expect(beyond.tokenMetadata!.totalTokens).toBeGreaterThan(0);
      expect(beyond.tokenMetadata!.totalTokens).toBe(
        fullExpand.tokenMetadata!.totalTokens,
      );

      session.close();
    });

    it("limit=0 returns empty slice but still reports true total size", async () => {
      const session = new HandleSession();
      session.loadContent("alpha\nbeta\ngamma");
      const grep = await session.execute('(grep "a")');
      expect(grep.success).toBe(true);

      const full = session.expand(grep.handle!);
      const empty = session.expand(grep.handle!, { limit: 0 });
      expect(empty.success).toBe(true);
      expect(empty.data!.length).toBe(0);
      expect(empty.total).toBeGreaterThan(0);
      // Before the fix: returnedTokens for JSON.stringify([]) = "[]" = 2
      // chars ≈ 1 token. The empty-slice fallback clamped totalTokens to 1
      // regardless of how much data was actually stored.
      expect(empty.tokenMetadata!.totalTokens).toBe(
        full.tokenMetadata!.totalTokens,
      );

      session.close();
    });
  });

  // =========================================================================
  // #7 MEDIUM — neighborhood() must handle mixed in/out paths
  // =========================================================================
  describe("#7 — SymbolGraph.neighborhood treats depth as undirected", () => {
    function mkSymbol(name: string, kind: "function" | "class" = "function"): Symbol {
      return {
        name,
        kind,
        startLine: 1,
        endLine: 2,
        startCol: 0,
        endCol: 0,
      };
    }

    it("finds a node reachable only via a mixed out→in path", async () => {
      // Graph: A → B ← C
      // neighborhood(A, 2) should include C — it's 2 undirected hops away
      // (A→B, then B←C). The old implementation only walked pure-outgoing
      // or pure-incoming BFS from A, so it missed C entirely.
      const graph = new SymbolGraph();
      graph.addSymbol(mkSymbol("A"));
      graph.addSymbol(mkSymbol("B"));
      graph.addSymbol(mkSymbol("C"));
      graph.addEdge("A", "B", "calls");
      graph.addEdge("C", "B", "calls");

      const n = graph.neighborhood("A", 2);
      const nodeNames = n.nodes.map((s) => s.name).sort();
      expect(nodeNames).toEqual(["A", "B", "C"]);
    });

    it("finds a chain through alternating directions", async () => {
      // Graph: A → B ← C → D
      // neighborhood(A, 3) should include D — 3 undirected hops via
      // A→B←C→D. Old impl stopped at B.
      const graph = new SymbolGraph();
      for (const name of ["A", "B", "C", "D"]) graph.addSymbol(mkSymbol(name));
      graph.addEdge("A", "B", "calls");
      graph.addEdge("C", "B", "calls");
      graph.addEdge("C", "D", "calls");

      const n = graph.neighborhood("A", 3);
      const nodeNames = n.nodes.map((s) => s.name).sort();
      expect(nodeNames).toEqual(["A", "B", "C", "D"]);
    });

    it("respects the depth limit (doesn't grab the whole graph)", async () => {
      // Graph: A → B → C → D  (chain)
      // neighborhood(A, 2) should only reach {A, B, C}, not D.
      const graph = new SymbolGraph();
      for (const name of ["A", "B", "C", "D"]) graph.addSymbol(mkSymbol(name));
      graph.addEdge("A", "B", "calls");
      graph.addEdge("B", "C", "calls");
      graph.addEdge("C", "D", "calls");

      const n = graph.neighborhood("A", 2);
      const nodeNames = n.nodes.map((s) => s.name).sort();
      expect(nodeNames).toEqual(["A", "B", "C"]);
    });

    it("returns only the root for depth 0", async () => {
      const graph = new SymbolGraph();
      graph.addSymbol(mkSymbol("A"));
      graph.addSymbol(mkSymbol("B"));
      graph.addEdge("A", "B", "calls");

      const n = graph.neighborhood("A", 0);
      expect(n.nodes.map((s) => s.name)).toEqual(["A"]);
    });
  });

  // =========================================================================
  // #10 LOW — FTS5 search highlighted/snippet must escape HTML in content
  // =========================================================================
  describe("#10 — FTS5 searchWithHighlights escapes content HTML", () => {
    function setupSearch() {
      const db = new SessionDB();
      // Store a document with embedded HTML — simulates user content
      // the document analyzer might pick up.
      db.loadDocument(
        [
          "harmless line with no html",
          '<script>alert("xss")</script> here is an alert word',
          "another &amp; pre-escaped line",
        ].join("\n"),
      );
      const search = new FTS5Search(db);
      return { db, search };
    }

    it("highlighted output escapes < > & from original content", async () => {
      const { db, search } = setupSearch();
      const results = search.searchWithHighlights("alert");
      expect(results.length).toBeGreaterThan(0);

      const scriptLine = results.find((r) => r.content.includes("script"));
      expect(scriptLine).toBeDefined();
      const highlighted = scriptLine!.highlighted;

      // No unescaped <script> in output — it must become &lt;script&gt;
      expect(highlighted).not.toMatch(/<script/i);
      expect(highlighted).toMatch(/&lt;script&gt;/i);

      // The highlight wrapper itself IS real HTML
      expect(highlighted).toMatch(/<mark>alert<\/mark>/i);

      db.close();
    });

    it("snippet output escapes < > & from original content", async () => {
      const { db, search } = setupSearch();
      const results = search.searchWithSnippets("alert");
      expect(results.length).toBeGreaterThan(0);

      const scriptLine = results.find((r) => r.content.includes("script"));
      expect(scriptLine).toBeDefined();
      const snippet = scriptLine!.snippet;

      expect(snippet).not.toMatch(/<script/i);
      expect(snippet).toMatch(/&lt;script&gt;/i);
      expect(snippet).toMatch(/<mark>alert<\/mark>/i);

      db.close();
    });

    it("pre-existing &amp; in content is re-encoded to &amp;amp;", async () => {
      // Escape must be idempotent-hostile: if we see `&amp;` in the input,
      // we must NOT leave it alone (that would double-decode on render).
      // Instead, every `&` becomes `&amp;` so the literal source text
      // round-trips through an HTML renderer unchanged.
      const { db, search } = setupSearch();
      const results = search.searchWithHighlights("pre");
      const ampLine = results.find((r) => r.content.includes("&amp;"));
      expect(ampLine).toBeDefined();
      expect(ampLine!.highlighted).toMatch(/&amp;amp;/);

      db.close();
    });
  });

  // =========================================================================
  // #11 LOW — parseAll must track ()/[]/{} as independent bracket kinds
  // =========================================================================
  describe("#11 — parseAll separates paren/bracket/brace depth", () => {
    it("two top-level s-expressions back to back are split correctly", async () => {
      const results = parseAll('(grep "foo") (grep "bar")');
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it("does not split mid-expression on a brace inside a string", async () => {
      // `(grep "}")` — the closing brace is inside a string, so parseAll's
      // depth counter must not touch it. Already handled by the inString
      // check. Keep this as a regression guard.
      const results = parseAll('(grep "}")');
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
    });

    it("stray `)` without matching `(` is ignored, not treated as expression close", async () => {
      // `[x) (grep "foo")`:
      //
      // Buggy behavior (single depth counter):
      //   `[` → depth 1, start=0
      //   `x`
      //   `)` → depth 0, emits slice `[x)` (which parse() will fail on),
      //         then `(grep "foo")` → second slice emitted successfully.
      //   Result: [fail, success], length 2. The `)` was treated as a
      //   matching close for the `[`, which is nonsense.
      //
      // Fixed behavior (per-kind depth, stray closes ignored):
      //   `[` → bracketDepth 1, start=0
      //   `)` → parenDepth can't go below 0, no-op
      //   `(grep "foo")` enters before bracketDepth returns to 0, so the
      //   whole span is never "all-zero" → no slice emitted mid-stream.
      //   Falls through to the one-expression fallback parse, which
      //   fails cleanly. length 1.
      const results = parseAll('[x) (grep "foo")');
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });

    it("valid consecutive expressions with different bracket shapes", async () => {
      // `(grep "foo") [list] (grep "bar")` — three top-level forms.
      // Note: `[list]` won't parse as a valid LC term (no leading op),
      // but parseAll should still emit three slices, not two.
      const results = parseAll('(grep "foo") [list] (grep "bar")');
      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[2].success).toBe(true);
    });
  });

  // =========================================================================
  // #12 LOW — tokenize must error instead of silently truncating
  // =========================================================================
  describe("#12 — parse() errors out on oversize input, doesn't silently truncate", () => {
    it("an input with > MAX_TOKENS tokens produces a parse failure, not a partial success", async () => {
      // MAX_TOKENS = 100_000. Generate a list with enough tokens to blow
      // through the cap. Each `a` symbol is ~1 token, plus whitespace.
      const tokens = Array.from({ length: 120_000 }, () => "a").join(" ");
      const input = `(list ${tokens})`;

      const result = parse(input);

      // Before the fix: tokenize silently stops at 100k tokens, parse()
      // then processes whatever it has — possibly returning success for
      // a truncated prefix, or returning a misleading syntax error.
      // After the fix: tokenize throws an explicit "too large" error
      // and parse() wraps it in a failed ParseResult.
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too large|too many tokens|MAX_TOKENS/i);
    });
  });

  // =========================================================================
  // #14 LOW — setBinding must accept hyphens (matches auto-register regex)
  // =========================================================================
  describe("#14 — setBinding and synthesized-fn auto-register use one regex", () => {
    it("setBinding accepts hyphenated names so `_fn_parse-date` round-trips", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("anything");
      // Before the fix: setBinding rejects hyphens via
      // /^[a-zA-Z_][a-zA-Z0-9_]*$/, even though the synthesized-function
      // auto-register path emits `_fn_parse-date`-style keys via direct
      // bindings.set. After the fix, the two paths use the same regex
      // and setBinding works with the auto-generated keys.
      expect(() => engine.setBinding("_fn_parse-date", { foo: 1 })).not.toThrow();
      expect(engine.getBinding("_fn_parse-date")).toEqual({ foo: 1 });
    });

    it("setBinding still rejects other invalid characters", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("anything");
      // Quick sanity: things that should still be invalid stay invalid.
      expect(() => engine.setBinding("has space", 1)).toThrow();
      expect(() => engine.setBinding("has$dollar", 1)).toThrow();
      expect(() => engine.setBinding("__proto__", 1)).toThrow();
    });
  });

  // =========================================================================
  // #15 LOW — hasTraversalSegment replaces .includes("..") guards
  // =========================================================================
  describe("#15 — path-traversal check is segment-aware", () => {
    it("rejects true parent-directory traversal", async () => {
      expect(hasTraversalSegment("../etc/passwd")).toBe(true);
      expect(hasTraversalSegment("..")).toBe(true);
      expect(hasTraversalSegment("foo/../bar")).toBe(true);
      expect(hasTraversalSegment("foo/bar/..")).toBe(true);
      expect(hasTraversalSegment("..\\windows\\path")).toBe(true);
      expect(hasTraversalSegment("a/b/../c/d")).toBe(true);
    });

    it("accepts legitimate filenames containing the `..` substring", async () => {
      // Before the fix these would have been rejected as path traversal.
      expect(hasTraversalSegment("readme..txt")).toBe(false);
      expect(hasTraversalSegment("foo..bar.md")).toBe(false);
      expect(hasTraversalSegment("sub/dir/file..backup")).toBe(false);
      expect(hasTraversalSegment("weird...name")).toBe(false); // 3 dots, no `..` segment
      expect(hasTraversalSegment("my.file..v2")).toBe(false);
    });

    it("accepts normal relative paths and edge cases", async () => {
      expect(hasTraversalSegment("")).toBe(false);
      expect(hasTraversalSegment(".")).toBe(false);
      expect(hasTraversalSegment("./file.txt")).toBe(false);
      expect(hasTraversalSegment("a/b/c.ts")).toBe(false);
      expect(hasTraversalSegment("/absolute/path/x.md")).toBe(false);
    });
  });
});

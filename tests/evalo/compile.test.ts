/**
 * Tests for JavaScript Compilation
 *
 * The compile module converts Extractor DSL to executable JavaScript.
 * This allows synthesized extractors to be used at runtime.
 */

import { describe, it, expect } from "vitest";
import { compile, compileToFunction } from "../../src/synthesis/evalo/compile.js";
import type { Extractor } from "../../src/synthesis/evalo/types.js";
import { readFileSync } from "fs";

describe("compile", () => {
  describe("base cases", () => {
    it("should compile input to identity", () => {
      const e: Extractor = { tag: "input" };
      const code = compile(e);
      expect(code).toBe("input");
    });

    it("should compile string literal", () => {
      const e: Extractor = { tag: "lit", value: "hello" };
      const code = compile(e);
      expect(code).toBe('"hello"');
    });

    it("should compile number literal", () => {
      const e: Extractor = { tag: "lit", value: 42 };
      const code = compile(e);
      expect(code).toBe("42");
    });

    it("should escape special characters in string literals", () => {
      const e: Extractor = { tag: "lit", value: 'he"llo' };
      const code = compile(e);
      expect(code).toBe('"he\\"llo"');
    });
  });

  describe("string operations", () => {
    it("should compile match", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\d+",
        group: 0,
      };
      const code = compile(e);
      expect(code).toContain("match");
      expect(code).toContain("new RegExp");
    });

    it("should compile match with group", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\$(\\d+)",
        group: 1,
      };
      const code = compile(e);
      expect(code).toContain("[1]");
    });

    it("should compile replace", () => {
      const e: Extractor = {
        tag: "replace",
        str: { tag: "input" },
        from: ",",
        to: "",
      };
      const code = compile(e);
      expect(code).toContain("replace");
      expect(code).toContain("new RegExp");
    });

    it("should compile slice", () => {
      const e: Extractor = {
        tag: "slice",
        str: { tag: "input" },
        start: 0,
        end: 5,
      };
      const code = compile(e);
      expect(code).toContain("slice");
      expect(code).toContain("0, 5");
    });

    it("should compile split", () => {
      const e: Extractor = {
        tag: "split",
        str: { tag: "input" },
        delim: ":",
        index: 1,
      };
      const code = compile(e);
      expect(code).toContain("split");
      expect(code).toContain("[1]");
    });
  });

  describe("numeric operations", () => {
    it("should compile parseInt", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: { tag: "input" },
      };
      const code = compile(e);
      expect(code).toContain("parseInt");
      expect(code).toContain("10");
    });

    it("should compile parseFloat", () => {
      const e: Extractor = {
        tag: "parseFloat",
        str: { tag: "input" },
      };
      const code = compile(e);
      expect(code).toContain("parseFloat");
    });

    it("should compile add", () => {
      const e: Extractor = {
        tag: "add",
        left: { tag: "lit", value: 1 },
        right: { tag: "lit", value: 2 },
      };
      const code = compile(e);
      expect(code).toContain("+");
    });
  });

  describe("conditional", () => {
    it("should compile if as ternary", () => {
      const e: Extractor = {
        tag: "if",
        cond: { tag: "input" },
        then: { tag: "lit", value: 1 },
        else: { tag: "lit", value: 0 },
      };
      const code = compile(e);
      expect(code).toContain("?");
      expect(code).toContain(":");
    });
  });

  describe("nested extractors", () => {
    it("should compile parseFloat of match", () => {
      const e: Extractor = {
        tag: "parseFloat",
        str: {
          tag: "match",
          str: { tag: "input" },
          pattern: "\\d+",
          group: 0,
        },
      };
      const code = compile(e);
      expect(code).toContain("parseFloat");
      expect(code).toContain("match");
    });

    it("should compile currency extractor", () => {
      // parseFloat(replace(match(input, /\$([\d,]+)/, 1), /,/, ""))
      const e: Extractor = {
        tag: "parseFloat",
        str: {
          tag: "replace",
          str: {
            tag: "match",
            str: { tag: "input" },
            pattern: "\\$([\\d,]+)",
            group: 1,
          },
          from: ",",
          to: "",
        },
      };
      const code = compile(e);
      expect(code).toContain("parseFloat");
      expect(code).toContain("replace");
      expect(code).toContain("match");
    });
  });
});

describe("compileToFunction", () => {
  describe("execution", () => {
    it("should create working identity function", () => {
      const e: Extractor = { tag: "input" };
      const fn = compileToFunction(e);
      expect(fn("hello")).toBe("hello");
      expect(fn("world")).toBe("world");
    });

    it("should create working literal function", () => {
      const e: Extractor = { tag: "lit", value: 42 };
      const fn = compileToFunction(e);
      expect(fn("anything")).toBe(42);
    });

    it("should create working match function", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\$(\\d+)",
        group: 1,
      };
      const fn = compileToFunction(e);
      expect(fn("$100")).toBe("100");
      expect(fn("$200")).toBe("200");
    });

    it("should create working parseInt function", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: {
          tag: "match",
          str: { tag: "input" },
          pattern: "\\d+",
          group: 0,
        },
      };
      const fn = compileToFunction(e);
      expect(fn("abc123def")).toBe(123);
    });

    it("should create working currency extractor", () => {
      const e: Extractor = {
        tag: "parseFloat",
        str: {
          tag: "replace",
          str: {
            tag: "match",
            str: { tag: "input" },
            pattern: "\\$([\\d,]+)",
            group: 1,
          },
          from: ",",
          to: "",
        },
      };
      const fn = compileToFunction(e);
      expect(fn("$1,234")).toBe(1234);
      expect(fn("$5,678,900")).toBe(5678900);
    });
  });

  describe("error handling", () => {
    it("should return null for no match", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "xyz",
        group: 0,
      };
      const fn = compileToFunction(e);
      expect(fn("abc")).toBe(null);
    });
  });

  describe("NaN guard parity with interpreter", () => {
    it("should return null (not NaN) for parseInt of non-numeric string", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: { tag: "input" },
      };
      const fn = compileToFunction(e);
      const result = fn("hello");
      expect(result).toBeNull();
    });

    it("should return null (not NaN) for parseFloat of non-numeric string", () => {
      const e: Extractor = {
        tag: "parseFloat",
        str: { tag: "input" },
      };
      const fn = compileToFunction(e);
      const result = fn("hello");
      expect(result).toBeNull();
    });

    it("should return null for add with non-numeric operands", () => {
      const e: Extractor = {
        tag: "add",
        left: {
          tag: "parseInt",
          str: { tag: "input" },
        },
        right: { tag: "lit", value: 5 },
      };
      const fn = compileToFunction(e);
      const result = fn("hello");
      expect(result).toBeNull();
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit15.test.ts Audit15 #5: compile replace $ backreference
  describe("Audit15 #5: compile replace $ backreference", () => {
    it("should escape $ in replacement string for compiled code", async () => {
      const { compile, compileToFunction } = await import("../../src/synthesis/evalo/compile.js");
      const extractor: any = {
        tag: "replace",
        str: { tag: "input" },
        from: "foo",
        to: "$1bar",
      };
      const code = compile(extractor);
      // The compiled code's replacement should have escaped $
      // Execute it and ensure $1 is treated literally
      const fn = compileToFunction(extractor);
      const result = fn("foo");
      // Should be "$1bar" literally, not a backreference
      expect(result).toBe("$1bar");
    });
  });

  // from tests/audit22.test.ts Audit22 #1: compile escapeRegexForLiteral backslash
  describe("Audit22 #1: compile escapeRegexForLiteral backslash", () => {
    it("should compile match with backslash in pattern correctly", async () => {
      const { compileToFunction } = await import(
        "../../src/synthesis/evalo/compile.js"
      );
      // Pattern: match a backslash followed by "n" literally (not newline)
      const extractor: any = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\\\n", // regex pattern for literal \n
        group: 0,
      };
      const fn = compileToFunction(extractor);
      // Input with a literal backslash-n (not newline)
      expect(fn("hello\\nworld")).toBe("\\n");
    });

    it("should compile replace with backslash in pattern correctly", async () => {
      const { compileToFunction } = await import("../../src/synthesis/evalo/compile.js");
      // Pattern: replace literal backslash with dash
      const extractor: any = {
        tag: "replace",
        str: { tag: "input" },
        from: "\\\\",  // regex for literal backslash
        to: "-",
      };
      const fn = compileToFunction(extractor);
      expect(fn("a\\b\\c")).toBe("a-b-c");
    });
  });

  // from tests/audit33.test.ts #1 — compile.ts null-safe output for replace/slice/split
  describe("#1 — compile.ts null-safe output for replace/slice/split", () => {
      it("compile(replace) should produce null-safe code", async () => {
        const { compile } = await import("../../src/synthesis/evalo/compile.js");
        // When inner str can be null (e.g., match returns null), the compiled
        // replace code should not crash — it should produce null-safe output
        const code = compile({
          tag: "replace",
          str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
          from: ",",
          to: "",
        });
        // The compiled code should handle null gracefully
        const fn = new Function("input", `return ${code}`);
        // When match returns null, should not throw
        expect(() => fn("no digits here")).not.toThrow();
      });

      it("compile(slice) should produce null-safe code", async () => {
        const { compile } = await import("../../src/synthesis/evalo/compile.js");
        const code = compile({
          tag: "slice",
          str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
          start: 0,
          end: 3,
        });
        const fn = new Function("input", `return ${code}`);
        expect(() => fn("no digits here")).not.toThrow();
      });

      it("compile(split) should produce null-safe code", async () => {
        const { compile } = await import("../../src/synthesis/evalo/compile.js");
        const code = compile({
          tag: "split",
          str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
          delim: ",",
          index: 0,
        });
        const fn = new Function("input", `return ${code}`);
        expect(() => fn("no digits here")).not.toThrow();
      });
    });

  // from tests/audit34.test.ts #20 — compile should have default case
  describe("#20 — compile should have default case", () => {
        it("should have a default case in the switch statement", () => {
          const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
          const compileFn = source.match(/export function compile[\s\S]*?^\}/m);
          expect(compileFn).not.toBeNull();
          expect(compileFn![0]).toMatch(/default:/);
        });
      });

  // from tests/audit43.test.ts #8 — split should validate index is non-negative
  describe("#8 — split should validate index is non-negative", () => {
      it("evalo compile split should guard negative index", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
        expect(splitCase).not.toBeNull();
        expect(splitCase![0]).toMatch(/isInteger|< 0|>= 0/);
      });

      it("lc-compiler split should guard negative index", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
        expect(splitCase).not.toBeNull();
        expect(splitCase![0]).toMatch(/index < 0|index >= 0|isInteger/);
      });
    });

  // from tests/audit47.test.ts #4 — escapeStringForLiteral should escape null bytes
  describe("#4 — escapeStringForLiteral should escape null bytes", () => {
      it("should handle null byte character in escape function", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const escapeFn = source.match(/function escapeStringForLiteral[\s\S]*?\n\}/);
        expect(escapeFn).not.toBeNull();
        expect(escapeFn![0]).toMatch(/\\0|\\x00|null/i);
      });
    });

  // from tests/audit52.test.ts #5 — evalo compile slice should reject negative indices
  describe("#5 — evalo compile slice should reject negative indices", () => {
      it("should validate start >= 0", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const sliceCase = source.match(/case "slice"[\s\S]*?\.slice\(/);
        expect(sliceCase).not.toBeNull();
        expect(sliceCase![0]).toMatch(/start\s*<\s*0|start\s*>=\s*0/);
      });
    });

  // from tests/audit57.test.ts #2 — compiled replace should guard typeof string
  describe("#2 — compiled replace should guard typeof string", () => {
      it("should check typeof before calling .replace()", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const caseStart = source.indexOf('case "replace"');
        expect(caseStart).toBeGreaterThan(-1);
        const block = source.slice(caseStart, caseStart + 500);
        // The generated code template should include a typeof string guard
        expect(block).toMatch(/typeof.*!==?\s*"string"|typeof.*string/);
      });
    });

  // from tests/audit57.test.ts #10 — compiled slice should guard typeof string
  describe("#10 — compiled slice should guard typeof string", () => {
      it("should check typeof before calling .slice()", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const sliceCase = source.match(/case "slice"[\s\S]*?\.slice\(/);
        expect(sliceCase).not.toBeNull();
        expect(sliceCase![0]).toMatch(/typeof.*string|String\(/);
      });
    });

  // from tests/audit59.test.ts #3 — compiled split should use typeof string guard
  describe("#3 — compiled split should use typeof string guard", () => {
      it("should check typeof instead of loose null comparison", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const splitCase = source.match(/case "split"[\s\S]*?\.split\(/);
        expect(splitCase).not.toBeNull();
        expect(splitCase![0]).toMatch(/typeof.*!==?\s*"string"/);
      });
    });

  // from tests/audit60.test.ts #1 — compiled if should match evalo truthiness semantics
  describe("#1 — compiled if should match evalo truthiness semantics", () => {
      it("should use custom falsy check, not JS native truthiness", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const ifCase = source.match(/case "if"[\s\S]*?return[^;]*;/);
        expect(ifCase).not.toBeNull();
        // Should NOT use simple ternary `(cond) ? then : else`
        // Should check for null, "", 0, false, NaN like evalo.ts
        expect(ifCase![0]).toMatch(/=== null|=== ""|=== 0|=== false|isNaN/);
      });
    });

  // from tests/audit61.test.ts #2 — compiled match should guard against non-string input
  describe("#2 — compiled match should guard against non-string input", () => {
      it("should wrap match in typeof string check", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const matchCase = source.match(/case "match"[\s\S]*?\.match\(new RegExp/);
        expect(matchCase).not.toBeNull();
        expect(matchCase![0]).toMatch(/typeof.*!==?\s*"string"|typeof.*string/);
      });
    });

  // from tests/audit62.test.ts #3 — compiled split should validate delimiter length
  describe("#3 — compiled split should validate delimiter length", () => {
      it("should check delimiter length before generating code", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const splitStart = source.indexOf('case "split"');
        expect(splitStart).toBeGreaterThan(-1);
        const block = source.slice(splitStart, splitStart + 300);
        expect(block).toMatch(/delim\.length|extractor\.delim\.length/);
      });
    });

  // from tests/audit65.test.ts #3 — prettyPrint should escape string values
  describe("#3 — prettyPrint should escape string values", () => {
      it("should use JSON.stringify or escaping for from/to/delim", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const fnStart = source.indexOf("function prettyPrint(");
        if (fnStart === -1) {
          const altStart = source.indexOf("export function prettyPrint(");
          expect(altStart).toBeGreaterThan(-1);
          const block = source.slice(altStart, altStart + 800);
          // replace and split cases should escape their string args
          const replaceCase = block.indexOf("replace");
          expect(replaceCase).toBeGreaterThan(-1);
          // Should use JSON.stringify or escapeStringForLiteral on from/to/delim
          expect(block).toMatch(/JSON\.stringify\(extractor\.from\)|escapeString.*extractor\.from|extractor\.from.*replace/);
        } else {
          const block = source.slice(fnStart, fnStart + 800);
          expect(block).toMatch(/JSON\.stringify\(extractor\.from\)|escapeString.*extractor\.from|extractor\.from.*replace/);
        }
      });
    });

  // from tests/audit67.test.ts #1 — compileToFunction should cap generated code length
  describe("#1 — compileToFunction should cap generated code length", () => {
      it("should check code length before new Function()", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const fnStart = source.indexOf("function compileToFunction(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/MAX_CODE_LENGTH|code\.length\s*>/i);
      });
    });

  // from tests/audit80.test.ts #6 — compileToFunction should validate extractor tags
  describe("#6 — compileToFunction should validate extractor tags", () => {
      it("should validate extractor tag is known before compilation", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const fnStart = source.indexOf("export function compileToFunction");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 500);
        expect(block).toMatch(/validTags|validateExtractor|tag.*includes|VALID_TAGS/);
      });
    });

  // from tests/audit82.test.ts #9 — compile split should explicitly check empty delimiter
  describe("#9 — compile split should explicitly check empty delimiter", () => {
      it("should check delim.length === 0 explicitly", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 200);
        expect(block).toMatch(/delim\.length\s*===?\s*0|delim\.length\s*[<>]/);
      });
    });

  // from tests/audit87.test.ts #1 — compile.ts slice should reject negative end
  describe("#1 — compile.ts slice should reject negative end", () => {
      it("should validate end >= 0", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const sliceCase = source.indexOf('case "slice"');
        expect(sliceCase).toBeGreaterThan(-1);
        const block = source.slice(sliceCase, sliceCase + 300);
        expect(block).toMatch(/end\s*<\s*0|end\s*<\s*extractor\.start|end\s*>=?\s*0/);
      });
    });

});

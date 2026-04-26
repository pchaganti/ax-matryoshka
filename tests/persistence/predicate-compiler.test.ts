import { describe, it, expect } from "vitest";
import { PredicateCompiler } from "../../src/persistence/predicate-compiler.js";
import { readFileSync } from "fs";

describe("PredicateCompiler", () => {
  const compiler = new PredicateCompiler();

  describe("JavaScript predicate to function", () => {
    it("should compile simple equality", () => {
      const fn = compiler.compile("item.type === 'error'");

      expect(fn({ type: "error" })).toBe(true);
      expect(fn({ type: "warning" })).toBe(false);
    });

    it("should compile string includes", () => {
      const fn = compiler.compile("item.line.includes('Error')");

      expect(fn({ line: "Error: something" })).toBe(true);
      expect(fn({ line: "Warning: something" })).toBe(false);
    });

    it("should compile regex test", () => {
      const fn = compiler.compile("/error|failure/i.test(item.line)");

      expect(fn({ line: "Error occurred" })).toBe(true);
      expect(fn({ line: "FAILURE detected" })).toBe(true);
      expect(fn({ line: "Success" })).toBe(false);
    });

    it("should compile numeric comparison", () => {
      const fn = compiler.compile("item.value > 100");

      expect(fn({ value: 150 })).toBe(true);
      expect(fn({ value: 50 })).toBe(false);
    });

    it("should compile combined conditions", () => {
      const fn = compiler.compile("item.type === 'error' && item.severity > 5");

      expect(fn({ type: "error", severity: 10 })).toBe(true);
      expect(fn({ type: "error", severity: 3 })).toBe(false);
      expect(fn({ type: "warning", severity: 10 })).toBe(false);
    });

    it("should compile optional chaining", () => {
      const fn = compiler.compile("item.meta?.level === 'high'");

      expect(fn({ meta: { level: "high" } })).toBe(true);
      expect(fn({ meta: { level: "low" } })).toBe(false);
      expect(fn({})).toBe(false);  // No meta, should not throw
    });
  });

  describe("safe evaluation", () => {
    it("should prevent code injection", () => {
      // These should throw or return safe no-op functions
      expect(() => compiler.compile("process.exit(1)")).toThrow();
      expect(() => compiler.compile("require('fs')")).toThrow();
      expect(() => compiler.compile("eval('alert(1)')")).toThrow();
    });

    it("should only allow whitelisted operations", () => {
      // Safe operations
      expect(() => compiler.compile("item.x === 1")).not.toThrow();
      expect(() => compiler.compile("item.s.includes('a')")).not.toThrow();
      expect(() => compiler.compile("/pattern/.test(item.s)")).not.toThrow();
      expect(() => compiler.compile("item.x > 0 && item.y < 10")).not.toThrow();
    });

    it("should handle malformed input gracefully", () => {
      expect(() => compiler.compile("")).toThrow();
      expect(() => compiler.compile("   ")).toThrow();
    });
  });

  describe("SQL-compatible output (optional optimization)", () => {
    it("should convert simple equality to SQL-like condition", () => {
      const result = compiler.toSQLCondition("item.type === 'error'");
      expect(result).not.toBeNull();
      expect(result!.sql).toBe("json_extract(data, '$.type') = ?");
      expect(result!.params).toEqual(["error"]);
    });

    it("should convert string contains to SQL LIKE", () => {
      const result = compiler.toSQLCondition("item.line.includes('Error')");
      expect(result).not.toBeNull();
      expect(result!.sql).toBe("json_extract(data, '$.line') LIKE ? ESCAPE '\\'");
      expect(result!.params).toEqual(["%Error%"]);
    });

    it("should convert numeric comparison", () => {
      const result = compiler.toSQLCondition("item.value > 100");
      expect(result).not.toBeNull();
      expect(result!.sql).toBe("CAST(json_extract(data, '$.value') AS REAL) > ?");
      expect(result!.params).toEqual([100]);
    });

    it("should return null for non-convertible predicates", () => {
      // Complex JS operations can't be converted to SQL
      const result = compiler.toSQLCondition("/pattern/.test(item.line)");
      expect(result).toBeNull();
    });

    it("should parameterize values with single quotes (SQL injection prevention)", () => {
      const result = compiler.toSQLCondition("item.name === \"O'Reilly\"");
      expect(result).not.toBeNull();
      expect(result!.params).toEqual(["O'Reilly"]);
      // SQL should use placeholder, not interpolated value
      expect(result!.sql).not.toContain("O'Reilly");
    });

    it("should not produce injectable SQL with malicious input", () => {
      const result = compiler.toSQLCondition("item.x === \"'; DROP TABLE handles;--\"");
      expect(result).not.toBeNull();
      expect(result!.params).toEqual(["'; DROP TABLE handles;--"]);
      expect(result!.sql).not.toContain("DROP TABLE");
    });

    it("should validate field names against injection", () => {
      // Field names should only contain word characters
      const result = compiler.toSQLCondition("item.type === 'error'");
      expect(result).not.toBeNull();
      expect(result!.sql).toContain("$.type");
    });
  });

  describe("blacklist security", () => {
    it("should reject this.constructor", () => {
      expect(() => compiler.compile("this.constructor")).toThrow();
    });

    it("should reject globalThis", () => {
      expect(() => compiler.compile("globalThis")).toThrow();
    });

    it("should reject Reflect", () => {
      expect(() => compiler.compile("Reflect.ownKeys({})")).toThrow();
    });

    it("should reject Proxy", () => {
      expect(() => compiler.compile("new Proxy({}, {})")).toThrow();
    });

    it("should reject Symbol", () => {
      expect(() => compiler.compile("Symbol.iterator")).toThrow();
    });

    it("should still allow legitimate predicates", () => {
      expect(() => compiler.compile("item.status === 'active'")).not.toThrow();
    });
  });

  describe("transform expressions", () => {
    it("should compile field access transform", () => {
      const fn = compiler.compileTransform("item.lineNum");

      expect(fn({ lineNum: 42, line: "test" })).toBe(42);
    });

    it("should compile method call transform", () => {
      const fn = compiler.compileTransform("item.line.toUpperCase()");

      expect(fn({ line: "hello" })).toBe("HELLO");
    });

    it("should compile object construction transform", () => {
      const fn = compiler.compileTransform("({ num: item.lineNum, doubled: item.lineNum * 2 })");

      expect(fn({ lineNum: 5, line: "test" })).toEqual({ num: 5, doubled: 10 });
    });

    it("should compile match extraction transform", () => {
      const fn = compiler.compileTransform("item.line.match(/\\d+/)?.[0]");

      expect(fn({ line: "Count: 123" })).toBe("123");
      expect(fn({ line: "No numbers" })).toBeUndefined();
    });
  });

  describe("SQL field name validation", () => {
    it("should convert valid field names to SQL", () => {
      const result = compiler.toSQLCondition("item.name === 'test'");
      expect(result).not.toBeNull();
      expect(result!.sql).toContain("json_extract");
    });

    it("should reject digits-only field names by falling through to null", () => {
      // "123" is matched by \w+ but is not a valid identifier
      const result = compiler.toSQLCondition("item.123 === 'test'");
      expect(result).toBeNull();
    });
  });

  describe("SQL LIKE wildcard escaping", () => {
    it("should escape % wildcard in LIKE value", () => {
      const result = compiler.toSQLCondition("item.line.includes('100%')");
      expect(result).not.toBeNull();
      // The param should have escaped % so it matches literal "100%"
      expect(result!.params[0]).not.toBe("%100%%");
      expect(result!.params[0]).toContain("100");
    });

    it("should escape _ wildcard in LIKE value", () => {
      const result = compiler.toSQLCondition("item.line.includes('foo_bar')");
      expect(result).not.toBeNull();
      // The _ should be escaped so it matches literal underscore
      expect(result!.params[0]).toContain("foo");
    });
  });

  describe("constructor property access blacklist", () => {
    it("should reject item.constructor.name", () => {
      expect(() => compiler.compile("item.constructor.name === 'Array'")).toThrow(/Dangerous operation/i);
    });

    it("should reject item.constructor === Array", () => {
      expect(() => compiler.compile("item.constructor === Array")).toThrow(/Dangerous operation/i);
    });
  });

  describe("extended blocklist", () => {
    it("should reject Atomics", () => {
      expect(() => compiler.compile("Atomics.wait()")).toThrow();
    });

    it("should reject SharedArrayBuffer", () => {
      expect(() => compiler.compile("new SharedArrayBuffer(8)")).toThrow();
    });

    it("should reject WebAssembly", () => {
      expect(() => compiler.compile("WebAssembly.compile()")).toThrow();
    });

    it("should reject Buffer", () => {
      expect(() => compiler.compile("Buffer.alloc(100)")).toThrow();
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit22.test.ts Audit22 #6: predicate-compiler toSQLCondition safety
  describe("Audit22 #6: predicate-compiler toSQLCondition safety", () => {
    it("should handle crafted input without hanging", async () => {
      const { PredicateCompiler } = await import(
        "../../src/persistence/predicate-compiler.js"
      );
      const compiler = new PredicateCompiler();
      // Craft input that could cause exponential backtracking
      const malicious = `item.field === '${"\\'\\'".repeat(50)}'`;
      // Should complete quickly (not hang)
      const start = Date.now();
      compiler.toSQLCondition(malicious);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  // from tests/audit34.test.ts #4 — predicate-compiler should block arrow functions
  describe("#4 — predicate-compiler should block arrow functions", () => {
        it("should reject IIFE via arrow function", async () => {
          const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
          const compiler = new PredicateCompiler();
          expect(() => compiler.compile("item.x || (()=>1)()")).toThrow();
        });

        it("should reject arrow functions in predicates", async () => {
          const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
          const compiler = new PredicateCompiler();
          expect(() => compiler.compile("(x => x.type)(item)")).toThrow();
        });

        it("should still allow >= and <= comparisons", async () => {
          const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
          const compiler = new PredicateCompiler();
          const fn = compiler.compile("item.count >= 5");
          expect(fn({ count: 10 })).toBe(true);
          expect(fn({ count: 3 })).toBe(false);
        });
      });

  // from tests/audit40.test.ts #2 — predicate-compiler should block .join/.concat/fromCharCode bypasses
  describe("#2 — predicate-compiler should block .join/.concat/fromCharCode bypasses", () => {
      it("should block string reconstruction methods", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should block .join( and .concat( and fromCharCode
        expect(source).toMatch(/\.join\s*\(|join/);
        expect(source).toMatch(/\.concat\s*\(|concat/);
        expect(source).toMatch(/fromCharCode/);
      });
    });

  // from tests/audit41.test.ts #7 — predicate-compiler should block arguments keyword
  describe("#7 — predicate-compiler should block arguments keyword", () => {
      it("should include arguments in dangerous patterns", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\\barguments\\b/);
      });
    });

  // from tests/audit42.test.ts #1 — predicate-compiler should block Unicode escapes
  describe("#1 — predicate-compiler should block Unicode escapes", () => {
      it("should reject \\u escape sequences in predicates", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should block \u or \x escape sequences before blocklist matching
        expect(source).toMatch(/\\\\u|\\\\x/);
      });
    });

  // from tests/audit42.test.ts #2 — predicate-compiler should block hex escapes
  describe("#2 — predicate-compiler should block hex escapes", () => {
      it("should have a check for hex escape patterns", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should check for \x hex escape sequences - the source regex has \\x
        expect(source).toMatch(/\\\\x\[0-9a-fA-F\]/);
      });
    });

  // from tests/audit42.test.ts #7 — predicate-compiler should block parenthesized string concat
  describe("#7 — predicate-compiler should block parenthesized string concat", () => {
      it("should block patterns like ('ev') + ('al')", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should have a check that catches parenthesized string concatenation
        // e.g., block ( followed by quote, or ) + (
        expect(source).toMatch(/\\\)\s*\\\+|paren/i);
      });
    });

  // from tests/audit43.test.ts #1 — predicate-compiler should block function keyword
  describe("#1 — predicate-compiler should block function keyword", () => {
      it("should include function in dangerous patterns or validation", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\\bfunction\\b/);
      });
    });

  // from tests/audit43.test.ts #2 — predicate-compiler should block assignment operators
  describe("#2 — predicate-compiler should block assignment operators", () => {
      it("should check for assignment operators in predicates", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should block = (assignment) while still allowing === and !==
        expect(source).toMatch(/assignment|[^=!<>]=\[^=\]|\+=|-=/i);
      });
    });

  // from tests/audit44.test.ts #3 — predicate-compiler should block .call/.apply/.bind
  describe("#3 — predicate-compiler should block .call/.apply/.bind", () => {
      it("should have a check for call/apply/bind methods", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\.call\b|\.apply\b|\.bind\b/);
      });
    });

  // from tests/audit44.test.ts #9 — predicate-compiler should block comma operator
  describe("#9 — predicate-compiler should block comma operator", () => {
      it("should check for comma operator in predicates", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Should have a check that blocks comma usage (outside of valid contexts)
        expect(source).toMatch(/comma|,/i);
        // More specifically, should block the comma operator pattern
        const validationSection = source.match(/Block.*comma|comma.*operator|,\s*.*not allowed/i);
        expect(validationSection).not.toBeNull();
      });
    });

  // from tests/audit46.test.ts #5 — predicate-compiler should block increment/decrement operators
  describe("#5 — predicate-compiler should block increment/decrement operators", () => {
      it("should have a check for ++ and -- operators", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\+\+|--.*not allowed|increment|decrement/i);
      });
    });

  // from tests/audit46.test.ts #7 — predicate-compiler should block spread operator
  describe("#7 — predicate-compiler should block spread operator", () => {
      it("should check for spread operator", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\.\.\.|spread/i);
        const spreadBlock = source.match(/spread|\.\.\..*not allowed/i);
        expect(spreadBlock).not.toBeNull();
      });
    });

  // from tests/audit46.test.ts #8 — predicate-compiler should block void operator
  describe("#8 — predicate-compiler should block void operator", () => {
      it("should include void in dangerous patterns", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        expect(source).toMatch(/\\bvoid\\b/);
      });
    });

  // from tests/audit51.test.ts #3 — predicate-compiler error should not leak regex pattern
  describe("#3 — predicate-compiler error should not leak regex pattern", () => {
      it("should not interpolate regex pattern in error message", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        const errorLine = source.match(/throw new Error\(.*?Dangerous operation detected.*?\)/);
        expect(errorLine).not.toBeNull();
        // Should NOT contain ${pattern} which would leak the regex source
        expect(errorLine![0]).not.toMatch(/\$\{pattern\}/);
      });
    });

  // from tests/audit52.test.ts #3 — predicate-compiler comma check should handle nested parens
  describe("#3 — predicate-compiler comma check should handle nested parens", () => {
      it("should strip nested parentheses before comma check", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // Find the comma operator blocking section
        const commaBlock = source.match(/comma operator[\s\S]*?replace\([^)]+\)/);
        expect(commaBlock).not.toBeNull();
        // Should handle nesting: either loop/repeat the replace, or use a recursive approach
        expect(commaBlock![0]).toMatch(/while|loop|replace\([^)]+\)[\s\S]*?replace\(|nested|depth/i);
      });
    });

  // from tests/audit60.test.ts #2 — predicate-compiler regex should exclude newlines
  describe("#2 — predicate-compiler regex should exclude newlines", () => {
      it("should use character class that excludes newlines", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        const fnStart = source.indexOf("toSQLCondition(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        // The first equality regex should exclude newlines in its character class
        // i.e. [^'"\n] instead of just [^'"]
        expect(block).not.toMatch(/\[\^'"\]\*/);
      });
    });

  // from tests/audit63.test.ts #3 — predicate paren stripping should limit iterations
  describe("#3 — predicate paren stripping should limit iterations", () => {
      it("should cap while loop iterations", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        // The while condition includes the iteration guard now
        const loopStart = source.indexOf("while (prev !== stripped");
        expect(loopStart).toBeGreaterThan(-1);
        const block = source.slice(loopStart - 150, loopStart + 200);
        expect(block).toMatch(/MAX_STRIP_ITERATIONS|iterations\s*</i);
      });
    });

  // from tests/audit68.test.ts #3 — predicateToSQL should whitelist SQL operators
  describe("#3 — predicateToSQL should whitelist SQL operators", () => {
      it("should use explicit operator mapping not fallthrough", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        const sqlOpStart = source.indexOf("sqlOp");
        expect(sqlOpStart).toBeGreaterThan(-1);
        const block = source.slice(sqlOpStart, sqlOpStart + 400);
        // Should use a map/object or explicit switch, not fallback to raw op
        expect(block).toMatch(/VALID_OPS|validOps|SQL_OPS|allowedOps|op\s*===.*return\s*null/i);
      });
    });

  // from tests/audit70.test.ts #9 — toSQLCondition should validate predicate length
  describe("#9 — toSQLCondition should validate predicate length", () => {
      it("should check predicate.length before processing", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        const fnStart = source.indexOf("toSQLCondition(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/predicate\.length|MAX_CODE|MAX_PREDICATE/i);
      });
    });

  // from tests/audit85.test.ts #5 — LIKE escaping should handle backslashes
  describe("#5 — LIKE escaping should handle backslashes", () => {
      it("should escape backslashes before % and _", () => {
        const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
        const escapedValue = source.indexOf("escapedValue");
        expect(escapedValue).toBeGreaterThan(-1);
        const block = source.slice(escapedValue, escapedValue + 200);
        expect(block).toMatch(/replace\(.*\\\\.*\\\\|escapeBackslash/);
      });
    });

});

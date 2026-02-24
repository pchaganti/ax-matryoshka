import { describe, it, expect } from "vitest";
import { PredicateCompiler } from "../../src/persistence/predicate-compiler.js";

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
      expect(result!.sql).toBe("json_extract(data, '$.line') LIKE ?");
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

  describe("constructor property access blacklist", () => {
    it("should reject item.constructor.name", () => {
      expect(() => compiler.compile("item.constructor.name === 'Array'")).toThrow(/constructor/i);
    });

    it("should reject item.constructor === Array", () => {
      expect(() => compiler.compile("item.constructor === Array")).toThrow(/constructor/i);
    });
  });
});

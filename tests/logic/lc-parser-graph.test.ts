import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";

describe("LC Parser - Graph Commands", () => {
  describe("callers", () => {
    it('should parse (callers "funcName")', () => {
      const result = parse('(callers "myFunc")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "callers", name: "myFunc" });
    });

    it("should reject callers without argument", () => {
      const result = parse("(callers)");
      expect(result.success).toBe(false);
    });
  });

  describe("callees", () => {
    it('should parse (callees "funcName")', () => {
      const result = parse('(callees "handleRequest")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "callees", name: "handleRequest" });
    });
  });

  describe("ancestors", () => {
    it('should parse (ancestors "ClassName")', () => {
      const result = parse('(ancestors "Dog")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "ancestors", name: "Dog" });
    });
  });

  describe("descendants", () => {
    it('should parse (descendants "ClassName")', () => {
      const result = parse('(descendants "Animal")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "descendants", name: "Animal" });
    });
  });

  describe("implementations", () => {
    it('should parse (implementations "InterfaceName")', () => {
      const result = parse('(implementations "IRepository")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "implementations", name: "IRepository" });
    });
  });

  describe("dependents", () => {
    it('should parse (dependents "symbolName")', () => {
      const result = parse('(dependents "config")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "dependents", name: "config" });
    });

    it('should parse (dependents "symbolName" depth)', () => {
      const result = parse('(dependents "config" 2)');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "dependents", name: "config", depth: 2 });
    });
  });

  describe("symbol_graph", () => {
    it('should parse (symbol_graph "name" depth)', () => {
      const result = parse('(symbol_graph "myFunc" 2)');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "symbol_graph", name: "myFunc", depth: 2 });
    });

    it('should parse (symbol_graph "name") with default depth', () => {
      const result = parse('(symbol_graph "myFunc")');
      expect(result.success).toBe(true);
      expect(result.term).toEqual({ tag: "symbol_graph", name: "myFunc" });
    });
  });
});

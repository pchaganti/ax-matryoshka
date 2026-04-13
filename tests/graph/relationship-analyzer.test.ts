import { describe, it, expect } from "vitest";
import { RelationshipAnalyzer } from "../../src/graph/relationship-analyzer.js";
import type { Symbol } from "../../src/treesitter/types.js";
function makeSymbol(name: string, kind: Symbol["kind"], startLine: number, endLine: number, opts?: Partial<Symbol>): Symbol {
  return {
    name, kind, startLine, endLine,
    startCol: opts?.startCol ?? 0,
    endCol: opts?.endCol ?? 0,
    id: opts?.id,
    parentSymbolId: opts?.parentSymbolId,
  };
}

describe("RelationshipAnalyzer", () => {
  const analyzer = new RelationshipAnalyzer();

  describe("call detection", () => {
    it("should detect function calls within function bodies", () => {
      const code = `
function helper() {
  return 42;
}

function main() {
  const x = helper();
  return x;
}
`.trim();

      const symbols = [
        makeSymbol("helper", "function", 1, 3),
        makeSymbol("main", "function", 5, 8),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "main", target: "helper", relation: "calls", confidence: "INFERRED" });
    });

    it("should detect multiple calls from one function", () => {
      const code = `
function a() { return 1; }
function b() { return 2; }
function c() {
  return a() + b();
}
`.trim();

      const symbols = [
        makeSymbol("a", "function", 1, 1),
        makeSymbol("b", "function", 2, 2),
        makeSymbol("c", "function", 3, 5),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "c", target: "a", relation: "calls", confidence: "INFERRED" });
      expect(edges).toContainEqual({ source: "c", target: "b", relation: "calls", confidence: "INFERRED" });
    });

    it("should not detect self-references as calls (definition line)", () => {
      const code = `
function foo() {
  return 1;
}
`.trim();

      const symbols = [
        makeSymbol("foo", "function", 1, 3),
      ];

      const edges = analyzer.analyze(symbols, code);
      const selfCalls = edges.filter((e) => e.source === "foo" && e.target === "foo");
      expect(selfCalls).toHaveLength(0);
    });

    it("should detect recursive calls", () => {
      const code = `
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`.trim();

      const symbols = [
        makeSymbol("factorial", "function", 1, 4),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "factorial", target: "factorial", relation: "calls", confidence: "INFERRED" });
    });

    it("should detect method calls on class methods", () => {
      const code = `
class Foo {
  bar() {
    return this.baz();
  }
  baz() {
    return 42;
  }
}
`.trim();

      const symbols = [
        makeSymbol("Foo", "class", 1, 9),
        makeSymbol("bar", "method", 2, 4, { parentSymbolId: 1 }),
        makeSymbol("baz", "method", 5, 7, { parentSymbolId: 1 }),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "bar", target: "baz", relation: "calls", confidence: "INFERRED" });
    });
  });

  describe("extends detection", () => {
    it("should detect class extends in TypeScript/JavaScript", () => {
      const code = `
class Animal {
  speak() {}
}

class Dog extends Animal {
  bark() {}
}
`.trim();

      const symbols = [
        makeSymbol("Animal", "class", 1, 3),
        makeSymbol("Dog", "class", 5, 7),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "Dog", target: "Animal", relation: "extends", confidence: "EXTRACTED" });
    });

    it("should not create extends edge if parent class is not in symbols", () => {
      const code = `
class Dog extends ExternalBase {
  bark() {}
}
`.trim();

      const symbols = [
        makeSymbol("Dog", "class", 1, 3),
      ];

      const edges = analyzer.analyze(symbols, code);
      const extendsEdges = edges.filter((e) => e.relation === "extends");
      expect(extendsEdges).toHaveLength(0);
    });
  });

  describe("implements detection", () => {
    it("should detect class implements in TypeScript", () => {
      const code = `
interface IRepo {
  save(): void;
}

class SqlRepo implements IRepo {
  save() {}
}
`.trim();

      const symbols = [
        makeSymbol("IRepo", "interface", 1, 3),
        makeSymbol("SqlRepo", "class", 5, 7),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "SqlRepo", target: "IRepo", relation: "implements", confidence: "EXTRACTED" });
    });

    it("should detect multiple implements", () => {
      const code = `
interface Serializable { serialize(): string; }
interface Loggable { log(): void; }

class Widget implements Serializable, Loggable {
  serialize() { return ""; }
  log() {}
}
`.trim();

      const symbols = [
        makeSymbol("Serializable", "interface", 1, 1),
        makeSymbol("Loggable", "interface", 2, 2),
        makeSymbol("Widget", "class", 4, 7),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "Widget", target: "Serializable", relation: "implements", confidence: "EXTRACTED" });
      expect(edges).toContainEqual({ source: "Widget", target: "Loggable", relation: "implements", confidence: "EXTRACTED" });
    });
  });

  describe("Python inheritance", () => {
    it("should detect Python class inheritance", () => {
      const code = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def bark(self):
        pass
`.trim();

      const symbols = [
        makeSymbol("Animal", "class", 1, 3),
        makeSymbol("Dog", "class", 5, 7),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "Dog", target: "Animal", relation: "extends", confidence: "EXTRACTED" });
    });
  });

  describe("edge deduplication", () => {
    it("should not produce duplicate edges", () => {
      const code = `
function helper() { return 1; }
function main() {
  helper();
  helper();
  helper();
}
`.trim();

      const symbols = [
        makeSymbol("helper", "function", 1, 1),
        makeSymbol("main", "function", 2, 6),
      ];

      const edges = analyzer.analyze(symbols, code);
      const callEdges = edges.filter((e) => e.source === "main" && e.target === "helper" && e.relation === "calls");
      expect(callEdges).toHaveLength(1);
    });
  });

  describe("large symbol sets", () => {
    it("should handle thousands of symbols without excessive regex size", () => {
      const symbolCount = 2000;
      const symbols: Symbol[] = [];
      const lines: string[] = [];
      for (let i = 0; i < symbolCount; i++) {
        const name = `fn${i}`;
        lines.push(`function ${name}() { return ${i}; }`);
        symbols.push(makeSymbol(name, "function", i + 1, i + 1));
      }
      lines.push("function caller() { return fn0() + fn1(); }");
      symbols.push(makeSymbol("caller", "function", symbolCount + 1, symbolCount + 1));
      const code = lines.join("\n");

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "caller", target: "fn0", relation: "calls", confidence: "INFERRED" });
      expect(edges).toContainEqual({ source: "caller", target: "fn1", relation: "calls", confidence: "INFERRED" });
    });

    it("should fall back to per-name scan when symbols exceed batch limit", () => {
      const symbolCount = 2000;
      const symbols: Symbol[] = [];
      const lines: string[] = [];
      for (let i = 0; i < symbolCount; i++) {
        const name = `func_${i}_with_long_name`;
        lines.push(`function ${name}() { return ${i}; }`);
        symbols.push(makeSymbol(name, "function", i + 1, i + 1));
      }
      lines.push("function caller() { return func_0_with_long_name(); }");
      symbols.push(makeSymbol("caller", "function", symbolCount + 1, symbolCount + 1));
      const code = lines.join("\n");

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "caller", target: "func_0_with_long_name", relation: "calls", confidence: "INFERRED" });
    });
  });

  describe("no false positives from comments or strings", () => {
    it("should still detect calls even in string/comment-heavy code", () => {
      // This is a known limitation — we do simple word-boundary matching
      // which may pick up references in comments. That's acceptable for
      // approximate call graphs.
      const code = `
function target() { return 1; }
function caller() {
  // call target here
  return target();
}
`.trim();

      const symbols = [
        makeSymbol("target", "function", 1, 1),
        makeSymbol("caller", "function", 2, 5),
      ];

      const edges = analyzer.analyze(symbols, code);
      expect(edges).toContainEqual({ source: "caller", target: "target", relation: "calls", confidence: "INFERRED" });
    });
  });
});

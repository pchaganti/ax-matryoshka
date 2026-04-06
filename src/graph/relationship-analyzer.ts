/**
 * RelationshipAnalyzer - Extracts symbol relationships from source code
 *
 * Analyzes source code + extracted symbols to find:
 * - Call relationships (function A calls function B)
 * - Inheritance (class B extends class A)
 * - Interface implementation (class C implements interface D)
 *
 * Uses line-based text analysis (not AST) for language-agnostic operation.
 * Produces approximate call graphs — acceptable for structural queries.
 */

import type { Symbol } from "../treesitter/types.js";
import type { EdgeRelation } from "./symbol-graph.js";

export interface AnalyzedEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
}

export class RelationshipAnalyzer {
  /**
   * Analyze symbols and source code to extract relationships.
   * Returns deduplicated edges.
   */
  analyze(symbols: Symbol[], code: string): AnalyzedEdge[] {
    const lines = code.split("\n");
    const symbolNames = new Set(symbols.map((s) => s.name));
    const edges: AnalyzedEdge[] = [];
    const edgeSet = new Set<string>();

    const addEdge = (source: string, target: string, relation: EdgeRelation) => {
      const key = `${source}|${target}|${relation}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source, target, relation });
      }
    };

    // Build symbol lookup by name
    const symbolMap = new Map<string, Symbol>();
    for (const sym of symbols) {
      symbolMap.set(sym.name, sym);
    }

    // Pass 1: Detect extends/implements from class declaration lines
    for (const sym of symbols) {
      if (sym.kind !== "class") continue;
      const declLine = lines[sym.startLine - 1];
      if (!declLine) continue;

      this.extractInheritance(declLine, sym.name, symbolNames, addEdge);
    }

    // Pass 2: Detect call relationships within function/method bodies
    for (const sym of symbols) {
      if (sym.kind !== "function" && sym.kind !== "method") continue;

      // Get the body lines (excluding the declaration line itself for non-recursive calls)
      const bodyStart = sym.startLine; // 1-indexed
      const bodyEnd = sym.endLine;     // 1-indexed

      for (let lineIdx = bodyStart - 1; lineIdx < bodyEnd && lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        for (const targetName of symbolNames) {
          // Skip if target is the same symbol and this is the declaration line
          if (targetName === sym.name && lineIdx === bodyStart - 1) continue;

          // Word-boundary match for the target name
          const regex = new RegExp(`\\b${escapeRegex(targetName)}\\b`);
          if (regex.test(line)) {
            // Check it looks like a call (followed by `(`) or a reference via `this.name(`
            const callRegex = new RegExp(
              `(?:\\b${escapeRegex(targetName)}\\s*\\(|this\\.${escapeRegex(targetName)}\\s*\\()`
            );
            if (callRegex.test(line)) {
              addEdge(sym.name, targetName, "calls");
            }
          }
        }
      }
    }

    return edges;
  }

  private extractInheritance(
    declLine: string,
    className: string,
    knownSymbols: Set<string>,
    addEdge: (s: string, t: string, r: EdgeRelation) => void
  ): void {
    // TypeScript/JavaScript: class Foo extends Bar implements Baz, Qux
    const extendsMatch = declLine.match(/\bextends\s+(\w+)/);
    if (extendsMatch && knownSymbols.has(extendsMatch[1])) {
      addEdge(className, extendsMatch[1], "extends");
    }

    const implementsMatch = declLine.match(/\bimplements\s+([\w\s,]+)/);
    if (implementsMatch) {
      const interfaces = implementsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const iface of interfaces) {
        // Take just the identifier (no generics)
        const ifaceName = iface.split(/[<{]/)[0].trim();
        if (knownSymbols.has(ifaceName)) {
          addEdge(className, ifaceName, "implements");
        }
      }
    }

    // Python: class Dog(Animal):  or  class Dog(Animal, Mixin):
    const pythonMatch = declLine.match(/^class\s+\w+\s*\(([^)]+)\)\s*:/);
    if (pythonMatch) {
      const bases = pythonMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const base of bases) {
        const baseName = base.split(/[<(]/)[0].trim();
        if (knownSymbols.has(baseName)) {
          addEdge(className, baseName, "extends");
        }
      }
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

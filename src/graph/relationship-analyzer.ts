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
import type { EdgeRelation, Confidence } from "./symbol-graph.js";

export interface AnalyzedEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: Confidence;
}

export class RelationshipAnalyzer {
  /**
   * Analyze symbols and source code to extract relationships.
   * Returns deduplicated edges.
   *
   * Confidence stamping:
   *   - `extends` / `implements` from keyword-anchored class decl lines
   *     are EXTRACTED — directly visible in the source.
   *   - `calls` from line-based regex matching (no real AST/scope
   *     resolution) is INFERRED — we may false-positive on shadowed
   *     names, string literals that look like identifiers, etc.
   */
  analyze(symbols: Symbol[], code: string): AnalyzedEdge[] {
    const lines = code.split("\n");
    const symbolNames = new Set(symbols.map((s) => s.name));
    const edges: AnalyzedEdge[] = [];
    const edgeSet = new Set<string>();

    const addEdge = (source: string, target: string, relation: EdgeRelation, confidence: Confidence) => {
      const key = `${source}|${target}|${relation}|${confidence}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source, target, relation, confidence });
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
    // Pre-compile symbol name regexes for O(1) lookup per line
    const funcSymbols = symbols.filter(
      (sym) => sym.kind === "function" || sym.kind === "method"
    );
    if (funcSymbols.length === 0 || symbolNames.size === 0) return edges;

    const escapedNames = [...symbolNames]
      .filter((n) => n.length > 0)
      .map((n) => escapeRegex(n));
    if (escapedNames.length === 0) return edges;

    const MAX_ALTERNATION = 500;
    const useBatchRegex = escapedNames.length <= MAX_ALTERNATION;

    const CALL_PATTERN = useBatchRegex
      ? new RegExp(
          `(?:\\b(${escapedNames.join("|")})\\s*\\(|this\\.(${escapedNames.join("|")})\\s*\\()`,
          "g"
        )
      : null;

    const callPatterns = useBatchRegex
      ? null
      : new Map<string, RegExp>(
          escapedNames.map((n) => [n, new RegExp(`(?:\\b${n}\\s*\\(|this\\.${n}\\s*\\()`)])
        );

    for (const sym of funcSymbols) {
      const bodyStart = sym.startLine;
      const bodyEnd = sym.endLine;

      const seenTargets = new Set<string>();

      for (let lineIdx = bodyStart - 1; lineIdx < bodyEnd && lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        if (useBatchRegex && CALL_PATTERN) {
          CALL_PATTERN.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = CALL_PATTERN.exec(line)) !== null) {
            const targetName = match[1] || match[2];
            if (!targetName) continue;
            if (targetName === sym.name && lineIdx === bodyStart - 1) continue;
            if (!seenTargets.has(targetName)) {
              seenTargets.add(targetName);
              addEdge(sym.name, targetName, "calls", "INFERRED");
            }
          }
        } else if (callPatterns) {
          for (const [targetName, pattern] of callPatterns) {
            if (targetName === sym.name && lineIdx === bodyStart - 1) continue;
            if (seenTargets.has(targetName)) continue;
            if (pattern.test(line)) {
              seenTargets.add(targetName);
              addEdge(sym.name, targetName, "calls", "INFERRED");
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
    addEdge: (s: string, t: string, r: EdgeRelation, c: Confidence) => void
  ): void {
    // TypeScript/JavaScript: class Foo extends Bar implements Baz, Qux
    const extendsMatch = declLine.match(/\bextends\s+(\w+)/);
    if (extendsMatch && knownSymbols.has(extendsMatch[1])) {
      addEdge(className, extendsMatch[1], "extends", "EXTRACTED");
    }

    const implementsMatch = declLine.match(/\bimplements\s+([\w\s,]+)/);
    if (implementsMatch) {
      const interfaces = implementsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const iface of interfaces) {
        // Take just the identifier (no generics)
        const ifaceName = iface.split(/[<{]/)[0].trim();
        if (knownSymbols.has(ifaceName)) {
          addEdge(className, ifaceName, "implements", "EXTRACTED");
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
          addEdge(className, baseName, "extends", "EXTRACTED");
        }
      }
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

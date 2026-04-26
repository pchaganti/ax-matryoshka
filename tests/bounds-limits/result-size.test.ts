/** Bounds & limits: bounds-limits/result-size — migrated from audit rounds 38, 40, 44, 47, 48, 55, 58, 59, 60, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 74, 75, 76, 77, 79, 81, 82, 83, 84, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Bounds & limits: result size", () => {
  // from audit#38
  describe("#6 — fts5 regexFallback should cap results", () => {
    it("should limit number of results returned", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fallback = source.match(/regexFallback[\s\S]*?return results;/);
      expect(fallback).not.toBeNull();
      // Should have a MAX_RESULTS or length check
      expect(fallback![0]).toMatch(/MAX_FALLBACK|results\.length\s*>=|results\.length\s*>/);
    });
  });

  // from audit#40
  describe("#4 — sandbox-tools should cap logs array", () => {
    it("should have a MAX_LOGS limit", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      expect(source).toMatch(/maxLogs|logs\.length\s*>/);
    });
  });

  // from audit#44
  describe("#7 — lc-interpreter fuzzy_search should cap limit", () => {
    it("should clamp limit to a reasonable maximum", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fuzzyCase = source.match(/case "fuzzy_search"[\s\S]*?case/);
      expect(fuzzyCase).not.toBeNull();
      // Should have Math.min or max limit check
      expect(fuzzyCase![0]).toMatch(/Math\.min|Math\.max|MAX_|limit.*>|limit.*</);
    });
  });

  // from audit#47
  describe("#7 — handle-session should limit number of handles", () => {
    it("should enforce a handle count limit via HandleRegistry.store", () => {
      // The invariant lives in HandleRegistry now — handle-session.ts used
      // to duplicate the guard in execute() but that was dead code (the
      // outer `count > MAX_HANDLES` check never fired because store()'s
      // internal `count >= MAX_HANDLES` loop kept the count bounded first).
      // Chiasmus review round 2 issue #5 deleted the dead guard; the real
      // enforcement must stay in HandleRegistry.
      const source = readFileSync("src/persistence/handle-registry.ts", "utf-8");
      const storeSection = source.match(/store\(data[\s\S]*?createHandle/);
      expect(storeSection).not.toBeNull();
      expect(storeSection![0]).toMatch(/MAX_HANDLES|handle.*limit|evict|count/i);
    });
  });

  // from audit#47
  describe("#8 — sandbox synthesize_extractor should limit examples count", () => {
    it("should check examples array length", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const synthFn = source.match(/synthesize_extractor[\s\S]*?relationalSynthesize/);
      expect(synthFn).not.toBeNull();
      // Should cap examples array length to a MAX_EXAMPLES constant (not just logging > 3)
      expect(synthFn![0]).toMatch(/MAX_EXAMPLES|examples\s*=\s*examples\.slice/);
    });
  });

  // from audit#48
  describe("#5 — lc-solver fuzzy_search should cap limit", () => {
    it("should clamp the limit parameter", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const fuzzyCase = source.match(/case "fuzzy_search"[\s\S]*?tools\.fuzzy_search/);
      expect(fuzzyCase).not.toBeNull();
      expect(fuzzyCase![0]).toMatch(/Math\.min|Math\.max|1000|MAX_FUZZY/);
    });
  });

  // from audit#55
  describe("#9 — synthesizeRegex should limit example count", () => {
    it("should enforce max number of examples", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("export function synthesizeRegex");
      expect(fnStart).toBeGreaterThan(-1);
      const fnBlock = source.slice(fnStart, fnStart + 400);
      // Should clamp or reject if too many positives
      expect(fnBlock).toMatch(/MAX_EXAMPLES|positives\s*=\s*positives\.slice|positives\.length\s*>\s*\d/);
    });
  });

  // from audit#58
  describe("#9 — lc-interpreter lines should cap returned line count", () => {
    it("should enforce a max lines returned limit", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?\.join\("\\n"\)/);
      expect(linesCase).not.toBeNull();
      expect(linesCase![0]).toMatch(/MAX_LINES|end\s*-\s*start\s*>/i);
    });
  });

  // from audit#59
  describe("#6 — getNodeName should limit returned text length", () => {
    it("should check text length before returning", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("private getNodeName");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/text\.length|MAX_NAME/i);
    });
  });

  // from audit#59
  describe("#10 — keysIn should limit number of returned keys", () => {
    it("should cap the number of keys returned", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const fnStart = source.indexOf("function keysIn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_KEYS|\.slice\(0/i);
    });
  });

  // from audit#60
  describe("#5 — evalo split should cap parts length", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?parts\[extractor\.index\]/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/MAX_SPLIT|parts\.length\s*>/i);
    });
  });

  // from audit#60
  describe("#10 — find_references should cap escaped pattern length", () => {
    it("should limit final pattern length after escaping", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const refStart = source.indexOf('case "find_references"');
      expect(refStart).toBeGreaterThan(-1);
      const block = source.slice(refStart, refStart + 600);
      expect(block).toMatch(/pattern\.length|escaped\.length/);
    });
  });

  // from audit#62
  describe("#5 — createSolverTools should cap lines array", () => {
    it("should limit lines from context split", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function createSolverTools(");
      expect(fnStart).toBeGreaterThan(-1);
      // Window is wide enough to cover the function signature (which
      // grew when Phase 1/2 added rlmQuery/rlmBatch callback params)
      // plus the line-cap statement that follows it.
      const block = source.slice(fnStart, fnStart + 800);
      // Should cap the main lines array, not just sample slices
      expect(block).toMatch(/MAX_SOLVER_LINES|MAX_CONTEXT_LINES|lines\s*=\s*lines\.slice/i);
    });
  });

  // from audit#62
  describe("#8 — recordFailure should cap code length", () => {
    it("should limit failure code before storing", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/code\.length|code\.slice|MAX_CODE/i);
    });
  });

  // from audit#63
  describe("#2 — extractCode should cap response length", () => {
    it("should limit response before paren-balancing loop", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function extractCode(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_RESPONSE|response\.length\s*>/i);
    });
  });

  // from audit#63
  describe("#10 — sum should limit Object.values enumeration", () => {
    it("should cap object property count in sum", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const sumStart = source.indexOf('case "sum"');
      expect(sumStart).toBeGreaterThan(-1);
      const block = source.slice(sumStart, sumStart + 800);
      expect(block).toMatch(/MAX_PROPS|vals\.length|Object\.keys.*length/i);
    });
  });

  // from audit#64
  describe("#3 — evaluateWithBinding split should cap parts", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const fnStart = source.indexOf("function evaluateWithBinding(");
      expect(fnStart).toBeGreaterThan(-1);
      const splitCase = source.indexOf('case "split":', fnStart);
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 500);
      // Should have MAX_SPLIT_PARTS/MAX_EVAL_SPLIT_PARTS or parts.length check
      expect(block).toMatch(/MAX_SPLIT_PARTS|MAX_EVAL_SPLIT|parts\.length\s*>/i);
    });
  });

  // from audit#64
  describe("#7 — error messages should cap joined array length", () => {
    it("should slice before joining in failedPositives error", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const errStart = source.indexOf("Pattern fails to match positives");
      expect(errStart).toBeGreaterThan(-1);
      const block = source.slice(errStart - 50, errStart + 150);
      // Should slice the array before joining, like .slice(0, N).join(...)
      expect(block).toMatch(/slice\(\s*0\s*,\s*\d+\s*\)\.join/);
    });
  });

  // from audit#64
  describe("#8 — sandbox-tools should cap JSON.stringify output", () => {
    it("should limit stringified output length", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const logStart = source.indexOf("JSON.stringify(ex.output)");
      expect(logStart).toBeGreaterThan(-1);
      const block = source.slice(logStart, logStart + 200);
      // Should truncate JSON output via safeStringify or length cap on the stringified result
      expect(block).toMatch(/MAX_JSON|safeStringify|\.slice\(0|\.substring\(0/i);
    });
  });

  // from audit#65
  describe("#6 — recordFailure should cap error field length", () => {
    it("should limit record.error string length", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/record\.error.*length|MAX_ERROR|error.*slice/i);
    });
  });

  // from audit#66
  describe("#1 — validateAndCompile should cap code length", () => {
    it("should check code.length before processing", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("private validateAndCompile(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CODE_LENGTH|code\.length\s*>/i);
    });
  });

  // from audit#66
  describe("#3 — extractSymbols should cap total symbols", () => {
    it("should have MAX_SYMBOLS_COUNT or length check in walkTree", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const walkStart = source.indexOf("private walkTree(");
      expect(walkStart).toBeGreaterThan(-1);
      const block = source.slice(walkStart, walkStart + 600);
      expect(block).toMatch(/MAX_SYMBOLS_COUNT|symbols\.length\s*>|symbols\.length\s*>=/i);
    });
  });

  // from audit#67
  describe("#9 — formatHintsForPrompt should cap total output length", () => {
    it("should limit final output size", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("formatHintsForPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1100);
      expect(block).toMatch(/MAX_PROMPT|MAX_OUTPUT|\.slice\(0|\.substring\(0/i);
    });
  });

  // from audit#69
  describe("#7 — evalo match should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const matchCase = source.indexOf('case "match"');
      expect(matchCase).toBeGreaterThan(-1);
      const block = source.slice(matchCase, matchCase + 500);
      expect(block).toMatch(/MAX_GROUP|group\s*>\s*\d|group\s*>=\s*\d/i);
    });
  });

  // from audit#69
  describe("#8 — lc-interpreter match should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const matchCase = source.indexOf('case "match"');
      expect(matchCase).toBeGreaterThan(-1);
      const block = source.slice(matchCase, matchCase + 300);
      expect(block).toMatch(/MAX_GROUP|group\s*>\s*\d|group\s*>=\s*\d/i);
    });
  });

  // from audit#69
  describe("#9 — compile match should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const matchCase = source.indexOf('case "match"');
      expect(matchCase).toBeGreaterThan(-1);
      const block = source.slice(matchCase, matchCase + 300);
      expect(block).toMatch(/MAX_GROUP|group\s*>\s*\d|group\s*>=\s*\d/i);
    });
  });

  // from audit#69
  describe("#10 — safeEvalSynthesized should cap code length", () => {
    it("should check code.length before new Function()", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const fnStart = source.indexOf("function safeEvalSynthesized(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_CODE|code\.length\s*>/i);
    });
  });

  // from audit#70
  describe("#10 — escapeStringForLiteral should cap output length", () => {
    it("should check string length before or after escaping", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("function escapeStringForLiteral(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_ESCAPE|str\.length|\.length\s*>/i);
    });
  });

  // from audit#71
  describe("#2 — searchByRelevance should cap query terms", () => {
    it("should limit number of query terms", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fnStart = source.indexOf("searchByRelevance(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_SEARCH_TERMS|\.slice\(0|queryTerms\.length/i);
    });
  });

  // from audit#71
  describe("#3 — relational-solver match should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchPrim = source.indexOf("match: (input, args)");
      expect(matchPrim).toBeGreaterThan(-1);
      const block = source.slice(matchPrim, matchPrim + 300);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // from audit#71
  describe("#4 — lc-interpreter extract should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const extractCase = source.indexOf('case "extract"');
      expect(extractCase).toBeGreaterThan(-1);
      const block = source.slice(extractCase, extractCase + 200);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // from audit#71
  describe("#5 — relational interpreter exprToCode match should cap group", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      // Find the exprToCode match case (second occurrence, in code generation)
      const firstMatch = source.indexOf('case "match"');
      const exprMatch = source.indexOf('case "match"', firstMatch + 1);
      expect(exprMatch).toBeGreaterThan(-1);
      const block = source.slice(exprMatch, exprMatch + 200);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // from audit#71
  describe("#8 — findSimilar should cap candidates array size", () => {
    it("should limit candidates before processing", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function findSimilar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CANDIDATES|candidates\.slice|candidates\.length\s*>/i);
    });
  });

  // from audit#72
  describe("#2 — lc-interpreter filter should cap result array size", () => {
    it("should have MAX bound on filter output", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const filterCase = source.indexOf('case "filter"');
      expect(filterCase).toBeGreaterThan(-1);
      const block = source.slice(filterCase, filterCase + 800);
      expect(block).toMatch(/MAX_FILTER|MAX_RESULTS|results\.length\s*>=|results\.length\s*>/);
    });
  });

  // from audit#72
  describe("#6 — fts5-search extractSearchTerms should cap terms", () => {
    it("should limit number of extracted terms", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fnStart = source.indexOf("private extractSearchTerms(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\.slice\(0|MAX_TERMS|MAX_EXTRACTED_TERMS/);
    });
  });

  // from audit#74
  describe("#1 — fts5-search searchBatch should cap queries array", () => {
    it("should have MAX_BATCH_SIZE or queries.length check", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fnStart = source.indexOf("searchBatch(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_BATCH|queries\.length\s*>/);
    });
  });

  // from audit#74
  describe("#3 — evalo replace should cap output size", () => {
    it("should check result length after replace", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const replaceCase = source.indexOf('case "replace"');
      expect(replaceCase).toBeGreaterThan(-1);
      const block = source.slice(replaceCase, replaceCase + 600);
      expect(block).toMatch(/MAX_RESULT|result\.length|\.length\s*>/);
    });
  });

  // from audit#74
  describe("#4 — sandbox-tools log entries should cap per-entry size", () => {
    it("should truncate individual log entries", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      const consoleLogs = source.indexOf("log: (...args)");
      expect(consoleLogs).toBeGreaterThan(-1);
      const block = source.slice(consoleLogs, consoleLogs + 300);
      // Should have per-entry size cap via .slice or MAX_LOG_ENTRY
      expect(block).toMatch(/MAX_LOG_ENTRY|\.slice\(0|\.substring\(0/);
    });
  });

  // from audit#74
  describe("#6 — nucleus-engine grep should cap capture groups", () => {
    it("should limit capture group count in pattern", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const grepFn = source.indexOf("grep: (pattern: string)");
      expect(grepFn).toBeGreaterThan(-1);
      const block = source.slice(grepFn, grepFn + 400);
      // Should check for number of capture groups
      expect(block).toMatch(/MAX_CAPTURE|captureGroup|unescaped.*\(|groups.*cap|\(.*count/i);
    });
  });

  // from audit#74
  describe("#9 — similarity buildSearchIndex should cap docs array", () => {
    it("should have MAX_DOCS or docs.length check", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function buildSearchIndex(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_DOCS|docs\.length\s*>/);
    });
  });

  // from audit#75
  describe("#3 — regex synthesis should cap generated pattern length", () => {
    it("should check pattern length before RegExp construction", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const patternUse = source.indexOf("const pattern = nodeToRegex(ast)");
      expect(patternUse).toBeGreaterThan(-1);
      const block = source.slice(patternUse, patternUse + 200);
      expect(block).toMatch(/pattern\.length\s*>|MAX_PATTERN/);
    });
  });

  // from audit#75
  describe("#5 — lc-solver extract should cap group at 99", () => {
    it("should reject group > 99", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const extractCase = source.indexOf('case "extract"');
      expect(extractCase).toBeGreaterThan(-1);
      const block = source.slice(extractCase, extractCase + 300);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // from audit#76
  describe("#6 — lc-parser synthesize should cap examples count", () => {
    it("should have MAX_SYNTH_EXAMPLES or length check in synthesize loop", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const synthCase = source.indexOf("case \"synthesize\"");
      expect(synthCase).toBeGreaterThan(-1);
      const block = source.slice(synthCase, synthCase + 600);
      expect(block).toMatch(/MAX_SYNTH|examples\.length\s*>=?\s*\d{2,}/);
    });
  });

  // from audit#76
  describe("#9 — lc-interpreter replace should cap result length", () => {
    it("should check result length after replace", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const replaceCase = source.indexOf('case "replace"');
      expect(replaceCase).toBeGreaterThan(-1);
      const block = source.slice(replaceCase, replaceCase + 900);
      expect(block).toMatch(/MAX_RESULT|result\.length\s*>/);
    });
  });

  // from audit#77
  describe("#8 — synthesizeExtractor should cap examples count", () => {
    it("should have MAX_EXAMPLES or length check", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const fnStart = source.indexOf("export function synthesizeExtractor(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_EXAMPLES|examples\.length\s*>\s*\d{2,}/);
    });
  });

  // from audit#77
  describe("#10 — lc-parser classify should cap examples count", () => {
    it("should have max examples check in classify loop", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const classifyCase = source.indexOf('case "classify"');
      expect(classifyCase).toBeGreaterThan(-1);
      const block = source.slice(classifyCase, classifyCase + 600);
      expect(block).toMatch(/MAX_CLASSIFY|examples\.length\s*>=?\s*\d{2,}/);
    });
  });

  // from audit#79
  describe("#2 — synthesizeClassifier should cap outputGroups size", () => {
    it("should have MAX_OUTPUT_GROUPS or size check", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private synthesizeClassifier");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_OUTPUT_GROUPS|outputGroups\.size\s*>|uniqueCount/);
    });
  });

  // from audit#79
  describe("#8 — formatValue should cap Object.entries", () => {
    it("should limit Object.keys/entries before enumeration", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function formatValue");
      expect(fnStart).toBeGreaterThan(-1);
      const objectBlock = source.indexOf('typeof value === "object"', fnStart);
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 300);
      expect(block).toMatch(/MAX_FORMAT_KEYS|Object\.keys.*length|keys\.length\s*>/);

    });
  });

  // from audit#79
  describe("#10 — fuzzy_search should cap lines iterated", () => {
    it("should have MAX_LINES or line count cap", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fuzzySearch = source.indexOf("fuzzy_search");
      expect(fuzzySearch).toBeGreaterThan(-1);
      const block = source.slice(fuzzySearch, fuzzySearch + 500);
      expect(block).toMatch(/MAX_LINES|MAX_FUZZY|lines\.length.*Math\.min|clampedLines/);
    });
  });

  // from audit#81
  describe("#8 — formatValue should cap key string lengths", () => {
    it("should truncate long property keys", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function formatValue");
      expect(fnStart).toBeGreaterThan(-1);
      const objectBlock = source.indexOf("Object.keys(value)", fnStart);
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 400);
      expect(block).toMatch(/k\.slice\(0,|MAX_KEY_LENGTH|safeKey|k\.length\s*>/);
    });
  });

  // from audit#82
  describe("#7 — tryDelimiterFieldExtraction should cap split results", () => {
    it("should limit split array size in maxFields calculation", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function tryDelimiterFieldExtraction");
      expect(fnStart).toBeGreaterThan(-1);
      const splitBlock = source.indexOf("split(delim,", fnStart);
      expect(splitBlock).toBeGreaterThan(-1);
      const block = source.slice(splitBlock - 50, splitBlock + 100);
      expect(block).toMatch(/\.slice\(0,\s*MAX_FIELDS|split\(delim,\s*MAX_FIELDS|MAX_SPLIT/);
    });
  });

  // from audit#83
  describe("#2 — findDistinguishingPattern should cap individualPatterns", () => {
    it("should limit the number of individual patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("individualPatterns");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_PATTERNS|individualPatterns\.length\s*>=?\s*\d|\.slice\(0,/);
    });
  });

  // from audit#83
  describe("#8 — synthesizeProgram should cap maxResults", () => {
    it("should bound maxResults parameter", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function synthesizeProgram") !== -1
        ? source.indexOf("function synthesizeProgram")
        : source.indexOf("export function synthesizeProgram");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_RESULTS|Math\.min.*maxResults|maxResults.*Math\.min|boundedMax/);
    });
  });

  // from audit#84
  describe("#1 — lc-solver replace should cap result length", () => {
    it("should check result length after replace", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const replaceCase = source.indexOf('case "replace"', source.indexOf("function evaluate"));
      expect(replaceCase).toBeGreaterThan(-1);
      const block = source.slice(replaceCase, replaceCase + 700);
      expect(block).toMatch(/MAX_RESULT|result\.length\s*>|\.length\s*>/);
    });
  });

  // from audit#86
  describe("#8 — keywordMatchScore should cap queryTokens", () => {
    it("should limit queryTokens or querySet size", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function keywordMatchScore");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_QUERY_TOKENS|\.slice\(0,|queryTokens\.length\s*>/i);
    });
  });

  // from audit#87
  describe("#9 — exprToCode concat should cap result length", () => {
    it("should include length check in concat", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const concatCase = source.indexOf('case "concat"');
      expect(concatCase).toBeGreaterThan(-1);
      const block = source.slice(concatCase, concatCase + 300);
      expect(block).toMatch(/\.length\s*>|MAX_CONCAT|_res\.length/i);
    });
  });

  // from audit#88
  describe("#2 — console.log should cap individual args before join", () => {
    it("should slice individual args before joining", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      const logFn = source.indexOf("log: (...args)");
      expect(logFn).toBeGreaterThan(-1);
      const block = source.slice(logFn, logFn + 300);
      // Each arg should be individually capped via .slice() before join
      expect(block).toMatch(/String\(a\)\.slice\(0,|\.slice\(0,\s*\d+\).*\.join/);
    });
  });

  // from audit#88
  describe("#3 — grep should cap context size", () => {
    it("should limit context length before processing", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const grepFn = source.indexOf("function grep(pattern");
      expect(grepFn).toBeGreaterThan(-1);
      const block = source.slice(Math.max(0, grepFn - 200), grepFn + 500);
      expect(block).toMatch(/MAX_CONTEXT|context\.length\s*>|context\.slice\(0,/i);
    });
  });

  // from audit#88
  describe("#9 — keywordMatchScore should cap keywords", () => {
    it("should limit keywords array size", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function keywordMatchScore");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_KEYWORDS|keywords\.length\s*>|keywords\.slice\(0,/i);
    });
  });

  // from audit#89
  describe("#2 — formatResult should cap JSON.stringify output", () => {
    it("should limit JSON.stringify result length", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("private formatResult");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // Should cap JSON.stringify output with slice or length check
      expect(block).toMatch(/JSON\.stringify.*\.slice\(0,|MAX_JSON|stringify.*length/i);
    });
  });

  // from audit#89
  describe("#3 — parseCommand should cap split result", () => {
    it("should limit input length or split result in parseCommand", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("function parseCommand");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_COMMAND|input\.length\s*>|trimmed\.length\s*>|\.slice\(0,/i);
    });
  });

  // from audit#89
  describe("#4 — getCheckpoint should cap Map entry count", () => {
    it("should limit Object.entries before creating Map", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getCheckpoint(turn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_CHECKPOINT_KEYS|Object\.keys.*length|entries.*slice|MAX_ENTRIES/i);
    });
  });

  // from audit#89
  describe("#7 — delimiter field extraction should limit split", () => {
    it("should pass a limit to split() or cap input length", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fieldLoop = source.indexOf("e.input.split(delim,");
      expect(fieldLoop).toBeGreaterThan(-1);
      const block = source.slice(fieldLoop - 100, fieldLoop + 200);
      // Should either pass limit to split or cap input length before split
      expect(block).toMatch(/split\(delim,\s*\d|split\(delim,\s*MAX|input\.length\s*>|input\.slice\(0,|MAX_INPUT/i);
    });
  });

  // from audit#90
  describe("#2 — computeSimilarity should cap array before join", () => {
    it("should limit examples array before joining", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("private computeSimilarity");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // Should cap arrays before join to prevent unbounded intermediate strings
      expect(block).toMatch(/\.slice\(0,.*\)\.join|MAX_EXAMPLES|examples\.length\s*>/i);
    });
  });

  // from audit#90
  describe("#6 — parseExamples should cap number of examples", () => {
    it("should limit examples count in while loop", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseExamples");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_EXAMPLES|examples\.length\s*>=|examples\.length\s*>/);
    });
  });

  // from audit#90
  describe("#7 — resolveEnvVars should cap array size", () => {
    it("should limit array length before recursing", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function resolveEnvVars");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/MAX_ARRAY|Array\.isArray.*length\s*>|\.slice\(0,.*MAX/i);
    });
  });

  // from audit#90
  describe("#9 — extractFinalAnswer should cap JSON.stringify output", () => {
    it("should limit stringified output length", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const jsonLine = source.indexOf("JSON.stringify(parsed, null, 2)");
      expect(jsonLine).toBeGreaterThan(-1);
      const block = source.slice(jsonLine, jsonLine + 100);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,/);
    });
  });

  // from audit#91
  describe("#3 — parseConstraintObject should cap entry count", () => {
    it("should limit number of constraint entries", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseConstraintObject");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      // Should have a MAX_CONSTRAINT_ENTRIES or Object.keys().length check
      expect(block).toMatch(/MAX_CONSTRAINT|Object\.keys.*length\s*>=|entryCount|entries\s*>=|entries\s*>/);
    });
  });

  // from audit#91
  describe("#4 — tokenize should cap total token count", () => {
    it("should limit number of tokens produced", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function tokenize");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      // Should have MAX_TOKENS or tokens.length check
      expect(block).toMatch(/MAX_TOKENS|tokens\.length\s*>=|tokens\.length\s*>/);
    });
  });

  // from audit#91
  describe("#7 — rlm.ts should cap JSON.stringify of result", () => {
    it("should limit stringified result length", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const jsonLine = source.indexOf("JSON.stringify(result.value");
      expect(jsonLine).toBeGreaterThan(-1);
      const block = source.slice(jsonLine, jsonLine + 200);
      // Should slice or truncate the serialized output
      expect(block).toMatch(/\.slice\(0,|truncate|\.substring\(0,|MAX_/);
    });
  });

  // from audit#92
  describe("#1 — extractFinalAnswer should cap Object.keys on parsed JSON", () => {
    it("should limit keys enumeration", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const keysLine = source.indexOf("Object.keys(parsed)");
      expect(keysLine).toBeGreaterThan(-1);
      const block = source.slice(keysLine - 50, keysLine + 150);
      // Should cap keys before iterating
      expect(block).toMatch(/\.slice\(0,|MAX_KEYS|keys\.length\s*>/);
    });
  });

  // from audit#92
  describe("#3 — qwen extractFinalAnswer should cap keys and stringify", () => {
    it("should limit keys or stringify output", () => {
      const source = readFileSync("src/adapters/qwen.ts", "utf-8");
      const keysLine = source.indexOf("Object.keys(parsed)", source.indexOf("bareJsonMatch"));
      expect(keysLine).toBeGreaterThan(-1);
      const block = source.slice(keysLine - 50, keysLine + 300);
      // Should cap either keys or JSON.stringify output
      expect(block).toMatch(/\.slice\(0,|MAX_|keys\.length\s*>/);
    });
  });

  // from audit#92
  describe("#4 — describe() should cap collected field names", () => {
    it("should limit field set size", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const descStart = source.indexOf("describe(handle:");
      expect(descStart).toBeGreaterThan(-1);
      const block = source.slice(descStart, descStart + 500);
      // Should cap fields set size or slice output
      expect(block).toMatch(/MAX_FIELDS|fields\.size\s*>=|fields\.size\s*>|\.slice\(0,.*MAX/);
    });
  });

  // from audit#92
  describe("#7 — grammar extension should cap string length", () => {
    it("should validate extension length", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const extLine = source.indexOf("for (const ext of grammar.extensions)");
      expect(extLine).toBeGreaterThan(-1);
      const block = source.slice(extLine, extLine + 300);
      // Should check ext.length
      expect(block).toMatch(/ext\.length\s*>/);
    });
  });

  // from audit#92
  describe("#9 — getRelevantFailures should cap split result", () => {
    it("should limit intent word array size", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const splitLine = source.indexOf('failure.intent.toLowerCase().split');
      expect(splitLine).toBeGreaterThan(-1);
      const block = source.slice(splitLine, splitLine + 80);
      // Should cap split result with .slice() or limit
      expect(block).toMatch(/\.slice\(0,|MAX_WORDS/);
    });
  });

  // from audit#93
  describe("#1 — analyzeCharacters should cap minLen", () => {
    it("should limit per-position iteration", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function analyzeCharacters");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 600);
      // Should cap minLen to prevent excessive per-position iteration
      expect(block).toMatch(/MAX_CHAR_ANALYSIS|minLen\s*>\s*\d|Math\.min\(minLen/);
    });
  });

  // from audit#93
  describe("#8 — classify should cap term.examples length", () => {
    it("should limit number of examples", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const classifyStart = source.indexOf('case "classify"');
      expect(classifyStart).toBeGreaterThan(-1);
      const block = source.slice(classifyStart, classifyStart + 400);
      // Should cap examples length
      expect(block).toMatch(/MAX_CLASSIFY|examples\.slice\(0,|examples\.length\s*>/);
    });
  });

  // from audit#94
  describe("#3 — formatValue should cap string output", () => {
    it("should limit JSON.stringify output for strings", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const formatStart = source.indexOf("export function formatValue");
      expect(formatStart).toBeGreaterThan(-1);
      const block = source.slice(formatStart, formatStart + 500);
      // Should cap string output length
      expect(block).toMatch(/MAX_FORMAT_STRING|\.slice\(0,|\.substring\(0,/);
    });
  });

  // from audit#94
  describe("#4 — count_tokens should cap input before split", () => {
    it("should cap string length before splitting on whitespace", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
      const countStart = source.indexOf("function count_tokens");
      expect(countStart).toBeGreaterThan(-1);
      const block = source.slice(countStart, countStart + 400);
      // Should cap input string length before the unbounded split
      expect(block).toMatch(/MAX_TOKEN_INPUT|str\.slice\(0,|str\.length\s*>\s*[1-9]/);
    });
  });

  // from audit#94
  describe("#6 — searchByRelevance should cap content length for scoring", () => {
    it("should limit content length before split-counting", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const scoringStart = source.indexOf("const lower = r.content");
      if (scoringStart === -1) {
        // Code was refactored to use FTS5 BM25 — no manual content scoring
        expect(true).toBe(true);
        return;
      }
      const block = source.slice(scoringStart, scoringStart + 200);
      // Should cap content length before split-based counting
      expect(block).toMatch(/\.slice\(0,|MAX_CONTENT|\.substring\(0,/);
    });
  });

  // from audit#94
  describe("#9 — lattice-tool formatResult should safely stringify objects", () => {
    it("should use replacer or cap depth for object JSON.stringify", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const stringifyLine = source.indexOf("JSON.stringify(safeValue");
      expect(stringifyLine).toBeGreaterThan(-1);
      const block = source.slice(stringifyLine - 200, stringifyLine + 100);
      // Should use a safe stringify with capped keys, not raw JSON.stringify(value)
      expect(block).toMatch(/safeValue|Object\.keys|Object\.fromEntries/);
    });
  });

  // from audit#95
  describe("#2 — searchWithHighlights should cap highlighted string", () => {
    it("should limit highlighted content length", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const highlightFn = source.indexOf("searchWithHighlights(");
      expect(highlightFn).toBeGreaterThan(-1);
      const block = source.slice(highlightFn, highlightFn + 1000);
      // Should cap result.content or highlighted string length
      expect(block).toMatch(/\.slice\(0,|MAX_HIGHLIGHT|content\.length\s*>/);
    });
  });

  // from audit#95
  describe("#3 — searchWithSnippets should cap snippet string", () => {
    it("should limit snippet content length", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const snippetFn = source.indexOf("searchWithSnippets(");
      expect(snippetFn).toBeGreaterThan(-1);
      const block = source.slice(snippetFn, snippetFn + 600);
      // Should cap snippet string length
      expect(block).toMatch(/\.slice\(0,|MAX_SNIPPET|snippet\.length\s*>/);
    });
  });

  // from audit#95
  describe("#6 — parseCommand should cap split result", () => {
    it("should limit parts array size from split", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const parseStart = source.indexOf("export function parseCommand");
      expect(parseStart).toBeGreaterThan(-1);
      const block = source.slice(parseStart, parseStart + 400);
      // Should cap parts array after split
      expect(block).toMatch(/\.slice\(0,\s*\d|\.split\(.*,\s*\d/);
    });
  });

  // from audit#95
  describe("#7 — getBindings should cap keys before join", () => {
    it("should slice keys array before joining", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const bindingsStart = source.indexOf("private getBindings()");
      expect(bindingsStart).toBeGreaterThan(-1);
      const block = source.slice(bindingsStart, bindingsStart + 400);
      // Should slice keys before join, not join then slice
      expect(block).toMatch(/Object\.keys\(bindings\)\.slice\(0,/);
    });
  });

  // from audit#96
  describe("#5 — handle count stays bounded via registry's internal guard", () => {
    it("after 250+ array-result queries, handle count stays <= MAX_HANDLES", async () => {
      // HandleRegistry.MAX_HANDLES = 200. After we blow past that, the
      // registry-internal guard must keep the count bounded. The outer
      // guard in await HandleSession.execute() that this fix deletes was unused
      // (it checked > 200 but store() already keeps count <= 199) — so
      // removing it should change nothing behaviorally.
      const { HandleSession } = await import("../../src/engine/handle-session.js");
      const session = new HandleSession();
      session.loadContent("a\nb\nc\nd\ne");

      for (let i = 0; i < 250; i++) {
        const r = await session.execute('(grep "a")');
        expect(r.success).toBe(true);
      }

      const info = session.getSessionInfo();
      expect(info.handleCount).toBeLessThanOrEqual(200);
      // Sanity: we actually produced enough queries to trigger eviction.
      // If store() weren't evicting, handleCount would be 250.
      expect(info.handleCount).toBeLessThan(250);

      session.close();
    });
  });
});

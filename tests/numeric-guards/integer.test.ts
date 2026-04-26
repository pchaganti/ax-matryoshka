/** Numeric guards: numeric-guards/integer — migrated from audit rounds 42, 44, 45, 48, 50, 56, 58, 60, 62, 64, 65, 70, 72, 73, 77, 78, 82, 83, 86, 88, 95. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Numeric guards: integer", () => {
  // from audit#42
  describe("#9 — evalo compile should validate numeric indices as safe integers", () => {
    it("should validate group is a non-negative integer in match case", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?extractor\.group/);
      expect(matchCase).not.toBeNull();
      // Should have Number.isInteger or integer validation for group
      expect(matchCase![0]).toMatch(/isInteger|Number\.isSafeInteger|>= 0|< 0/);
    });

    it("should validate start/end are safe integers in slice case", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?extractor\.start/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/isInteger|Number\.isSafeInteger/);
    });
  });

  // from audit#44
  describe("#5 — lc-interpreter split should validate index is integer", () => {
    it("should check Number.isInteger on term.index", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/Number\.isInteger|isInteger/);
    });
  });

  // from audit#44
  describe("#10 — lc-compiler match should validate group as non-negative integer", () => {
    it("should check isInteger on group (not just < 0)", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
      expect(matchCase).not.toBeNull();
      // Must validate isInteger — simple < 0 check misses NaN, 1.5, Infinity
      expect(matchCase![0]).toMatch(/Number\.isInteger/);
    });
  });

  // from audit#45
  describe("#7 — relational-solver parseInt should validate safe integer range", () => {
    it("should check isSafeInteger or isFinite on parseInt result", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const parseIntPrim = source.match(/parseInt:\s*\(input[\s\S]*?parseFloat/);
      expect(parseIntPrim).not.toBeNull();
      expect(parseIntPrim![0]).toMatch(/isSafeInteger|isFinite/);
    });
  });

  // from audit#48
  describe("#1 — lc-solver split should check Number.isInteger on index", () => {
    it("should validate index with Number.isInteger in both evaluate paths", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Main evaluate path
      const splitCase = source.match(/case "split"[\s\S]*?term\.index < 0/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/Number\.isInteger\(term\.index\)/);
      // evaluateWithBinding path
      const splitCase2 = source.match(/case "split"[\s\S]*?body\.index < 0/);
      expect(splitCase2).not.toBeNull();
      expect(splitCase2![0]).toMatch(/Number\.isInteger\(body\.index\)/);
    });
  });

  // from audit#48
  describe("#2 — lc-solver match should check Number.isInteger on group", () => {
    it("should validate group with Number.isInteger in both evaluate paths", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Main evaluate path
      const matchCase = source.match(/case "match"[\s\S]*?term\.group < 0/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/Number\.isInteger\(term\.group\)/);
      // evaluateWithBinding path
      const matchCase2 = source.match(/case "match"[\s\S]*?body\.group < 0/);
      expect(matchCase2).not.toBeNull();
      expect(matchCase2![0]).toMatch(/Number\.isInteger\(body\.group\)/);
    });
  });

  // from audit#48
  describe("#3 — lc-solver extract should check Number.isInteger on group", () => {
    it("should validate group with Number.isInteger in both evaluate paths", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Main evaluate path
      const extractCase = source.match(/case "extract"[\s\S]*?term\.group < 0/);
      expect(extractCase).not.toBeNull();
      expect(extractCase![0]).toMatch(/Number\.isInteger\(term\.group\)/);
      // evaluateWithBinding path
      const extractCase2 = source.match(/case "extract"[\s\S]*?body\.group < 0/);
      expect(extractCase2).not.toBeNull();
      expect(extractCase2![0]).toMatch(/Number\.isInteger\(body\.group\)/);
    });
  });

  // from audit#50
  describe("#3 — relational interpreter match should validate group", () => {
    it("should check group is a safe integer before code generation", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?expr\.group[\s\S]*?exprToCode/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/isInteger|isSafeInteger/);
    });
  });

  // from audit#50
  describe("#7 — session-db getHandleDataSlice should validate offset as integer", () => {
    it("should ensure offset is a safe integer", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const sliceFn = source.match(/getHandleDataSlice[\s\S]*?Math\.max\(0/);
      expect(sliceFn).not.toBeNull();
      expect(sliceFn![0]).toMatch(/Number\.isFinite|Math\.floor/);
    });
  });

  // from audit#56
  describe("#5 — evalo split should validate index is integer", () => {
    it("should check Number.isInteger on extractor.index", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?parts\[extractor\.index\]/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/Number\.isInteger|isInteger/);
    });
  });

  // from audit#56
  describe("#6 — evalo parseInt should check isSafeInteger", () => {
    it("should guard parseInt result with isSafeInteger or isFinite", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(intResult\)[\s\S]*?intResult/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isSafeInteger|isFinite/);
    });
  });

  // from audit#58
  describe("#5 — evalo slice should use isSafeInteger for end", () => {
    it("should validate end with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?extractor\.end\)/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/isSafeInteger/);
    });
  });

  // from audit#58
  describe("#6 — compiled slice should use isSafeInteger", () => {
    it("should validate start/end with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?extractor\.end/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/isSafeInteger/);
    });
  });

  // from audit#58
  describe("#10 — take should validate n is non-negative integer", () => {
    it("should check n is valid before processing", () => {
      const source = readFileSync("src/minikanren/streams.ts", "utf-8");
      const takeFn = source.match(/export function take[\s\S]*?while/);
      expect(takeFn).not.toBeNull();
      expect(takeFn![0]).toMatch(/isInteger|Math\.floor|Math\.max\(0/);
    });
  });

  // from audit#60
  describe("#4 — saveCheckpoint should use isSafeInteger", () => {
    it("should validate turn with isSafeInteger", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("saveCheckpoint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger\(turn\)/);
    });
  });

  // from audit#62
  describe("#1 — lc-interpreter parseInt should use isSafeInteger", () => {
    it("should validate parsed int with isSafeInteger", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const caseStart = source.indexOf('case "parseInt"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 500);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#62
  describe("#4 — lc-solver parseInt should use isSafeInteger", () => {
    it("should validate parsed int with isSafeInteger", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const caseStart = source.indexOf('case "parseInt"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 300);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#64
  describe("#4 — deleteCheckpoint should validate turn parameter", () => {
    it("should check isSafeInteger on turn", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("deleteCheckpoint(turn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger.*turn|isFinite.*turn|turn\s*</i);
    });
  });

  // from audit#64
  describe("#5 — getSymbol should validate id parameter", () => {
    it("should check isFinite or isSafeInteger on id", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbol(id");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger.*id|isFinite.*id|isInteger.*id/i);
    });
  });

  // from audit#65
  describe("#2 — evaluateWithBinding parseInt should use isSafeInteger", () => {
    it("should check isSafeInteger not just isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const fnStart = source.indexOf("function evaluateWithBinding(");
      expect(fnStart).toBeGreaterThan(-1);
      const parseIntCase = source.indexOf('case "parseInt":', fnStart);
      expect(parseIntCase).toBeGreaterThan(-1);
      const block = source.slice(parseIntCase, parseIntCase + 400);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#70
  describe("#2 — verifyStringConstraint should validate minLength/maxLength as non-negative integers", () => {
    it("should check isInteger or >= 0 on minLength/maxLength", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyStringConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/minLength.*isInteger|isInteger.*minLength|minLength.*<\s*0/i);
    });
  });

  // from audit#70
  describe("#3 — verifyArrayConstraint should validate minItems/maxItems as non-negative integers", () => {
    it("should check isInteger or >= 0 on minItems/maxItems", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyArrayConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/minItems.*isInteger|isInteger.*minItems|minItems.*<\s*0/i);
    });
  });

  // from audit#72
  describe("#4 — evolutionary tryTemplateApproaches parseInt should check isSafeInteger", () => {
    it("should have isSafeInteger guard in parseInt templates", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const fnStart = source.indexOf("private tryTemplateApproaches(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // The parseInt templates should guard with isSafeInteger
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger/);
    });
  });

  // from audit#73
  describe("#10 — http readBody should validate content-length as safe integer", () => {
    it("should check isSafeInteger on parsed content-length", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const fnStart = source.indexOf("private readBody(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger/);
    });
  });

  // from audit#77
  describe("#7 — synthesis-integrator parseInt should check isSafeInteger", () => {
    it("should validate parseInt result with isSafeInteger", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      // Find the Yen format parseInt
      const yenSection = source.indexOf("parseInt(cleaned, 10)");
      expect(yenSection).toBeGreaterThan(-1);
      const block = source.slice(yenSection, yenSection + 400);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#78
  describe("#3 — split index should validate isSafeInteger", () => {
    it("should check Number.isSafeInteger on split index", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const splitCase = source.indexOf('case "split":', source.indexOf("function parseTerm"));
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 500);
      expect(block).toMatch(/isSafeInteger|Number\.isInteger/);
    });
  });

  // from audit#82
  describe("#1 — storeSymbol should use isSafeInteger for line/col fields", () => {
    it("should validate startLine/endLine with isSafeInteger", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const storeSymbol = source.indexOf("storeSymbol(");
      expect(storeSymbol).toBeGreaterThan(-1);
      const lineCheck = source.indexOf("symbol.startLine", storeSymbol);
      expect(lineCheck).toBeGreaterThan(-1);
      const block = source.slice(lineCheck - 30, lineCheck + 200);
      expect(block).toMatch(/isSafeInteger\(symbol\.startLine\)/);
    });

    it("should validate parentSymbolId with isSafeInteger", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const storeSymbol = source.indexOf("storeSymbol(");
      expect(storeSymbol).toBeGreaterThan(-1);
      const parentCheck = source.indexOf("symbol.parentSymbolId", storeSymbol);
      expect(parentCheck).toBeGreaterThan(-1);
      const block = source.slice(parentCheck, parentCheck + 100);
      expect(block).toMatch(/isSafeInteger\(symbol\.parentSymbolId\)/);
    });
  });

  // from audit#82
  describe("#6 — exprToCode parseInt should check isSafeInteger", () => {
    it("should include isSafeInteger guard in parseInt code generation", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const parseIntCase = source.indexOf('case "parseInt"', source.indexOf("function exprToCode"));
      expect(parseIntCase).toBeGreaterThan(-1);
      const block = source.slice(parseIntCase, parseIntCase + 200);
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger/);
    });
  });

  // from audit#83
  describe("#1 — compile split index should use isSafeInteger", () => {
    it("should validate split index with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 400);
      expect(block).toMatch(/isSafeInteger\(idx\)/);
    });
  });

  // from audit#86
  describe("#2 — Yen parser code string should include isSafeInteger", () => {
    it("should include isSafeInteger in generated code", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      // Find the Yen parser code string (parseInt path)
      const yenBlock = source.indexOf("const r = parseInt(cleaned, 10);");
      expect(yenBlock).toBeGreaterThan(-1);
      // The code string (not just fn) should include isSafeInteger
      const block = source.slice(yenBlock, yenBlock + 200);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#86
  describe("#4 — readBody totalBytes should have overflow guard", () => {
    it("should include isSafeInteger check on totalBytes", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const totalBytesLine = source.indexOf("totalBytes += chunk.length");
      expect(totalBytesLine).toBeGreaterThan(-1);
      const block = source.slice(totalBytesLine, totalBytesLine + 200);
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger/);
    });
  });

  // from audit#88
  describe("#1 — add should check isSafeInteger on result", () => {
    it("should include isSafeInteger in add case", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const addCase = source.indexOf('case "add"');
      expect(addCase).toBeGreaterThan(-1);
      const block = source.slice(addCase, addCase + 400);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#95
  describe("#9 — nodeToRegex should validate repeat bounds as integers", () => {
    it("should check isSafeInteger on min/max before generating quantifier", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const repeatCase = source.indexOf('case "repeat"');
      expect(repeatCase).toBeGreaterThan(-1);
      const block = source.slice(repeatCase, repeatCase + 500);
      // Should validate min/max are safe integers
      expect(block).toMatch(/isSafeInteger|isInteger|Number\.isFinite\(node\.min\)/);
    });
  });
});

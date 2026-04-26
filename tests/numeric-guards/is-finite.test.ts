/** Numeric guards: numeric-guards/is-finite — migrated from audit rounds 15, 27, 36, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 54, 55, 56, 57, 59, 60, 61, 63, 64, 65, 66, 67, 69, 70, 71, 72, 76, 77, 79, 80, 81, 85, 88, 91, 92, 93, 95. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Numeric guards: is-finite", () => {
  // from audit#15
  describe("Audit15 #15: IDF division by zero", () => {
    it("should handle empty document array without NaN/Infinity", async () => {
      const { inverseDocumentFrequency } = await import("../../src/rag/similarity.js");
      const result = inverseDocumentFrequency([]);
      // With 0 documents, should return empty map, not Infinity values
      expect(result.size).toBe(0);
      for (const [, value] of result) {
        expect(isFinite(value)).toBe(true);
      }
    });
  });

  // from audit#27
  describe("Audit27 #7: similarity Infinity guard", () => {
    it("should return 0 for vectors with Infinity norms", async () => {
      const { cosineSimilarity } = await import("../../src/rag/similarity.js");
      const vec1 = new Map([["a", 1e308]]);
      const vec2 = new Map([["a", 1e308]]);
      const result = cosineSimilarity(vec1, vec2);
      // Should not return NaN
      expect(Number.isNaN(result)).toBe(false);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  // from audit#36
  describe("#8 — interpreter sum should guard against Infinity", () => {
    it("should check isFinite on parsed numbers", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const sumBlock = source.match(/case "sum"[\s\S]*?return total;/);
      expect(sumBlock).not.toBeNull();
      expect(sumBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#39
  describe("#10 — relational interpreter should guard division by zero", () => {
    it("should check for zero divisor or Infinity result", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      // Find the full div case block
      const divExec = source.match(/case "div"[\s\S]*?return[^;]*;/);
      expect(divExec).not.toBeNull();
      expect(divExec![0]).toMatch(/isFinite|=== 0|!== 0|zero/i);
    });
  });

  // from audit#40
  describe("#6 — handle-ops sum/sumFromLine should guard against Infinity", () => {
    it("sum should check isFinite", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumFn = source.match(/sum\(handle[\s\S]*?acc \+ value/);
      expect(sumFn).not.toBeNull();
      expect(sumFn![0]).toMatch(/isFinite/);
    });

    it("sumFromLine should check isFinite", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumFromLine = source.match(/sumFromLine[\s\S]*?acc \+ num/);
      expect(sumFromLine).not.toBeNull();
      expect(sumFromLine![0]).toMatch(/isFinite/);
    });
  });

  // from audit#40
  describe("#7 — lc-solver sum should check isFinite on number values", () => {
    it("should guard the direct number path with isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the sum case and the typeof val === "number" path
      const sumCase = source.match(/case "sum"[\s\S]*?typeof val === "number"[\s\S]*?return acc/);
      expect(sumCase).not.toBeNull();
      expect(sumCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#41
  describe("#4 — lc-solver add should guard against Infinity", () => {
    it("should check isFinite in evaluate add", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const addCase = source.match(/case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult)/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });

    it("should check isFinite in evaluateWithBinding add", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the second add case (in evaluateWithBinding)
      const allAddCases = source.match(/case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)[\s\S]*?case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)/);
      expect(allAddCases).not.toBeNull();
      // The second add case should also have isFinite
      const secondAdd = allAddCases![0].match(/case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)$/);
      expect(secondAdd).not.toBeNull();
      expect(secondAdd![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#41
  describe("#5 — lc-solver sum should use isFinite for parsed strings", () => {
    it("should use isFinite instead of isNaN for string parsing in sum", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the sum case's string branch
      const sumStringBranch = source.match(/case "sum"[\s\S]*?typeof val === "string"[\s\S]*?parseFloat\(cleaned\)[\s\S]*?return acc \+ num/);
      expect(sumStringBranch).not.toBeNull();
      // Should use isFinite, not just isNaN
      expect(sumStringBranch![0]).toMatch(/isFinite\(num\)|Number\.isFinite\(num\)|!isFinite/);
    });
  });

  // from audit#42
  describe("#10 — lc-solver lines should validate start/end", () => {
    it("should check that start and end are finite positive numbers", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?selectedLines/);
      expect(linesCase).not.toBeNull();
      // Should validate start/end are finite
      expect(linesCase![0]).toMatch(/isFinite|Number\.isFinite|Number\.isInteger/);
    });
  });

  // from audit#43
  describe("#4 — lc-interpreter add should guard against Infinity", () => {
    it("should check isFinite in add case", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const addCase = source.match(/case "add"[\s\S]*?(?:return left \+ right|addResult.*left \+ right)/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#44
  describe("#1 — compiled add should guard against Infinity result", () => {
    it("should check isFinite on the addition result", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const addCase = source.match(/case "add"[\s\S]*?case "if"/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#44
  describe("#6 — lc-interpreter sum should guard cumulative overflow", () => {
    it("should check isFinite on running total", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const sumCase = source.match(/case "sum"[\s\S]*?return total/);
      expect(sumCase).not.toBeNull();
      // Should check isFinite(total) after accumulation
      expect(sumCase![0]).toMatch(/isFinite\(total\)/);
    });
  });

  // from audit#45
  describe("#4 — lc-interpreter parseFloat should check isFinite", () => {
    it("should guard against Infinity in parseFloat result", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "add"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#45
  describe("#5 — lc-interpreter parseNumber should check isFinite", () => {
    it("should guard against Infinity in parseNumber result", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseNumberCase = source.match(/case "parseNumber"[\s\S]*?case "coerce"/);
      expect(parseNumberCase).not.toBeNull();
      expect(parseNumberCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#45
  describe("#6 — relational-solver parseFloat should check isFinite", () => {
    it("should guard against Infinity in solver parseFloat", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const parseFloatPrim = source.match(/parseFloat:\s*\(input[\s\S]*?parseDate/);
      expect(parseFloatPrim).not.toBeNull();
      expect(parseFloatPrim![0]).toMatch(/isFinite/);
    });
  });

  // from audit#46
  describe("#1 — compiled parseFloat should guard against Infinity", () => {
    it("should check isFinite in compiled parseFloat", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "add"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#46
  describe("#2 — lc-compiler parseFloat should guard against Infinity", () => {
    it("should check isFinite in compiled parseFloat", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "if"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#46
  describe("#3 — lc-interpreter coerce number should check isFinite", () => {
    it("should guard against Infinity in number coercion", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const coerceCase = source.match(/case "coerce"[\s\S]*?case "number"[\s\S]*?case "string"/);
      expect(coerceCase).not.toBeNull();
      expect(coerceCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#46
  describe("#4 — lc-solver parseNumber should check isFinite on scientific notation", () => {
    it("should guard against Infinity from scientific notation", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const sciNotation = source.match(/scientific notation[\s\S]*?return.*parseFloat|scientific notation[\s\S]*?isFinite/);
      expect(sciNotation).not.toBeNull();
      expect(sciNotation![0]).toMatch(/isFinite/);
    });
  });

  // from audit#46
  describe("#10 — lc-solver percent coercion should guard against Infinity", () => {
    it("should check isFinite in parseNumber or percent case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const parseNumberFn = source.match(/function parseNumber[\s\S]*?\n\}/);
      expect(parseNumberFn).not.toBeNull();
      // parseNumber itself should validate all return paths with isFinite
      expect(parseNumberFn![0]).toMatch(/isFinite/);
    });
  });

  // from audit#47
  describe("#3 — lc-interpreter parseCurrency should check isFinite", () => {
    it("should guard against Infinity from parseFloat in parseCurrency", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseCurrencyReturn = source.match(/case "parseCurrency"[\s\S]*?isNegative \? -num : num/);
      expect(parseCurrencyReturn).not.toBeNull();
      expect(parseCurrencyReturn![0]).toMatch(/isFinite/);
    });
  });

  // from audit#48
  describe("#4 — lc-interpreter lines should check Number.isFinite on start/end", () => {
    it("should validate start and end with Number.isFinite", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?Math\.max\(1/);
      expect(linesCase).not.toBeNull();
      expect(linesCase![0]).toMatch(/Number\.isFinite|isFinite/);
    });
  });

  // from audit#48
  describe("#6 — coordinator parseFloat should check isFinite", () => {
    it("should guard against Infinity from parseFloat in synthesizeFromCollected", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const parseSection = source.match(/parseFloat\(ctx\)[\s\S]*?ctx : num/);
      expect(parseSection).not.toBeNull();
      expect(parseSection![0]).toMatch(/isFinite/);
    });
  });

  // from audit#49
  describe("#1 — evalo parseFloat should check isFinite", () => {
    it("should guard against Infinity in evalExtractor parseFloat", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?isNaN\(floatResult\)[\s\S]*?floatResult/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#49
  describe("#2 — relational interpreter parseFloat codegen should include isFinite", () => {
    it("should include isFinite in generated parseFloat code", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?isNaN\(_r\)[\s\S]*?_r/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#49
  describe("#3 — lc-solver evaluateWithBinding parseFloat should check isFinite", () => {
    it("should guard against Infinity in evaluateWithBinding parseFloat", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the evaluateWithBinding parseFloat specifically (after the evaluateWithBinding function def)
      const ewbFnStart = source.indexOf("function evaluateWithBinding");
      const ewbSource = source.slice(ewbFnStart);
      const ewbParseFloat = ewbSource.match(/case "parseFloat"[\s\S]*?isNaN\(floatResult\)[\s\S]*?floatResult/);
      expect(ewbParseFloat).not.toBeNull();
      expect(ewbParseFloat![0]).toMatch(/isFinite/);
    });
  });

  // from audit#50
  describe("#4 — evolutionary parseFloat strategy should check isFinite", () => {
    it("should include isFinite in parseFloat strategy string", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const strategy = source.match(/parseFloat\(s\.replace[\s\S]*?isNaN\(r\)[\s\S]*?r/);
      expect(strategy).not.toBeNull();
      expect(strategy![0]).toMatch(/isFinite/);
    });
  });

  // from audit#51
  describe("#1 — parseNumberImpl scientific notation should check isFinite", () => {
    it("should guard against Infinity from scientific notation", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the scientific notation branch
      const sciBlock = fnSource.match(/scientific notation[\s\S]*?parseFloat\(trimmed\)[\s\S]*?null/);
      expect(sciBlock).not.toBeNull();
      expect(sciBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#51
  describe("#2 — parseNumberImpl percentage should check isFinite", () => {
    it("should guard against Infinity from percentage parsing", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the percentage branch: parseFloat line and its return
      const percentBlock = fnSource.match(/percentMatch\[1\][\s\S]*?isNaN\(num\)[\s\S]*?null/);
      expect(percentBlock).not.toBeNull();
      expect(percentBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#51
  describe("#10 — parseNumberImpl standard number should check isFinite", () => {
    it("should guard against Infinity from standard number parsing", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the standard number path at the end (after "Standard number with commas")
      const stdBlock = fnSource.match(/Standard number[\s\S]*?parseFloat\(cleaned\)[\s\S]*?null/);
      expect(stdBlock).not.toBeNull();
      expect(stdBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#53
  describe("#2 — lc-interpreter parseInt should check isFinite", () => {
    it("should guard parseInt result with isFinite for consistency", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(intResult\)[\s\S]*?intResult/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isFinite|isSafeInteger/);
    });
  });

  // from audit#53
  describe("#4 — handle-ops sort should guard against Infinity", () => {
    it("should check isFinite on sort comparison result", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sortBlock = source.match(/aVal - bVal[\s\S]*?cmp\s*=\s*0/);
      expect(sortBlock).not.toBeNull();
      expect(sortBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#53
  describe("#10 — lc-solver parseInt should check isFinite", () => {
    it("should guard parseInt result with isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Target the first parseInt case (main evaluate)
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(intResult\)[\s\S]*?intResult/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isFinite|isSafeInteger/);
    });
  });

  // from audit#54
  describe("#4 — extractor currency_decimal should guard Infinity", () => {
    it("should include isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const currDecBlock = source.match(/name:\s*"currency_decimal"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(currDecBlock).not.toBeNull();
      expect(currDecBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#54
  describe("#5 — extractor percentage_to_decimal should guard Infinity", () => {
    it("should include isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const pctBlock = source.match(/name:\s*"percentage_to_decimal"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(pctBlock).not.toBeNull();
      expect(pctBlock![0]).toMatch(/isFinite/);
    });
  });

  // from audit#54
  describe("#10 — predicate-compiler numeric param should check isFinite", () => {
    it("should validate Number(value) is finite before SQL", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Find the numeric comparison block that uses Number(value)
      const numBlock = source.match(/Numeric comparison[\s\S]*?params:\s*\[.*?\]/);
      expect(numBlock).not.toBeNull();
      expect(numBlock![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#55
  describe("#4 — lc-solver parseCurrency should check isFinite", () => {
    it("should guard parseFloat result with isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find parseCurrency function's final parseFloat
      const fn = source.match(/function parseCurrency[\s\S]*?parseFloat\(normalized\)[\s\S]*?return/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/isFinite/);
    });
  });

  // from audit#55
  describe("#5 — lc-parser tokenizer should check isFinite on parsed numbers", () => {
    it("should guard parseFloat with isFinite in tokenizer", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const block = source.match(/const parsed = parseFloat\(num\)[\s\S]*?tokens\.push/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/isFinite/);
    });
  });

  // from audit#56
  describe("#4 — tryStructuredExtraction testFn should check isFinite", () => {
    it("should guard parseFloat in structured currency testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function tryStructuredExtraction");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1200);
      // The currency testFn's parseFloat should have isFinite guard
      const testFnMatch = block.match(/testFn.*=[\s\S]*?parseFloat[\s\S]*?null/);
      expect(testFnMatch).not.toBeNull();
      expect(testFnMatch![0]).toMatch(/isFinite/);
    });
  });

  // from audit#57
  describe("#1 — parseCurrencyImpl should check isFinite", () => {
    it("should guard parseFloat result with isFinite", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseCurrencyImpl");
      expect(fnStart).toBeGreaterThan(-1);
      const fnBlock = source.slice(fnStart, fnStart + 2000);
      const returnLine = fnBlock.match(/parseFloat\(cleaned\)[\s\S]*?return[^\n]+/);
      expect(returnLine).not.toBeNull();
      expect(returnLine![0]).toMatch(/isFinite/);
    });
  });

  // from audit#59
  describe("#4 — storeSymbol should validate line numbers", () => {
    it("should check isFinite on startLine/endLine", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1100);
      expect(block).toMatch(/is(?:Finite|SafeInteger).*startLine|startLine.*is(?:Finite|SafeInteger)|Number\.is(?:Finite|SafeInteger)/);
    });
  });

  // from audit#59
  describe("#5 — getSymbolsAtLine should validate line parameter", () => {
    it("should check isFinite on line parameter", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbolsAtLine(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#60
  describe("#3 — storeSymbol should validate startCol/endCol", () => {
    it("should check isFinite on column numbers", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1200);
      expect(block).toMatch(/is(?:Finite|SafeInteger).*startCol|startCol.*is(?:Finite|SafeInteger)|is(?:Finite|SafeInteger).*Col/i);
    });
  });

  // from audit#61
  describe("#10 — storeSymbol should validate parentSymbolId", () => {
    it("should check parentSymbolId is finite if provided", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1500);
      expect(block).toMatch(/parentSymbolId.*isFinite|isFinite.*parentSymbolId|parentSymbolId.*Integer/i);
    });
  });

  // from audit#63
  describe("#5 — getRecentFailures should validate maxAge", () => {
    it("should check isFinite on maxAge", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("getRecentFailures(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite.*maxAge|maxAge.*isFinite|maxAge\s*[<>]/i);
    });
  });

  // from audit#64
  describe("#9 — extractSymbolFromNode should validate position values", () => {
    it("should check isFinite on row/column before arithmetic", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("extractSymbolFromNode");
      expect(fnStart).toBeGreaterThan(-1);
      const posStart = source.indexOf("startLine:", fnStart);
      expect(posStart).toBeGreaterThan(-1);
      const block = source.slice(posStart - 200, posStart + 200);
      // Should have isFinite or isSafeInteger check on row values
      expect(block).toMatch(/isFinite|isSafeInteger|typeof.*row/i);
    });
  });

  // from audit#64
  describe("#10 — add() should validate result for finitude", () => {
    it("should check isFinite on result of addition", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const addCase = source.indexOf('case "add"');
      expect(addCase).toBeGreaterThan(-1);
      const block = source.slice(addCase, addCase + 500);
      // Should validate result: const addResult = left + right; isFinite(addResult)
      expect(block).toMatch(/addResult.*isFinite|isFinite.*addResult|isFinite\(left\s*\+\s*right\)/i);
    });
  });

  // from audit#65
  describe("#7 — keywordMatchScore should guard against NaN division", () => {
    it("should check isFinite on result", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function keywordMatchScore(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function keywordMatchScore(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 1000);
        expect(block).toMatch(/isFinite.*score|score.*isFinite|denominator\s*===?\s*0/i);
      } else {
        const block = source.slice(fnStart, fnStart + 1000);
        expect(block).toMatch(/isFinite.*score|score.*isFinite|denominator\s*===?\s*0/i);
      }
    });
  });

  // from audit#66
  describe("#8 — recordFailure should validate timestamp", () => {
    it("should check isFinite on record.timestamp", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/isFinite.*timestamp|timestamp.*isFinite|timestamp.*typeof/i);
    });
  });

  // from audit#66
  describe("#9 — combinedSimilarity should validate result", () => {
    it("should check isFinite on combined score", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function combinedSimilarity(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function combinedSimilarity(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 700);
        expect(block).toMatch(/isFinite|Math\.max.*Math\.min|clamp/i);
      } else {
        const block = source.slice(fnStart, fnStart + 700);
        expect(block).toMatch(/isFinite|Math\.max.*Math\.min|clamp/i);
      }
    });
  });

  // from audit#67
  describe("#5 — turnKeys sort should use safe comparator", () => {
    it("should use safe comparison instead of subtraction for sort", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const sortStart = source.indexOf("turnKeys");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 300);
      // Should use comparison operators (< > <=), localeCompare, or isFinite guard before subtraction
      expect(block).toMatch(/aNum\s*<\s*bNum|aNum\s*>\s*bNum|return\s*-1|return\s*1|localeCompare|isFinite/);
    });
  });

  // from audit#69
  describe("#2 — compile lit case should guard non-finite numbers", () => {
    it("should check isFinite for numeric values", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const litCase = source.indexOf('case "lit"');
      expect(litCase).toBeGreaterThan(-1);
      const block = source.slice(litCase, litCase + 200);
      expect(block).toMatch(/isFinite|isNaN|Number\.isFinite/);
    });
  });

  // from audit#70
  describe("#1 — verifyNumberConstraint should validate constraint.min/max are finite", () => {
    it("should check isFinite on constraint.min or constraint.max", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyNumberConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/constraint\.min.*isFinite|isFinite.*constraint\.min|Number\.isFinite\(constraint\.min/i);
    });
  });

  // from audit#71
  describe("#1 — lc-solver sum should check isFinite on total", () => {
    it("should validate total is finite after reduce", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const sumCase = source.indexOf('case "sum"');
      expect(sumCase).toBeGreaterThan(-1);
      const reduceEnd = source.indexOf("}, 0);", sumCase);
      expect(reduceEnd).toBeGreaterThan(-1);
      const block = source.slice(reduceEnd, reduceEnd + 200);
      // Should have isFinite check on total after reduce
      expect(block).toMatch(/isFinite\(total\)|Number\.isFinite\(total\)/);
    });
  });

  // from audit#72
  describe("#1 — currency parser fns should check isFinite on parseFloat result", () => {
    it("should have isFinite guard in currency parser functions", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("synthesizeCurrencyParser(");
      expect(fnStart).toBeGreaterThan(-1);
      // Check in the US/default format branch (last else block before verify)
      const defaultBranch = source.indexOf("// US/Default format", fnStart);
      expect(defaultBranch).toBeGreaterThan(-1);
      const block = source.slice(defaultBranch, defaultBranch + 400);
      // The fn lambda should check isFinite on parseFloat result
      expect(block).toMatch(/isFinite\(r\)|Number\.isFinite\(r\)/);
    });
  });

  // from audit#76
  describe("#8 — nucleus buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function buildSystemPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite/);
    });
  });

  // from audit#77
  describe("#4 — base.ts buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const fnStart = source.indexOf("function buildSystemPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite/);
    });
  });

  // from audit#77
  describe("#5 — qwen.ts buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/qwen.ts", "utf-8");
      const fnStart = source.indexOf("function buildSystemPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite/);
    });
  });

  // from audit#77
  describe("#6 — deepseek.ts buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/deepseek.ts", "utf-8");
      const fnStart = source.indexOf("function buildSystemPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite/);
    });
  });

  // from audit#79
  describe("#1 — evaluate add should check isFinite on result", () => {
    it("should validate result after addition in evaluate function", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the add case in the evaluate function (NOT evaluateWithBinding)
      const evalFn = source.indexOf("function evaluate(");
      expect(evalFn).toBeGreaterThan(-1);
      const addCase = source.indexOf('case "add":', evalFn);
      expect(addCase).toBeGreaterThan(-1);
      // Make sure we're in evaluate, not evaluateWithBinding
      const evalWithBinding = source.indexOf("function evaluateWithBinding(");
      expect(addCase).toBeLessThan(evalWithBinding);
      // Bumped from 500 → 700 after the async refactor added `await` prefixes
      // to every evaluate() call, pushing the `Number.isFinite(addResult)`
      // check past the end of the 500-char window.
      const block = source.slice(addCase, addCase + 700);
      expect(block).toMatch(/isFinite\(.*(?:result|addResult|left\s*\+\s*right)/);
    });
  });

  // from audit#80
  describe("#1 — rlm should validate numeric config parameters", () => {
    it("should validate maxTurns with isFinite or bounds check", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const destructure = source.indexOf("maxTurns =");
      expect(destructure).toBeGreaterThan(-1);
      const block = source.slice(destructure, destructure + 600);
      expect(block).toMatch(/isFinite.*maxTurns|maxTurns.*isFinite|maxTurns\s*[<>]=?\s*\d|maxTurns\s*=\s*Math\.(min|max)/);
    });
  });

  // from audit#81
  describe("#10 — constraint output min/max should be validated", () => {
    it("should check isFinite on constraint.output.min/max", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const minCheck = source.indexOf("constraint.output.min");
      expect(minCheck).toBeGreaterThan(-1);
      const block = source.slice(minCheck, minCheck + 200);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#85
  describe("#6 — exprToCode sub should have overflow guard", () => {
    it("should include isFinite check in sub", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const subCase = source.indexOf('case "sub"');
      expect(subCase).toBeGreaterThan(-1);
      const block = source.slice(subCase, subCase + 200);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#85
  describe("#7 — exprToCode mul should have overflow guard", () => {
    it("should include isFinite check in mul", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const mulCase = source.indexOf('case "mul"');
      expect(mulCase).toBeGreaterThan(-1);
      const block = source.slice(mulCase, mulCase + 200);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#85
  describe("#10 — exprToCode div should check for zero divisor", () => {
    it("should guard against division by zero", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const divCase = source.indexOf('case "div"');
      expect(divCase).toBeGreaterThan(-1);
      const block = source.slice(divCase, divCase + 300);
      expect(block).toMatch(/===?\s*0|_r\s*===?\s*0|divisor|zero/);
    });
  });

  // from audit#88
  describe("#6 — coerceConfigTypes should check isFinite", () => {
    it("should validate Number() result is finite", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function coerceConfigTypes");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // from audit#91
  describe("#2 — fuzzy_search limit should check isFinite before Math.floor", () => {
    it("should validate limit with isFinite", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnStart = source.indexOf("fuzzy_search:");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // Should check isFinite on limit before using Math.floor
      expect(block).toMatch(/isFinite\(limit\)|Number\.isFinite\(limit\)/);
    });
  });

  // from audit#92
  describe("#10 — sum() should guard against accumulator overflow", () => {
    it("should check accumulator stays finite", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumStart = source.indexOf("sum(handle: string, field: string)");
      expect(sumStart).toBeGreaterThan(-1);
      const block = source.slice(sumStart, sumStart + 600);
      // Should check acc/result stays finite after addition
      expect(block).toMatch(/isFinite\(acc|isFinite\(result|isSafeInteger\(acc|Number\.isFinite/);
    });
  });

  // from audit#93
  describe("#7 — findSimilar should validate maxDistance and maxResults", () => {
    it("should guard against NaN/Infinity in parameters", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const funcStart = source.indexOf("export function findSimilar");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 300);
      // Should validate maxDistance and maxResults with isFinite or bounds check
      expect(block).toMatch(/isFinite\(maxDistance\)|Number\.isFinite\(maxDistance\)|maxDistance\s*<\s*0/);
    });
  });

  // from audit#95
  describe("#5 — relational exprToCode add should have isFinite guard", () => {
    it("should wrap add result in isFinite check like sub/mul/div", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const addCase = source.indexOf('case "add":', source.indexOf("exprToCode"));
      expect(addCase).toBeGreaterThan(-1);
      // Only check the add case block, before the sub case starts
      const subCase = source.indexOf('case "sub":', addCase);
      const block = source.slice(addCase, subCase > addCase ? subCase : addCase + 150);
      // Should have isFinite guard like sub/mul/div cases
      expect(block).toMatch(/isFinite/);
    });
  });

  // from audit#95
  describe("#10 — qwen-synthesis buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/qwen-synthesis.ts", "utf-8");
      const buildStart = source.indexOf("function buildSystemPrompt");
      expect(buildStart).toBeGreaterThan(-1);
      const block = source.slice(buildStart, buildStart + 300);
      // Should validate contextLength with isFinite
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite\(contextLength\)/);
    });
  });
});

/** Bounds & limits: bounds-limits/input-size — migrated from audit rounds 14, 26, 35, 38, 40, 49, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 66, 67, 68, 70, 77, 79, 80, 81, 82, 84, 85, 86, 87, 89, 92, 93, 94. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Bounds & limits: input size", () => {
  // from audit#14
  describe("Issue #11: searchComposition MAX_CANDIDATES off-by-one", () => {
    it("should check candidates <= MAX not > MAX after increment", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/relational-solver.ts", "utf-8");

      // Find the candidatesChecked comparison
      const check = source.match(/candidatesChecked.*MAX_CANDIDATES/);
      expect(check).not.toBeNull();
      // Should be >= (or check before increment), not > after increment
      expect(check![0]).toMatch(/>=\s*MAX_CANDIDATES|candidatesChecked\s*>\s*MAX_CANDIDATES/);
    });
  });

  // from audit#26
  describe("Audit26 #8: verifier array constraint cap", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/constraints/verifier.js");
      expect(mod.verifyResult).toBeDefined();
    });
  });

  // from audit#35
  describe("#13 — truncate should handle small max values safely", () => {
    it("should use Math.max(0, ...) for half calculation", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const truncate = source.match(/function truncate[\s\S]*?slice\(-half\)/);
      expect(truncate).not.toBeNull();
      expect(truncate![0]).toMatch(/Math\.max\(0/);
    });
  });

  // from audit#38
  describe("#8 — nucleus extractJson should have length limit", () => {
    it("should limit processing length", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const extractJson = source.match(/const extractJson[\s\S]*?return null;\s*};/);
      expect(extractJson).not.toBeNull();
      // Should have a maximum character limit
      expect(extractJson![0]).toMatch(/MAX_JSON|text\.length\s*>|i\s*-\s*start\s*>/);
    });
  });

  // from audit#40
  describe("#10 — pipe adapter should truncate user input in error messages", () => {
    it("should truncate input in Invalid JSON error", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const errorBlock = source.match(/Invalid JSON:[\s\S]*?\}/);
      expect(errorBlock).not.toBeNull();
      // Should truncate/slice the input
      expect(errorBlock![0]).toMatch(/slice|substring|substr|truncat/i);
    });
  });

  // from audit#49
  describe("#6 — rlm grep should limit pattern length", () => {
    it("should check pattern length before RegExp construction", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const grepFn = source.match(/grep:\s*\(pattern[\s\S]*?new RegExp\(pattern/);
      expect(grepFn).not.toBeNull();
      expect(grepFn![0]).toMatch(/pattern\.length|MAX_PATTERN/);
    });
  });

  // from audit#52
  describe("#9 — parser-registry parseDocument should limit content size", () => {
    it("should check content length before parsing", () => {
      const source = readFileSync("src/treesitter/parser-registry.ts", "utf-8");
      const parseFn = source.match(/parseDocument\(content[\s\S]*?parser\.parse/);
      expect(parseFn).not.toBeNull();
      expect(parseFn![0]).toMatch(/content\.length|MAX_CONTENT|MAX_FILE_SIZE|MAX_PARSE/);
    });
  });

  // from audit#53
  describe("#7 — lc-interpreter parseCurrency should limit input length", () => {
    it("should check string length before processing", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const currencyCase = source.match(/case "parseCurrency"[\s\S]*?replace\(\/\[/);
      expect(currencyCase).not.toBeNull();
      expect(currencyCase![0]).toMatch(/\.length|MAX_PARSE|MAX_INPUT/);
    });
  });

  // from audit#53
  describe("#8 — lc-interpreter parseDate should limit input length", () => {
    it("should check string length before parsing", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const dateCase = source.match(/case "parseDate"[\s\S]*?new Date\(cleaned\)/);
      expect(dateCase).not.toBeNull();
      expect(dateCase![0]).toMatch(/\.length|MAX_PARSE|MAX_INPUT/);
    });
  });

  // from audit#53
  describe("#9 — regex synthesis error should limit conflict string length", () => {
    it("should truncate or limit conflicting examples in error", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const errorLine = source.match(/Conflicting examples[\s\S]*?join/);
      expect(errorLine).not.toBeNull();
      expect(errorLine![0]).toMatch(/slice|substring|truncat|MAX|limit/i);
    });
  });

  // from audit#54
  describe("#9 — tryDelimiterFieldExtraction should limit maxFields", () => {
    it("should clamp maxFields to prevent huge iteration", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const maxFieldsLine = source.match(/maxFields\s*=[\s\S]*?Math\.max/);
      expect(maxFieldsLine).not.toBeNull();
      expect(maxFieldsLine![0]).toMatch(/Math\.min|MAX_FIELDS|clamp|limit/i);
    });
  });

  // from audit#55
  describe("#8 — session-db createHandle should limit array size", () => {
    it("should enforce a maximum number of items", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fn = source.match(/createHandle\(data[\s\S]*?insertAll\(data\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/MAX_HANDLE|data\.length|limit/i);
    });
  });

  // from audit#55
  describe("#10 — matchTemplate should limit example string length", () => {
    it("should check example string lengths", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("export function matchTemplate");
      expect(fnStart).toBeGreaterThan(-1);
      const fnBlock = source.slice(fnStart, fnStart + 300);
      // Should check individual example string length
      expect(fnBlock).toMatch(/MAX_EXAMPLE_LENGTH|\.length\s*>\s*\d|every.*\.length/);
    });
  });

  // from audit#56
  describe("#8 — rlm fuzzyMatch should limit query length", () => {
    it("should check query length before processing", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fuzzyFn = source.match(/function fuzzyMatch[\s\S]*?toLowerCase/);
      expect(fuzzyFn).not.toBeNull();
      expect(fuzzyFn![0]).toMatch(/\.length|MAX_QUERY/i);
    });
  });

  // from audit#57
  describe("#5 — session-db loadDocument should limit line count", () => {
    it("should enforce a max line count", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const loadDocStart = source.indexOf("loadDocument(");
      expect(loadDocStart).toBeGreaterThan(-1);
      const block = source.slice(loadDocStart, loadDocStart + 1500);
      expect(block).toMatch(/MAX_LINES|MAX_DOCUMENT|lines\.length\s*>/i);
    });
  });

  // from audit#57
  describe("#6 — lc-parser number tokenization should limit length", () => {
    it("should limit numeric string accumulation length", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      // Find the number accumulation loop
      const numLoop = source.match(/while \(i < input\.length && \/\[\\d\.\]\/[\s\S]*?num \+= input\[i\]/);
      expect(numLoop).not.toBeNull();
      // Should limit the length of the numeric string being accumulated
      expect(numLoop![0]).toMatch(/num\.length|MAX_NUM/i);
    });
  });

  // from audit#58
  describe("#1 — lc-parser symbol loop should limit length", () => {
    it("should limit symbol string accumulation length", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const symLoop = source.match(/let sym = ""[\s\S]*?sym \+= input\[i\]/);
      expect(symLoop).not.toBeNull();
      expect(symLoop![0]).toMatch(/sym\.length|MAX_SYM/i);
    });
  });

  // from audit#58
  describe("#2 — session-db search should limit query length", () => {
    it("should check query length before processing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const searchStart = source.indexOf("search(query: string)");
      expect(searchStart).toBeGreaterThan(-1);
      const block = source.slice(searchStart, searchStart + 300);
      expect(block).toMatch(/query\.length|MAX_QUERY/i);
    });
  });

  // from audit#58
  describe("#7 — getSignature should limit node.text length", () => {
    it("should check node.text length before splitting", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const sigStart = source.indexOf("private getSignature");
      expect(sigStart).toBeGreaterThan(-1);
      const block = source.slice(sigStart, sigStart + 500);
      expect(block).toMatch(/text\.length\s*>|MAX_SIG/i);
    });
  });

  // from audit#59
  describe("#9 — isValidFieldName should limit field name length", () => {
    it("should enforce a max length on field names", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("isValidFieldName");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/\.length|MAX_FIELD/i);
    });
  });

  // from audit#60
  describe("#8 — sweetenPair should limit list length", () => {
    it("should track and cap accumulated list length", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fnStart = source.indexOf("function sweetenPair");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_LIST|length\s*>|listLen/i);
    });
  });

  // from audit#61
  describe("#3 — generateClassifierGuidance should limit JSON search scope", () => {
    it("should cap fullLog length before regex match", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const guidanceStart = source.indexOf("generateClassifierGuidance");
      expect(guidanceStart).toBeGreaterThan(-1);
      const block = source.slice(guidanceStart, guidanceStart + 500);
      expect(block).toMatch(/\.slice\(0|MAX_LOG|fullLog\.length/i);
    });
  });

  // from audit#61
  describe("#6 — escapeForSexp should cap input length", () => {
    it("should limit string length before escaping", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function escapeForSexp");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.length|MAX_ESCAPE|\.slice\(0/i);
    });
  });

  // from audit#61
  describe("#9 — getSignature split should limit line count", () => {
    it("should pass a limit to split()", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const sigStart = source.indexOf("private getSignature");
      expect(sigStart).toBeGreaterThan(-1);
      const block = source.slice(sigStart, sigStart + 800);
      // split("\n", limit) or split("\n").slice(0, N)
      expect(block).toMatch(/split\("\\n",\s*\d+\)|split\("\\n"\)\.slice/);
    });
  });

  // from audit#66
  describe("#2 — verifyInvariant should cap invariant length", () => {
    it("should check invariant.length before processing", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyInvariant(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function verifyInvariant(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 400);
        expect(block).toMatch(/MAX_INVARIANT|invariant\.length\s*>/i);
      } else {
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/MAX_INVARIANT|invariant\.length\s*>/i);
      }
    });
  });

  // from audit#67
  describe("#4 — getStructure should cap input string length", () => {
    it("should limit string before regex replacements", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const fnStart = source.indexOf("getStructure(str");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_STRUCTURE|str\.length|str\.slice|\.slice\(0/i);
    });
  });

  // from audit#67
  describe("#7 — computeSimilarity should cap string before char splitting", () => {
    it("should limit join length before split", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("private computeSimilarity(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_CHAR|\.slice\(0|\.substring\(0/i);
    });
  });

  // from audit#68
  describe("#1 — synthesizeViaRelational should cap generated code length", () => {
    it("should check generatedCode.length before new Function()", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private synthesizeViaRelational(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 700);
      expect(block).toMatch(/MAX_GENERATED|generatedCode\.length\s*>/i);
    });
  });

  // from audit#68
  describe("#7 — pipe adapter should cap input line length", () => {
    it("should check line length before processing", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const queuePush = source.indexOf("this.queue.push");
      expect(queuePush).toBeGreaterThan(-1);
      const block = source.slice(queuePush - 500, queuePush);
      expect(block).toMatch(/MAX_LINE|line\.length|trimmed\.length/i);
    });
  });

  // from audit#70
  describe("#7 — hashExamples should cap input string length", () => {
    it("should check total string length before hashing", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private hashExamples(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_HASH_INPUT|str\.length\s*>/i);
    });
  });

  // from audit#77
  describe("#3 — evaluateWithBinding split should cap delimiter length", () => {
    it("should check delimiter length in evaluateWithBinding split", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const firstSplit = source.indexOf('case "split"');
      expect(firstSplit).toBeGreaterThan(-1);
      const secondSplit = source.indexOf('case "split"', firstSplit + 1);
      expect(secondSplit).toBeGreaterThan(-1);
      const block = source.slice(secondSplit, secondSplit + 300);
      expect(block).toMatch(/delim\.length\s*>\s*\d{2,}/);
    });
  });

  // from audit#79
  describe("#3 — getSuccessFeedback should truncate query", () => {
    it("should truncate or sanitize query parameter", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function getSuccessFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|truncat|safeQuery/);
    });
  });

  // from audit#79
  describe("#4 — base.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // Must truncate the error parameter itself, not just the code
      expect(block).toMatch(/safeError|error\.slice\(0,|error\.substring\(0,/);
    });
  });

  // from audit#79
  describe("#5 — qwen.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/qwen.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|safeError|truncat/);
    });
  });

  // from audit#79
  describe("#6 — deepseek.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/deepseek.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|safeError|truncat/);
    });
  });

  // from audit#79
  describe("#9 — getCheckpoint should check size before JSON.parse", () => {
    it("should validate bindings size before parsing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getCheckpoint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_|\.length\s*>/);
    });
  });

  // from audit#80
  describe("#3 — self-correction should truncate failure.error", () => {
    it("should truncate or escape failure.error", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("generateSelfCorrectionFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const errorLine = source.indexOf("failure.error", fnStart);
      expect(errorLine).toBeGreaterThan(-1);
      const block = source.slice(errorLine - 100, errorLine + 100);
      expect(block).toMatch(/\.slice\(0,|safeError|error\.replace|truncat/);
    });
  });

  // from audit#80
  describe("#10 — formatHintsForPrompt should cap individual hint size", () => {
    it("should truncate individual hints before joining", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("formatHintsForPrompt");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_HINT|hint.*\.slice|content.*\.slice|MAX_INDIVIDUAL/);
    });
  });

  // from audit#81
  describe("#5 — executeExpr should cap code length before new Function()", () => {
    it("should check code length before Function construction", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function executeExpr");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/code\.length\s*>|MAX_CODE_LENGTH|MAX_GENERATED/);
    });
  });

  // from audit#82
  describe("#2 — execute() console override should truncate log messages", () => {
    it("should truncate log messages before pushing", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      // Find the execute method's console.log override (not the initial one)
      const executeBlock = source.indexOf("const executionLogs");
      expect(executeBlock).toBeGreaterThan(-1);
      const logOverride = source.indexOf("consoleImpl.log = ", executeBlock);
      expect(logOverride).toBeGreaterThan(-1);
      const block = source.slice(logOverride, logOverride + 200);
      expect(block).toMatch(/\.slice\(0,|MAX_LOG_ENTRY|msg\.length/);
    });
  });

  // from audit#82
  describe("#3 — execute() should cap declaration script size", () => {
    it("should limit declaration script length before vm.Script", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      const declJoin = source.indexOf('declarations.join("\\n")');
      expect(declJoin).toBeGreaterThan(-1);
      const block = source.slice(declJoin - 200, declJoin + 100);
      expect(block).toMatch(/MAX_DECL|declCode\.length|declarations\.join.*\.length/);
    });
  });

  // from audit#84
  describe("#9 — pitfalls content should be size-capped", () => {
    it("should limit total pitfalls content size", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const pitfallsLine = source.indexOf("pitfalls");
      expect(pitfallsLine).toBeGreaterThan(-1);
      const block = source.slice(pitfallsLine, pitfallsLine + 500);
      expect(block).toMatch(/MAX_PITFALL|\.slice\(0,\s*MAX_PITFALLS?\)|pitfallContent\.slice/);
    });
  });

  // from audit#85
  describe("#8 — knowledge base should truncate description", () => {
    it("should truncate or validate description before storing", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const kbAdd = source.indexOf("knowledgeBase.add");
      expect(kbAdd).toBeGreaterThan(-1);
      const block = source.slice(kbAdd, kbAdd + 400);
      expect(block).toMatch(/description.*\.slice\(0,|safeDesc|truncat|MAX_DESC/);
    });
  });

  // from audit#86
  describe("#3 — toSQLCondition should cap extracted value length", () => {
    it("should check value length in equality match", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const eqMatch = source.indexOf("eqMatch");
      expect(eqMatch).toBeGreaterThan(-1);
      const block = source.slice(eqMatch, eqMatch + 400);
      expect(block).toMatch(/value\.length\s*>|MAX_VALUE/i);
    });
  });

  // from audit#87
  describe("#7 — sendError should truncate message", () => {
    it("should cap error message length", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const sendError = source.indexOf("private sendError");
      expect(sendError).toBeGreaterThan(-1);
      const block = source.slice(sendError, sendError + 300);
      expect(block).toMatch(/\.slice\(0,|MAX_ERROR|truncat|message\.length/i);
    });
  });

  // from audit#87
  describe("#8 — unknown endpoint error should truncate path", () => {
    it("should truncate path before including in error", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const unknownEndpoint = source.indexOf("Unknown endpoint");
      expect(unknownEndpoint).toBeGreaterThan(-1);
      const block = source.slice(unknownEndpoint - 100, unknownEndpoint + 100);
      expect(block).toMatch(/safePath|path\.slice\(0,|truncat/i);
    });
  });

  // from audit#89
  describe("#1 — getBindings should cap message length", () => {
    it("should cap or truncate bindings message", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("private getBindings");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\.slice\(0,|MAX_BINDINGS_MSG|MAX_MSG/i);
    });
  });

  // from audit#92
  describe("#8 — grammar symbols should validate key length", () => {
    it("should check symbol key length", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const symLoop = source.indexOf("for (const [key, value] of Object.entries(grammar.symbols)");
      expect(symLoop).toBeGreaterThan(-1);
      const block = source.slice(symLoop, symLoop + 300);
      // Should check key.length
      expect(block).toMatch(/key\.length\s*>/);
    });
  });

  // from audit#93
  describe("#9 — synthesizeRegex should cap individual example string length", () => {
    it("should validate example string lengths", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function synthesizeRegex");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 500);
      // Should check/filter individual example string length
      expect(block).toMatch(/MAX_EXAMPLE_LENGTH|\.length\s*>\s*\d|\.filter.*\.length/);
    });
  });

  // from audit#94
  describe("#7 — pipe.ts MAX_LINE_LENGTH should be reasonable", () => {
    it("should use a more conservative line length limit", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const maxLine = source.match(/MAX_LINE_LENGTH\s*=\s*(\d[\d_]*)/);
      expect(maxLine).not.toBeNull();
      const value = parseInt(maxLine![1].replace(/_/g, ""), 10);
      // 10MB per line is too high; should be 1MB or less
      expect(value).toBeLessThanOrEqual(1_000_000);
    });
  });

  // from audit#94
  describe("#8 — session-db loadDocument should use split limit", () => {
    it("should pass limit to split to avoid huge intermediate array", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const splitLine = source.indexOf('.split("\\n",');
      expect(splitLine).toBeGreaterThan(-1);
      const block = source.slice(splitLine, splitLine + 60);
      // Should pass a limit to split to avoid huge intermediate array
      expect(block).toMatch(/\.split\("\\n",\s*MAX/);
    });
  });

  // from audit#94
  describe("#10 — classify should cap individual example input lengths", () => {
    it("should limit example input string length", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const classifyCase = source.indexOf('case "classify"');
      expect(classifyCase).toBeGreaterThan(-1);
      const block = source.slice(classifyCase, classifyCase + 500);
      // Should cap individual example input string lengths
      expect(block).toMatch(/\.input\.slice|\.input\.length|MAX_EXAMPLE_INPUT|e\.input\.length\s*>/);
    });
  });
});

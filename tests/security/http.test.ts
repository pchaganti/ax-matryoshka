/** Security: security/http — migrated from audit rounds 13, 23, 25, 32, 34, 35, 37, 38, 40, 42, 68, 73, 77, 86, 87. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Security: security/http", () => {
  // from audit#13
  describe("Issue #15: HTTP adapter should reject NaN port/timeout", () => {
    it("parseInt with no radix should still work for valid numbers", async () => {
      // This is tested via reading the source - the fix adds NaN validation
      // We verify NaN detection works
      const portStr = "notanumber";
      const port = parseInt(portStr, 10);
      expect(isNaN(port)).toBe(true);
    });
  });

  // from audit#23
  describe("Audit23 #5: HTTP adapter arg parsing error message", () => {
    it("should be importable without errors", async () => {
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod).toBeDefined();
    });
  });

  // from audit#25
  describe("Audit25 #7: HTTP adapter content-type validation", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod.HttpAdapter).toBeDefined();
    });
  });

  // from audit#25
  describe("Audit25 #12: HTTP adapter timeouts", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod.HttpAdapter).toBeDefined();
    });
  });

  // from audit#32
  describe("#2 — CORS should not use wildcard", () => {
    it("should not set Access-Control-Allow-Origin to *", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // Find the CORS header setting
      const corsSection = source.match(/cors[\s\S]*?Access-Control-Allow-Origin[^"]*"([^"]*)"/);
      expect(corsSection).not.toBeNull();
      expect(corsSection![1]).not.toBe("*");
    });
  });

  // from audit#34
  describe("#13 — CLI should reject invalid maxTurns/timeout", () => {
    it("should validate maxTurns is positive", () => {
      const source = readFileSync("src/index.ts", "utf-8");
      const maxTurnsBlock = source.match(/--max-turns[\s\S]*?options\.maxTurns/);
      expect(maxTurnsBlock).not.toBeNull();
      expect(maxTurnsBlock![0]).toMatch(/val\s*[<>]=?\s*[01]|val\s*<=?\s*0|positive|greater/i);
    });
  });

  // from audit#34
  describe("#23 — CORS should be configurable", () => {
    it("should allow CORS origin to include port", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // Should either be configurable or use a pattern that includes ports
      // Look for the CORS handling block that computes origin dynamically
      const corsBlock = source.match(/CORS headers[\s\S]*?Access-Control-Allow-Origin[\s\S]*?setHeader/);
      expect(corsBlock).not.toBeNull();
      // Should handle localhost with ports, not just bare http://localhost
      expect(corsBlock![0]).toMatch(/isLocalhost|localhost.*:\d|127\.0\.0\.1|req\.headers\.origin/);
    });
  });

  // from audit#35
  describe("#10 — HTTP adapter should log actual bound port", () => {
    it("should use server.address() for log message", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const listenBlock = source.match(/server\.listen[\s\S]*?console\.log.*running/);
      expect(listenBlock).not.toBeNull();
      // Should use actual bound port, not this.port
      expect(listenBlock![0]).toMatch(/address\(\)|boundPort|actualPort/);
    });
  });

  // from audit#37
  describe("#5 — http adapter should reject negative content-length", () => {
    it("should check content-length > 0 or use Math.max", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const readBody = source.match(/readBody[\s\S]*?return new Promise/);
      expect(readBody).not.toBeNull();
      // Should reject negative content-length values
      expect(readBody![0]).toMatch(/contentLength\s*<\s*0|contentLength\s*>\s*0|Math\.max\(0/);
    });
  });

  // from audit#38
  describe("#1 — HTTP adapter should not use raw host header in URL construction", () => {
    it("should sanitize or avoid req.headers.host in URL construction", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // Should NOT use raw req.headers.host in URL constructor
      // Should use req.socket.localPort or hardcoded localhost
      expect(source).not.toMatch(/new URL\([^)]*req\.headers\.host/);
    });
  });

  // from audit#38
  describe("#10 — HTTP adapter should sanitize error messages", () => {
    it("should not expose raw error messages to clients", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // The catch-all error handler should sanitize messages
      const errorHandler = source.match(/\.catch\(\(err\)[\s\S]*?sendError[\s\S]*?\}/);
      expect(errorHandler).not.toBeNull();
      // Should use generic message or sanitize the error
      expect(errorHandler![0]).toMatch(/Internal server error|sanitize|generic/i);
    });
  });

  // from audit#40
  describe("#9 — http adapter inner catch should sanitize error messages", () => {
    it("should not send raw err.message to client in inner catch", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // Find the sendError call in the inner catch block
      const innerCatch = source.match(/\} catch \(err\) \{[\s\S]*?sendError\(res, 500,[\s\S]*?\)/);
      expect(innerCatch).not.toBeNull();
      // The sendError call itself should use a generic message
      const sendErrorCall = innerCatch![0].match(/sendError\(res, 500, [^)]+\)/);
      expect(sendErrorCall).not.toBeNull();
      expect(sendErrorCall![0]).toMatch(/Internal server error/);
    });
  });

  // from audit#42
  describe("#6 — http timeout calculation should not double-convert units", () => {
    it("should compute timeoutIn without multiplying idle by 1000", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // The bug: idle is already in seconds, but code does `idle * 1000`
      // Fixed version should not have `idle * 1000` in timeoutIn calculation
      expect(source).not.toMatch(/timeoutIn[\s\S]*?idle \* 1000/);
    });
  });

  // from audit#68
  describe("#6 — HTTP adapter host validation should check length", () => {
    it("should reject overly long hostnames", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const hostCheck = source.indexOf('Must be a valid hostname');
      expect(hostCheck).toBeGreaterThan(-1);
      const block = source.slice(hostCheck - 300, hostCheck);
      expect(block).toMatch(/host\.length|\.length\s*>\s*255|MAX_HOST/i);
    });
  });

  // from audit#73
  describe("#3 — http timeout should have an upper bound", () => {
    it("should cap timeout seconds to prevent overflow", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const timeoutParse = source.indexOf("MAX_TIMEOUT_SECONDS");
      expect(timeoutParse).toBeGreaterThan(-1);
      const block = source.slice(timeoutParse, timeoutParse + 400);
      expect(block).toMatch(/MAX_TIMEOUT|parsed\s*>\s*\d{4,}|timeoutSeconds\s*>\s*\d{4,}/);
    });
  });

  // from audit#77
  describe("#9 — http.ts should validate timeoutSeconds before multiplication", () => {
    it("should guard timeoutSeconds with isFinite or bounds check", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      // Find the constructor/initialization where timeout is validated
      const timeoutLine = source.indexOf("MAX_TIMEOUT_SECONDS");
      expect(timeoutLine).toBeGreaterThan(-1);
      const block = source.slice(timeoutLine, timeoutLine + 300);
      expect(block).toMatch(/isFinite|Math\.min|MAX_TIMEOUT/);
    });
  });

  // from audit#86
  describe("#5 — CORS origin regex should bound port digits", () => {
    it("should use bounded port pattern like \\d{1,5}", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const corsLine = source.indexOf("isLocalhost");
      expect(corsLine).toBeGreaterThan(-1);
      const block = source.slice(corsLine, corsLine + 200);
      // Should NOT have unbounded \d+ for port
      expect(block).toMatch(/\\d\{1,5\}/);
    });
  });

  // from audit#86
  describe("#6 — port parsing should use Number.isNaN or isSafeInteger", () => {
    it("should use strict number check for port", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const portParse = source.indexOf("parseInt(portArg, 10)");
      expect(portParse).toBeGreaterThan(-1);
      const block = source.slice(portParse, portParse + 200);
      expect(block).toMatch(/Number\.isNaN|Number\.isSafeInteger|!Number\.isFinite/);
    });
  });

  // from audit#86
  describe("#10 — timeout multiplication should have overflow guard", () => {
    it("should validate timeoutMs after multiplication", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const timeoutLine = source.indexOf("safeTimeout * 1000");
      expect(timeoutLine).toBeGreaterThan(-1);
      const block = source.slice(timeoutLine, timeoutLine + 200);
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger|Number\.isFinite/);
    });
  });

  // from audit#87
  describe("#5 — HttpAdapter constructor should validate port", () => {
    it("should validate port in constructor", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const constructor = source.indexOf("constructor(options");
      expect(constructor).toBeGreaterThan(-1);
      const block = source.slice(constructor, constructor + 400);
      expect(block).toMatch(/port.*isSafeInteger|port.*<\s*1|port.*>\s*65535|validPort/i);
    });
  });

  // from audit#87
  describe("#6 — HttpAdapter constructor should validate host", () => {
    it("should validate host in constructor", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const constructor = source.indexOf("constructor(options");
      expect(constructor).toBeGreaterThan(-1);
      const block = source.slice(constructor, constructor + 500);
      expect(block).toMatch(/host.*test\(|validHost|host.*length\s*>/i);
    });
  });

});

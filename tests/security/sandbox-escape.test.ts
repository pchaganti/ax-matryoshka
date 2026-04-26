/** Security: security/sandbox-escape — migrated from audit rounds 39, 41, 47, 51, 52, 57, 87. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Security: security/sandbox-escape", () => {
  // from audit#39
  describe("#1 — synthesis-integrator should block bracket-access constructor chains", () => {
    it("should block bracket property access patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const dangerousBlock = source.match(/dangerousPatterns\s*=\s*\[[\s\S]*?\]/);
      expect(dangerousBlock).not.toBeNull();
      // Should block bracket-access patterns like input['constructor']
      expect(dangerousBlock![0]).toMatch(/\[.*constructor|bracket|property.*access|\\\[/);
    });
  });

  // from audit#41
  describe("#1 — sandbox-tools should lock down constructor property", () => {
    it("should define constructor as undefined on sandboxGlobals", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
      // Should have Object.defineProperty lockdown for constructor
      expect(source).toMatch(/defineProperty\(globals,\s*['"]constructor['"]/);
    });
  });

  // from audit#47
  describe("#2 — predicate-compiler should block Object.getPrototypeOf", () => {
    it("should include getPrototypeOf in blocklist", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/getPrototypeOf/);
    });
  });

  // from audit#51
  describe("#9 — parser-registry moduleExport should guard prototype pollution", () => {
    it("should check moduleExport against dangerous names", () => {
      const source = readFileSync("src/treesitter/parser-registry.ts", "utf-8");
      const moduleExportBlock = source.match(/moduleExport[\s\S]*?grammarModule\[config\.moduleExport\]/);
      expect(moduleExportBlock).not.toBeNull();
      expect(moduleExportBlock![0]).toMatch(/__proto__|hasOwnProperty|DANGEROUS|prototype|Object\.prototype/);
    });
  });

  // from audit#52
  describe("#2 — parseConstraintObject should guard against prototype pollution", () => {
    it("should check key against dangerous names before bracket assignment", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const constraintBlock = source.match(/parseConstraintObject[\s\S]*?constraints\[key\]/);
      expect(constraintBlock).not.toBeNull();
      expect(constraintBlock![0]).toMatch(/__proto__|hasOwnProperty|DANGEROUS|prototype/);
    });
  });

  // from audit#57
  describe("#9 — lc-parser constraints should use null prototype", () => {
    it("should use Object.create(null) for constraints object", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const constraintBlock = source.match(/constraints[\s\S]*?DANGEROUS_KEYS/);
      expect(constraintBlock).not.toBeNull();
      expect(constraintBlock![0]).toMatch(/Object\.create\(null\)/);
    });
  });

  // from audit#87
  describe("#4 — dangerousPatterns should block .prototype", () => {
    it("should include prototype access pattern", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const patterns = source.indexOf("dangerousPatterns", source.indexOf("synthesizeViaRelational"));
      expect(patterns).toBeGreaterThan(-1);
      const block = source.slice(patterns, patterns + 600);
      expect(block).toMatch(/prototype/);
    });
  });

});

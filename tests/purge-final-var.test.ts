/**
 * Fingerprint test for the FINAL_VAR / memory-buffer legacy purge.
 *
 * Each assertion pins a fact about the purged state so that an accidental
 * revert (e.g. re-adding FinalVarMarker, re-introducing memory.push into a
 * prompt) flips a test red instead of silently drifting back in.
 *
 * These are deliberately grep-based over source files — the whole point is
 * to assert the *absence* of specific strings/files, which a structural
 * check can't do as directly.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = resolve(__dirname, "..", "src");

function read(relPath: string): string {
  return readFileSync(resolve(SRC, relPath), "utf-8");
}

describe("FINAL_VAR / memory-buffer legacy purge", () => {
  describe("orphaned dead-code files removed", () => {
    it("src/sandbox.ts should not exist (orphaned JS sandbox, only tests/sandbox.test.ts used it)", () => {
      expect(existsSync(resolve(SRC, "sandbox.ts"))).toBe(false);
    });

    it("src/session.ts should not exist (orphaned SessionManager, only tests/session.test.ts used it)", () => {
      expect(existsSync(resolve(SRC, "session.ts"))).toBe(false);
    });
  });

  describe("FinalVarMarker type removed", () => {
    it("adapters/types.ts should not declare or export FinalVarMarker", () => {
      expect(read("adapters/types.ts")).not.toMatch(/FinalVarMarker/);
    });

    it("adapters/index.ts should not re-export FinalVarMarker", () => {
      expect(read("adapters/index.ts")).not.toMatch(/FinalVarMarker/);
    });

    it.each([
      "rlm.ts",
      "adapters/base.ts",
      "adapters/nucleus.ts",
      "adapters/deepseek.ts",
      "adapters/qwen.ts",
      "adapters/qwen-synthesis.ts",
      "adapters/qwen-barliman.ts",
    ])("%s should not import FinalVarMarker", (file) => {
      expect(read(file)).not.toMatch(/FinalVarMarker/);
    });
  });

  describe("FINAL_VAR parsing and prompt hints removed", () => {
    it.each([
      "adapters/base.ts",
      "adapters/nucleus.ts",
      "adapters/deepseek.ts",
      "adapters/qwen.ts",
      "adapters/qwen-synthesis.ts",
      "adapters/qwen-barliman.ts",
      "rlm.ts",
    ])("%s should not contain FINAL_VAR", (file) => {
      expect(read(file)).not.toMatch(/FINAL_VAR/);
    });

    it.each([
      "adapters/base.ts",
      "adapters/deepseek.ts",
      "rlm.ts",
    ])("%s should not contain memory.push prompt example", (file) => {
      expect(read(file)).not.toMatch(/memory\.push/);
    });
  });

  describe("SandboxWithSynthesis.getMemory proxy removed", () => {
    it("synthesis/sandbox-tools.ts should not declare getMemory on the interface or bind it", () => {
      expect(read("synthesis/sandbox-tools.ts")).not.toMatch(/getMemory/);
    });

    it("rlm.ts should not call sandbox.getMemory() (no memory dump in error messages)", () => {
      expect(read("rlm.ts")).not.toMatch(/getMemory\s*\(/);
    });

    it("fsm/rlm-states.ts should not call ctx.sandbox.getMemory() (all FinalVar branches gone)", () => {
      expect(read("fsm/rlm-states.ts")).not.toMatch(/getMemory/);
    });
  });
});

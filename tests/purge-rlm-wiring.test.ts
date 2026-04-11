/**
 * Fingerprint test for the dead RLM-wiring purge.
 *
 * chiasmus_graph analysis showed that `turnTimeoutMs`, `maxSubCalls`, and
 * the entire `SandboxWithSynthesis` instance that runRLM creates are dead
 * in the RLM loop: the sandbox is created, stored on the FSM context, and
 * disposed — never executed. The timeout/subCall limits feed only into
 * that sandbox, so they have no user-visible effect from the RLM surface.
 *
 * This file pins the purged state so an accidental revival flips red.
 * Note that `createSandboxWithSynthesis` *itself* stays — it still has
 * direct-use tests in tests/synthesis/** and tests/e2e-synthesis.test.ts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = resolve(__dirname, "..", "src");

function read(relPath: string): string {
  return readFileSync(resolve(SRC, relPath), "utf-8");
}

describe("Dead RLM-wiring purge", () => {
  describe("turnTimeoutMs / maxSubCalls options removed from public RLM surface", () => {
    it("rlm.ts should not declare turnTimeoutMs in RLMOptions", () => {
      expect(read("rlm.ts")).not.toMatch(/turnTimeoutMs/);
    });

    it("rlm.ts should not declare maxSubCalls in RLMOptions", () => {
      expect(read("rlm.ts")).not.toMatch(/maxSubCalls/);
    });

    it("mcp-server.ts should not forward timeoutMs as turnTimeoutMs", () => {
      expect(read("mcp-server.ts")).not.toMatch(/turnTimeoutMs/);
    });

    it("index.ts should not map --timeout to turnTimeoutMs", () => {
      expect(read("index.ts")).not.toMatch(/turnTimeoutMs/);
    });
  });

  describe("SandboxWithSynthesis is unused inside the RLM loop", () => {
    it("rlm.ts should not import SandboxWithSynthesis or createSandboxWithSynthesis", () => {
      expect(read("rlm.ts")).not.toMatch(/SandboxWithSynthesis|createSandboxWithSynthesis/);
    });

    it("rlm.ts should not import SynthesisCoordinator (only fed the dead sandbox)", () => {
      expect(read("rlm.ts")).not.toMatch(/SynthesisCoordinator/);
    });

    it("rlm.ts should not call sandbox.dispose() (no sandbox to dispose)", () => {
      expect(read("rlm.ts")).not.toMatch(/sandbox\.dispose/);
    });

    it("fsm/rlm-states.ts RLMContext should not carry a sandbox field", () => {
      // Both the type declaration and the createInitialContext assignment should be gone.
      expect(read("fsm/rlm-states.ts")).not.toMatch(/sandbox:\s*SandboxWithSynthesis/);
      expect(read("fsm/rlm-states.ts")).not.toMatch(/sandbox:\s*opts\.sandbox/);
    });

    it("fsm/rlm-states.ts should not import SandboxWithSynthesis", () => {
      expect(read("fsm/rlm-states.ts")).not.toMatch(/SandboxWithSynthesis/);
    });
  });
});

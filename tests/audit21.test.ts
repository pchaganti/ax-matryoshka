/**
 * Audit #21 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: jsonToSexp backslash escaping ===
describe("Audit21 #1: nucleus jsonToSexp backslash escaping", () => {
  it("should escape backslashes in grep pattern", async () => {
    const { createNucleusAdapter } = await import("../src/adapters/nucleus.js");
    const adapter = createNucleusAdapter();
    // Model outputs inline JSON with a backslash in the pattern
    // The JSON string "C:\\Users" means the actual pattern is C:\Users
    const response = `{"action": "grep", "pattern": "C:\\\\Users"}`;
    const result = adapter.extractCode(response);
    // The S-expression should properly escape the backslash
    // Expected: (grep "C:\\Users") with the backslash escaped
    expect(result).not.toBeNull();
    if (result) {
      // The embedded string should have the backslash escaped
      expect(result).toContain("\\\\");
    }
  });

  it("should escape backslashes in filter pattern", async () => {
    const { createNucleusAdapter } = await import("../src/adapters/nucleus.js");
    const adapter = createNucleusAdapter();
    const response = `{"action": "filter", "pattern": "path\\\\file"}`;
    const result = adapter.extractCode(response);
    expect(result).not.toBeNull();
    if (result) {
      expect(result).toContain("\\\\");
    }
  });
});

// === Issue #2: testProgram returns true for empty examples ===
describe("Audit21 #2: testProgram empty examples guard", () => {
  it("should return false for empty examples array", async () => {
    const { testProgram } = await import(
      "../src/synthesis/relational/interpreter.js"
    );
    const expr: any = { tag: "input" };
    const result = testProgram(expr, []);
    expect(result).toBe(false);
  });
});

// === Issue #4: getHandleDataSlice negative limit ===
describe("Audit21 #4: getHandleDataSlice negative limit", () => {
  it("should clamp negative limit to 0", async () => {
    const { SessionDB } = await import("../src/persistence/session-db.js");
    const db = new SessionDB();
    // Store some handle data via createHandle
    const handle = db.createHandle([1, 2, 3, 4, 5]);
    // Negative limit should return empty array, not all rows
    const result = db.getHandleDataSlice(handle, -1);
    expect(result.length).toBe(0);
    db.close();
  });
});

// === Issue #5: verifier property check uses `in` operator ===
describe("Audit21 #5: verifier hasOwnProperty check", () => {
  it("should not match prototype properties as present", async () => {
    const { verifyResult } = await import("../src/constraints/verifier.js");
    // Object.create(null) has no prototype, but a normal {} has toString, constructor, etc.
    const value = { name: "test" };
    const constraints: any = {
      output: {
        type: "object",
        required: ["toString"], // toString exists on prototype, not own property
      },
    };
    const result = verifyResult(value, constraints);
    // Should report missing because toString is not an own property
    expect(result.valid).toBe(false);
  });

  it("should succeed when required property is an own property", async () => {
    const { verifyResult } = await import("../src/constraints/verifier.js");
    const value = { name: "test" };
    const constraints: any = {
      output: {
        type: "object",
        required: ["name"],
      },
    };
    const result = verifyResult(value, constraints);
    expect(result.valid).toBe(true);
  });
});

// === Issue #6: nucleus group index negative validation ===
describe("Audit21 #6: nucleus group index validation", () => {
  it("should clamp negative group index to 0", async () => {
    const { createNucleusAdapter } = await import("../src/adapters/nucleus.js");
    const adapter = createNucleusAdapter();
    const response = `{"action": "map", "pattern": "\\\\d+", "group": -5}`;
    const result = adapter.extractCode(response);
    if (result) {
      // Should not contain negative group index
      expect(result).not.toMatch(/-\d+\)/);
      expect(result).toContain(" 0)");
    }
  });
});

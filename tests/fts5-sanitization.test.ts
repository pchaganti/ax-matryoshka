/**
 * Tests for FTS5 query sanitization.
 *
 * Validates that the search() method properly sanitizes user input
 * to prevent FTS5 query injection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionDB } from "../src/persistence/session-db.js";

describe("FTS5 query sanitization", () => {
  let db: SessionDB;

  const testDoc = `Line one with ERROR data
Line two with INFO data
Line three with ERROR and WARNING
Line four is clean`;

  beforeEach(() => {
    db = new SessionDB();
    db.loadDocument(testDoc);
  });

  afterEach(() => {
    db.close();
  });

  it("should handle normal search terms", () => {
    const results = db.search("ERROR");
    expect(results.length).toBe(2);
  });

  it("should strip FTS5 operators without crashing", () => {
    // These should not throw or cause SQL errors
    expect(() => db.search('ERROR AND NOT "INFO"')).not.toThrow();
    expect(() => db.search("ERROR OR WARNING")).not.toThrow();
    expect(() => db.search("term NEAR/3 other")).not.toThrow();
  });

  it("should strip special characters", () => {
    // All of these should be safely handled
    expect(() => db.search("test*")).not.toThrow();
    expect(() => db.search("test+")).not.toThrow();
    expect(() => db.search("test^")).not.toThrow();
    expect(() => db.search("col:term")).not.toThrow();
    expect(() => db.search("{term}")).not.toThrow();
    expect(() => db.search("[term]")).not.toThrow();
    expect(() => db.search("test~")).not.toThrow();
    expect(() => db.search('"quoted"')).not.toThrow();
    expect(() => db.search("'quoted'")).not.toThrow();
    expect(() => db.search("(grouped)")).not.toThrow();
    expect(() => db.search("a-b")).not.toThrow();
    expect(() => db.search("a|b")).not.toThrow();
    expect(() => db.search("@column")).not.toThrow();
  });

  it("should return empty for entirely special characters", () => {
    const results = db.search("***");
    expect(results).toHaveLength(0);
  });

  it("should still find results after stripping specials", () => {
    // "ERROR*" -> "ERROR " -> matches lines with ERROR
    const results = db.search("ERROR*");
    expect(results.length).toBeGreaterThan(0);
  });
});

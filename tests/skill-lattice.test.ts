/**
 * Tests for Lattice SKILL.md
 *
 * Validates that the skill file contains all required sections
 * for AI agents to learn the Lattice MCP workflow.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SKILL_PATH = path.resolve(__dirname, "../skills/lattice/SKILL.md");

describe("Lattice SKILL.md", () => {
  it("should exist at skills/lattice/SKILL.md", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  describe("frontmatter", () => {
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(SKILL_PATH, "utf-8");
    });

    it("should have valid YAML frontmatter with name and description", () => {
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/name:\s*lattice/);
      expect(content).toMatch(/description:\s*.+/);
    });
  });

  describe("required sections", () => {
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(SKILL_PATH, "utf-8");
    });

    it("should document when to use Lattice vs direct Read", () => {
      expect(content).toMatch(/when to use/i);
      expect(content).toMatch(/>?\s*500\s*lines|large file/i);
    });

    it("should document the core workflow: load -> query -> expand -> close", () => {
      expect(content).toMatch(/lattice_load/);
      expect(content).toMatch(/lattice_query/);
      expect(content).toMatch(/lattice_expand/);
      expect(content).toMatch(/lattice_close/);
    });

    it("should include Nucleus command examples", () => {
      expect(content).toMatch(/\(grep\s/);
      expect(content).toMatch(/\(filter\s/);
      expect(content).toMatch(/\(count\s/);
      expect(content).toMatch(/\(map\s/);
    });

    it("should explain handle stubs and RESULTS variable", () => {
      expect(content).toMatch(/\$res\d/);
      expect(content).toMatch(/RESULTS/);
      expect(content).toMatch(/handle|stub/i);
    });

    it("should include a complete workflow example", () => {
      // Should have a step-by-step numbered workflow
      expect(content).toMatch(/1\.\s/);
      expect(content).toMatch(/2\.\s/);
      expect(content).toMatch(/3\.\s/);
    });

    it("should document symbol operations for code files", () => {
      expect(content).toMatch(/list_symbols/);
      expect(content).toMatch(/get_symbol_body/);
    });

    it("should include call-efficiency guidance", () => {
      // Should guide agents to chain operations rather than making many calls
      expect(content).toMatch(/chain|combine|single query/i);
    });

    it("should mention token savings", () => {
      expect(content).toMatch(/token/i);
      expect(content).toMatch(/97%|savings/i);
    });
  });
});

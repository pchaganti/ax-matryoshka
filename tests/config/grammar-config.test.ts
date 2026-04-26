import { describe, it, expect, beforeEach } from "vitest";
import { EXAMPLE_CONFIG } from "../../src/config/grammar-config.js";
import {
  getAllLanguageConfigs,
  getLanguageForExtension,
  isExtensionSupported,
  clearLanguageCache,
} from "../../src/treesitter/language-map.js";
import { BUILTIN_GRAMMARS } from "../../src/treesitter/builtin-grammars.js";
import { readFileSync } from "fs";

describe("Grammar Configuration", () => {
  describe("Built-in Grammars", () => {
    it("should have TypeScript, JavaScript, Python, Go as built-in", () => {
      expect(BUILTIN_GRAMMARS.typescript).toBeDefined();
      expect(BUILTIN_GRAMMARS.javascript).toBeDefined();
      expect(BUILTIN_GRAMMARS.python).toBeDefined();
      expect(BUILTIN_GRAMMARS.go).toBeDefined();
    });

    it("should have SQL, HTML, CSS, JSON, YAML as built-in", () => {
      expect(BUILTIN_GRAMMARS.sql).toBeDefined();
      expect(BUILTIN_GRAMMARS.html).toBeDefined();
      expect(BUILTIN_GRAMMARS.css).toBeDefined();
      expect(BUILTIN_GRAMMARS.json).toBeDefined();
      expect(BUILTIN_GRAMMARS.yaml).toBeDefined();
    });

    it("should have Rust, C, C++, Java as built-in configs", () => {
      expect(BUILTIN_GRAMMARS.rust).toBeDefined();
      expect(BUILTIN_GRAMMARS.c).toBeDefined();
      expect(BUILTIN_GRAMMARS.cpp).toBeDefined();
      expect(BUILTIN_GRAMMARS.java).toBeDefined();
    });

    it("should include correct extensions for each language", () => {
      expect(BUILTIN_GRAMMARS.typescript.extensions).toContain(".ts");
      expect(BUILTIN_GRAMMARS.typescript.extensions).toContain(".tsx");
      expect(BUILTIN_GRAMMARS.python.extensions).toContain(".py");
      expect(BUILTIN_GRAMMARS.rust.extensions).toContain(".rs");
      expect(BUILTIN_GRAMMARS.html.extensions).toContain(".html");
    });

    it("should include symbol mappings for each language", () => {
      expect(BUILTIN_GRAMMARS.typescript.symbols.function_declaration).toBe("function");
      expect(BUILTIN_GRAMMARS.python.symbols.class_definition).toBe("class");
      expect(BUILTIN_GRAMMARS.rust.symbols.function_item).toBe("function");
    });

    it("should include package names for each language", () => {
      expect(BUILTIN_GRAMMARS.typescript.package).toBe("tree-sitter-typescript");
      expect(BUILTIN_GRAMMARS.python.package).toBe("tree-sitter-python");
      expect(BUILTIN_GRAMMARS.rust.package).toBe("tree-sitter-rust");
    });
  });

  describe("Language Map Integration", () => {
    beforeEach(() => {
      clearLanguageCache();
    });

    it("should return all language configs", () => {
      const configs = getAllLanguageConfigs();
      expect(Object.keys(configs).length).toBeGreaterThan(15);
      expect(configs.typescript).toBeDefined();
      expect(configs.rust).toBeDefined();
    });

    it("should map extensions to languages", () => {
      expect(getLanguageForExtension(".ts")).toBe("typescript");
      expect(getLanguageForExtension(".rs")).toBe("rust");
      expect(getLanguageForExtension(".html")).toBe("html");
      expect(getLanguageForExtension(".json")).toBe("json");
    });

    it("should check extension support", () => {
      expect(isExtensionSupported(".ts")).toBe(true);
      expect(isExtensionSupported(".rs")).toBe(true);
      expect(isExtensionSupported(".html")).toBe(true);
      expect(isExtensionSupported(".xyz")).toBe(false);
    });
  });

  describe("Example Config", () => {
    it("should have valid structure", () => {
      expect(EXAMPLE_CONFIG).toBeDefined();
      expect(EXAMPLE_CONFIG.grammars).toBeDefined();
      expect(EXAMPLE_CONFIG.grammars!.rust).toBeDefined();
    });

    it("should have valid Rust config", () => {
      const rust = EXAMPLE_CONFIG.grammars!.rust;
      expect(rust.package).toBe("tree-sitter-rust");
      expect(rust.extensions).toContain(".rs");
      expect(rust.symbols.function_item).toBe("function");
    });
  });
});

describe("New Language Support", () => {
  it("should support HTML parsing with installed package", async () => {
    const { ParserRegistry } = await import("../../src/treesitter/parser-registry.js");
    const registry = new ParserRegistry();
    await registry.init();

    const htmlCode = `<!DOCTYPE html>
<html>
  <head><title>Test</title></head>
  <body><h1>Hello</h1></body>
</html>`;

    const tree = await registry.parseDocument(htmlCode, ".html");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("document");

    registry.dispose();
  });

  it("should support JSON parsing with installed package", async () => {
    const { ParserRegistry } = await import("../../src/treesitter/parser-registry.js");
    const registry = new ParserRegistry();
    await registry.init();

    const jsonCode = `{
  "name": "test",
  "version": "1.0.0"
}`;

    const tree = await registry.parseDocument(jsonCode, ".json");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("document");

    registry.dispose();
  });

  it("should support CSS parsing with installed package", async () => {
    const { ParserRegistry } = await import("../../src/treesitter/parser-registry.js");
    const registry = new ParserRegistry();
    await registry.init();

    const cssCode = `
.container {
  display: flex;
  padding: 10px;
}

#header {
  background: blue;
}`;

    const tree = await registry.parseDocument(cssCode, ".css");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("stylesheet");

    registry.dispose();
  });

  // YAML parsing test removed: tree-sitter-yaml (currently npm v0.5.0) is
  // not installed and its native-binding format is incompatible with the
  // other tree-sitter grammars this project uses. YAML support is not on
  // the roadmap. A future PR adding the dependency can add a fresh test.
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit59.test.ts #2 — addCustomGrammar should block dangerous language names
  describe("#2 — addCustomGrammar should block dangerous language names", () => {
      it("should reject __proto__/constructor/prototype as language", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/__proto__|DANGEROUS|prototype/);
      });
    });

  // from tests/audit60.test.ts #9 — getAllLanguageConfigs should validate custom grammar keys
  describe("#9 — getAllLanguageConfigs should validate custom grammar keys", () => {
      it("should reject dangerous keys from custom grammars", () => {
        const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
        const mergeBlock = source.match(/custom.*=.*readCustomGrammars[\s\S]*?configs\[lang\]/);
        expect(mergeBlock).not.toBeNull();
        expect(mergeBlock![0]).toMatch(/__proto__|DANGEROUS|prototype/);
      });
    });

  // from tests/audit61.test.ts #4 — addCustomGrammar should validate extensions array
  describe("#4 — addCustomGrammar should validate extensions array", () => {
      it("should check extensions array bounds and format", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 600);
        expect(block).toMatch(/extensions\.length|MAX_EXT|Array\.isArray.*extensions/i);
      });
    });

  // from tests/audit62.test.ts #6 — addCustomGrammar should validate package field
  describe("#6 — addCustomGrammar should validate package field", () => {
      it("should check package name format", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 800);
        expect(block).toMatch(/grammar\.package|package.*length|package.*test/i);
      });
    });

  // from tests/audit62.test.ts #7 — addCustomGrammar should validate symbols object
  describe("#7 — addCustomGrammar should validate symbols object", () => {
      it("should check symbols object size", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 1800);
        expect(block).toMatch(/symbols.*keys|Object\.keys.*symbols|MAX_SYMBOLS/i);
      });
    });

  // from tests/audit65.test.ts #1 — getLanguageConfig should reject dangerous keys
  describe("#1 — getLanguageConfig should reject dangerous keys", () => {
      it("should guard against __proto__ and similar keys", () => {
        const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
        const fnStart = source.indexOf("function getLanguageConfig(");
        if (fnStart === -1) {
          const altStart = source.indexOf("export function getLanguageConfig(");
          expect(altStart).toBeGreaterThan(-1);
          const block = source.slice(altStart, altStart + 400);
          expect(block).toMatch(/DANGEROUS|__proto__|hasOwnProperty|Object\.hasOwn/i);
        } else {
          const block = source.slice(fnStart, fnStart + 400);
          expect(block).toMatch(/DANGEROUS|__proto__|hasOwnProperty|Object\.hasOwn/i);
        }
      });
    });

  // from tests/audit65.test.ts #8 — grammar-config symbols should reject arrays
  describe("#8 — grammar-config symbols should reject arrays", () => {
      it("should exclude Array.isArray from symbols check", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const symbolsCheck = source.indexOf("grammar.symbols && typeof grammar.symbols");
        expect(symbolsCheck).toBeGreaterThan(-1);
        const block = source.slice(symbolsCheck, symbolsCheck + 200);
        expect(block).toMatch(/Array\.isArray/);
      });
    });

  // from tests/audit65.test.ts #10 — buildExtensionMap should validate ext is string
  describe("#10 — buildExtensionMap should validate ext is string", () => {
      it("should check typeof ext before toLowerCase", () => {
        const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
        const fnStart = source.indexOf("function buildExtensionMap(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/typeof ext\s*===?\s*"string"|typeof ext\s*!==?\s*"string"/);
      });
    });

  // from tests/audit66.test.ts #6 — addCustomGrammar should validate moduleExport
  describe("#6 — addCustomGrammar should validate moduleExport", () => {
      it("should check moduleExport for dangerous names", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 1500);
        expect(block).toMatch(/moduleExport.*DANGEROUS|DANGEROUS.*moduleExport|moduleExport.*typeof/i);
      });
    });

  // from tests/audit66.test.ts #7 — addCustomGrammar should validate symbol kind values
  describe("#7 — addCustomGrammar should validate symbol kind values", () => {
      it("should check symbol values against valid kinds", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 1500);
        expect(block).toMatch(/VALID_KINDS|VALID_SYMBOL|validKind/i);
      });
    });

  // from tests/audit66.test.ts #10 — getAllLanguageConfigs DANGEROUS_KEYS should include toString/valueOf
  describe("#10 — getAllLanguageConfigs DANGEROUS_KEYS should include toString/valueOf", () => {
      it("should block hasOwnProperty/toString/valueOf in language keys", () => {
        const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
        const keysStart = source.indexOf("DANGEROUS_LANG_KEYS");
        expect(keysStart).toBeGreaterThan(-1);
        const block = source.slice(keysStart, keysStart + 400);
        expect(block).toMatch(/hasOwnProperty|toString|valueOf/);
      });
    });

  // from tests/audit68.test.ts #8 — getAllLanguageConfigs should protect builtin loop too
  describe("#8 — getAllLanguageConfigs should protect builtin loop too", () => {
      it("should check DANGEROUS_KEYS for builtin grammars", () => {
        const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
        const builtinLoop = source.indexOf("for (const [lang, builtin]");
        expect(builtinLoop).toBeGreaterThan(-1);
        // The DANGEROUS_KEYS check should be inside the builtin loop body, not just in the custom loop
        const builtinBody = source.slice(builtinLoop, builtinLoop + 120);
        expect(builtinBody).toMatch(/DANGEROUS.*\.has\(lang\)|__proto__|skip.*dangerous/i);
      });
    });

  // from tests/audit73.test.ts #7 — grammar-config DANGEROUS_LANG_NAMES should include all dangerous keys
  describe("#7 — grammar-config DANGEROUS_LANG_NAMES should include all dangerous keys", () => {
      it("should include hasOwnProperty and toString", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const dangerousSet = source.indexOf("DANGEROUS_LANG_NAMES");
        expect(dangerousSet).toBeGreaterThan(-1);
        const block = source.slice(dangerousSet, dangerousSet + 500);
        expect(block).toMatch(/hasOwnProperty/);
        expect(block).toMatch(/toString/);
      });
    });

  // from tests/audit88.test.ts #7 — addCustomGrammar should reject .. in package name
  describe("#7 — addCustomGrammar should reject .. in package name", () => {
      it("should block path traversal in package name", () => {
        const source = readFileSync("src/config/grammar-config.ts", "utf-8");
        const fnStart = source.indexOf("function addCustomGrammar");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 1000);
        expect(block).toMatch(/\.\."|includes\("\.\."\)|\.\.\/|path.*traversal/i);
      });
    });

});

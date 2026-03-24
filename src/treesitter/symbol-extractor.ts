/**
 * SymbolExtractor - Extracts symbols from source code using Tree-sitter
 *
 * Walks the syntax tree and identifies functions, classes, methods,
 * interfaces, types, and other symbol definitions.
 * Supports both built-in and custom language configurations.
 */

import { ParserRegistry } from "./parser-registry.js";
import type { Symbol, SymbolKind, SupportedLanguage } from "./types.js";
import { getSymbolMappings } from "./language-map.js";

const MAX_CHILDREN = 10_000;

/**
 * Name field mappings for different node types
 */
const NAME_FIELDS: Record<string, string[]> = {
  // Functions
  function_declaration: ["name"],
  function_definition: ["name"],
  function_item: ["name"],
  method_definition: ["name"],
  method_declaration: ["name"],
  // Classes/types
  class_declaration: ["name"],
  class_definition: ["name"],
  class_specifier: ["name"],
  interface_declaration: ["name"],
  type_alias_declaration: ["name"],
  type_spec: ["name"],
  type_definition: ["name"],
  type_item: ["name"],
  struct_item: ["name"],
  struct_specifier: ["name"],
  enum_declaration: ["name"],
  enum_item: ["name"],
  enum_specifier: ["name"],
  trait_item: ["name"],
  impl_item: ["name", "trait", "type"],
  // Variables
  variable_declarator: ["name"],
  const_item: ["name"],
  static_item: ["name"],
  // Properties
  public_field_definition: ["name"],
  field_definition: ["name"],
  property_declaration: ["name"],
  // Modules
  mod_item: ["name"],
  namespace_definition: ["name"],
  module: ["name"],
  // SQL
  create_table_statement: ["name", "table_name"],
  create_function_statement: ["name", "function_name"],
  // Generic fallback
  pair: ["key"],
  block_mapping_pair: ["key"],
};

/**
 * Node types that are containers (can have child symbols)
 */
const CONTAINER_TYPES = new Set([
  "class_declaration",
  "class_definition",
  "class_specifier",
  "interface_declaration",
  "type_spec",
  "impl_item",
  "trait_item",
  "struct_item",
  "module",
  "mod_item",
  "namespace_definition",
]);

const ELIXIR_FUNCTION_MACROS = new Set(["def", "defp", "defmacro", "defmacrop"]);
const SIGNATURE_FUNCTION_TYPES = [
  "function_declaration",
  "method_definition",
  "function_definition",
  "method_declaration",
  "function_item",
];
const MAX_SIGNATURE_TEXT_LENGTH = 50_000;

/**
 * SymbolExtractor extracts symbols from source code
 */
export class SymbolExtractor {
  private registry: ParserRegistry;
  private symbolIdCounter: number = 0;

  constructor(registry: ParserRegistry) {
    this.registry = registry;
  }

  /**
   * Extract all symbols from source code
   */
  async extractSymbols(content: string, ext: string): Promise<Symbol[]> {
    const result = await this.registry.parseWithLanguage(content, ext);
    if (!result) {
      throw new Error(`Unsupported extension: ${ext}`);
    }

    const { tree, language } = result;
    const symbols: Symbol[] = [];
    this.symbolIdCounter = 0;

    // Get symbol mappings for this language
    const symbolMappings = getSymbolMappings(language);
    if (!symbolMappings) {
      // No symbol mappings - free native memory and return empty
      tree.delete?.();
      return [];
    }

    // Walk the tree and extract symbols
    try {
      this.walkTree(tree.rootNode, language, symbolMappings, symbols, null);
    } finally {
      tree.delete?.();
    }

    return symbols;
  }

  /**
   * Recursively walk the syntax tree and extract symbols
   */
  private static readonly MAX_TREE_DEPTH = 200;
  private static readonly MAX_SYMBOLS_COUNT = 100_000;

  private walkTree(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    language: SupportedLanguage,
    symbolMappings: Record<string, SymbolKind>,
    symbols: Symbol[],
    parentId: number | null,
    depth: number = 0
  ): void {
    if (depth > SymbolExtractor.MAX_TREE_DEPTH) return;
    if (symbols.length >= SymbolExtractor.MAX_SYMBOLS_COUNT) return;
    let currentParentId = parentId;

    // Special case: Python - handle classes and methods correctly
    if (language === "python") {
      if (node.type === "class_definition") {
        const symbol = this.extractSymbolFromNode(node, "class", parentId, language);
        if (symbol) {
          symbols.push(symbol);
          currentParentId = symbol.id!;
        }
      } else if (node.type === "function_definition") {
        const pythonKind: SymbolKind = parentId !== null ? "method" : "function";
        const symbol = this.extractSymbolFromNode(node, pythonKind, parentId, language);
        if (symbol) {
          symbols.push(symbol);
        }
      }
    } else if (language === "go" && node.type === "type_declaration") {
      // Go: type_declaration contains type_spec
      const symbol = this.extractGoTypeDeclaration(node, parentId);
      if (symbol) {
        symbols.push(symbol);
      }
    } else if (language === "markdown" && (node.type === "atx_heading" || node.type === "setext_heading")) {
      const symbol = this.extractMarkdownHeading(node, parentId);
      if (symbol) {
        symbols.push(symbol);
      }
    } else if (language === "elixir" && node.type === "call") {
      const elixirSymbol = this.extractElixirCallSymbol(node, parentId);
      if (elixirSymbol) {
        symbols.push(elixirSymbol.symbol);
        if (elixirSymbol.isContainer) {
          currentParentId = elixirSymbol.symbol.id!;
        }
      }
    } else {
      // Check if this node is a symbol definition using the mappings
      const kind = symbolMappings[node.type];
      if (kind) {
        const symbol = this.extractSymbolFromNode(node, kind, parentId, language);
        if (symbol) {
          symbols.push(symbol);
          // If this is a container, use its ID for children
          if (CONTAINER_TYPES.has(node.type)) {
            currentParentId = symbol.id!;
          }
        }
      }
    }

    // Recurse into children (limit horizontal breadth to prevent DoS from pathologically wide trees)
    const childLimit = Math.min(node.childCount, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = node.child(i);
      if (child) {
        this.walkTree(child, language, symbolMappings, symbols, currentParentId, depth + 1);
      }
    }
  }

  /**
   * Extract a symbol from a node
   */
  private extractSymbolFromNode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    kind: SymbolKind,
    parentId: number | null,
    language: SupportedLanguage
  ): Symbol | null {
    const name = this.getNodeName(node);
    if (!name) return null;

    // buildSymbol clamps line bounds so endLine is never below startLine.
    return this.buildSymbol(name, node, kind, parentId, language);
  }

  private buildSymbol(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    kind: SymbolKind,
    parentId: number | null,
    language: SupportedLanguage
  ): Symbol | null {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) return null;

    if (this.symbolIdCounter >= Number.MAX_SAFE_INTEGER - 1) return null;
    this.symbolIdCounter++;

    const startRow = node.startPosition?.row;
    const endRow = node.endPosition?.row;
    const startColumn = node.startPosition?.column;
    const endColumn = node.endPosition?.column;

    const startLine = typeof startRow === "number" && Number.isFinite(startRow) ? Math.max(1, startRow + 1) : 1;
    let endLine = typeof endRow === "number" && Number.isFinite(endRow) ? Math.max(1, endRow + 1) : 1;
    if (endLine < startLine) endLine = startLine;

    return {
      id: this.symbolIdCounter,
      name: normalizedName,
      kind,
      startLine,
      endLine,
      startCol: typeof startColumn === "number" && Number.isFinite(startColumn) ? Math.max(0, startColumn) : 0,
      endCol: typeof endColumn === "number" && Number.isFinite(endColumn) ? Math.max(0, endColumn) : 0,
      signature: this.getSignature(node, language),
      parentSymbolId: parentId,
    };
  }

  private extractElixirCallSymbol(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    parentId: number | null
  ): { symbol: Symbol; isContainer: boolean } | null {
    const macroName = this.getElixirCallTargetName(node);
    if (!macroName) return null;

    if (ELIXIR_FUNCTION_MACROS.has(macroName)) {
      const name = this.getElixirDefinitionName(node);
      const symbol = name ? this.buildSymbol(name, node, "function", parentId, "elixir") : null;
      return symbol ? { symbol, isContainer: false } : null;
    }

    if (macroName === "defmodule") {
      const name = this.getElixirFirstAliasArgument(node);
      const symbol = name ? this.buildSymbol(name, node, "module", parentId, "elixir") : null;
      return symbol ? { symbol, isContainer: true } : null;
    }

    if (macroName === "defprotocol") {
      const name = this.getElixirFirstAliasArgument(node);
      const symbol = name ? this.buildSymbol(name, node, "interface", parentId, "elixir") : null;
      return symbol ? { symbol, isContainer: true } : null;
    }

    if (macroName === "defimpl") {
      const name = this.getElixirImplementationName(node);
      const symbol = name ? this.buildSymbol(name, node, "module", parentId, "elixir") : null;
      return symbol ? { symbol, isContainer: true } : null;
    }

    return null;
  }

  /**
   * Extract a Go type_declaration (contains type_spec with struct_type, etc.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractGoTypeDeclaration(node: any, parentId: number | null): Symbol | null {
    // Find the type_spec child
    let typeSpec = null;
    const childLimit = Math.min(node.childCount, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = node.child(i);
      if (child && child.type === "type_spec") {
        typeSpec = child;
        break;
      }
    }

    if (!typeSpec) return null;

    // Get name from type_spec
    const name = this.getNodeName(typeSpec);
    if (!name) return null;

    // Check if it's a struct or interface
    let kind: SymbolKind = "type";
    const typeSpecChildLimit = Math.min(typeSpec.childCount, MAX_CHILDREN);
    for (let i = 0; i < typeSpecChildLimit; i++) {
      const child = typeSpec.child(i);
      if (child && child.type === "struct_type") {
        kind = "struct";
        break;
      } else if (child && child.type === "interface_type") {
        kind = "interface";
        break;
      }
    }

    if (this.symbolIdCounter >= Number.MAX_SAFE_INTEGER - 1) return null;
    this.symbolIdCounter++;

    const goStartRow = node.startPosition?.row;
    const goEndRow = node.endPosition?.row;
    const goStartCol = node.startPosition?.column;
    const goEndCol = node.endPosition?.column;

    return {
      id: this.symbolIdCounter,
      name,
      kind,
      startLine: typeof goStartRow === "number" && Number.isFinite(goStartRow) ? Math.max(1, goStartRow + 1) : 1,
      endLine: typeof goEndRow === "number" && Number.isFinite(goEndRow) ? Math.max(1, goEndRow + 1) : 1,
      startCol: typeof goStartCol === "number" && Number.isFinite(goStartCol) ? Math.max(0, goStartCol) : 0,
      endCol: typeof goEndCol === "number" && Number.isFinite(goEndCol) ? Math.max(0, goEndCol) : 0,
      parentSymbolId: parentId,
    };
  }

  /**
   * Extract a markdown heading as a symbol
   * atx_heading has children: atx_h{N}_marker + inline (the heading text)
   * setext_heading has children: inline (heading text) + setext_h{N}_underline
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractMarkdownHeading(node: any, parentId: number | null): Symbol | null {
    const childLimit = Math.min(node.childCount, MAX_CHILDREN);
    let headingText: string | null = null;
    let prefix = "";

    for (let i = 0; i < childLimit; i++) {
      const child = node.child(i);
      if (!child) continue;

      // ATX: inline child contains heading text directly
      if (child.type === "inline" && child.text) {
        headingText = child.text.trim();
      }
      // Setext: heading text is inside a paragraph > inline
      if (child.type === "paragraph" && child.childCount > 0) {
        const inlineLimit = Math.min(child.childCount, MAX_CHILDREN);
        for (let j = 0; j < inlineLimit; j++) {
          const inlineChild = child.child(j);
          if (inlineChild && inlineChild.type === "inline" && inlineChild.text) {
            headingText = inlineChild.text.trim();
            break;
          }
        }
      }
      // ATX markers: atx_h1_marker = "#", atx_h2_marker = "##", etc.
      if (child.type.startsWith("atx_h") && child.type.endsWith("_marker")) {
        prefix = child.text + " ";
      }
      // Setext underlines: === for h1, --- for h2
      if (child.type === "setext_h1_underline") {
        prefix = "# ";
      }
      if (child.type === "setext_h2_underline") {
        prefix = "## ";
      }
    }

    if (!headingText) return null;
    return this.buildSymbol(prefix + headingText, node, "type", parentId, "markdown");
  }

  /**
   * Get the name of a node
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static readonly MAX_NAME_LENGTH = 10_000;

  private getNodeName(node: any): string | null {
    if (!node) return null;
    const fields = NAME_FIELDS[node.type];

    if (fields) {
      for (const field of fields) {
        const nameNode = node.childForFieldName(field);
        if (nameNode && nameNode.text && nameNode.text.length <= SymbolExtractor.MAX_NAME_LENGTH) {
          return nameNode.text ?? null;
        }
      }
    }

    // Fallback: look for identifier or type_identifier child
    const nameChildLimit = Math.min(node.childCount, MAX_CHILDREN);
    for (let i = 0; i < nameChildLimit; i++) {
      const child = node.child(i);
      if (
        child &&
        (child.type === "identifier" ||
          child.type === "type_identifier" ||
          child.type === "property_identifier") &&
        child.text &&
        child.text.length <= SymbolExtractor.MAX_NAME_LENGTH
      ) {
        return child.text ?? null;
      }
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirCallTargetName(node: any): string | null {
    if (!node || node.type !== "call") return null;
    const targetNode = node.childForFieldName?.("target");
    return this.getElixirNameFromNode(targetNode);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirArgumentsNode(node: any): any | null {
    if (!node) return null;

    const childLimit = Math.min(node.childCount ?? 0, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = node.child(i);
      if (child?.type === "arguments") {
        return child;
      }
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirDefinitionName(node: any): string | null {
    const argsNode = this.getElixirArgumentsNode(node);
    if (!argsNode) return null;

    const firstArg = this.getFirstNamedChild(argsNode);
    return this.getElixirDefinedNameFromArgument(firstArg);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirFirstAliasArgument(node: any): string | null {
    const argsNode = this.getElixirArgumentsNode(node);
    if (!argsNode) return null;

    const childLimit = Math.min(argsNode.childCount ?? 0, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = argsNode.child(i);
      if (child?.type === "alias" && child.text) {
        return child.text.trim();
      }
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirImplementationName(node: any): string | null {
    const protocolName = this.getElixirFirstAliasArgument(node);
    const implTarget = this.getElixirImplementationTarget(node);

    if (protocolName && implTarget) return `${protocolName} for ${implTarget}`;
    return protocolName ?? implTarget;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirImplementationTarget(node: any): string | null {
    const argsNode = this.getElixirArgumentsNode(node);
    if (!argsNode) return null;

    const childLimit = Math.min(argsNode.childCount ?? 0, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = argsNode.child(i);
      if (child?.type !== "keywords") continue;

      const pairLimit = Math.min(child.childCount ?? 0, MAX_CHILDREN);
      for (let j = 0; j < pairLimit; j++) {
        const pair = child.child(j);
        if (pair?.type !== "pair") continue;

        const keyNode = pair.childForFieldName?.("key");
        const valueNode = pair.childForFieldName?.("value");
        const keyText = typeof keyNode?.text === "string" ? keyNode.text.trim() : "";
        if (!keyText.startsWith("for:")) continue;

        const valueText = this.getElixirNameFromNode(valueNode) ?? this.getNormalizedNodeText(valueNode);
        if (valueText) return valueText;
      }
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirDefinedNameFromArgument(node: any): string | null {
    if (!node) return null;

    if (node.type === "binary_operator") {
      const operatorNode = node.childForFieldName?.("operator");
      if (operatorNode?.text === "when") {
        return this.getElixirDefinedNameFromArgument(node.childForFieldName?.("left"));
      }
    }

    if (node.type === "call") {
      return this.getElixirNameFromNode(node.childForFieldName?.("target"));
    }

    return this.getElixirNameFromNode(node);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getElixirNameFromNode(node: any): string | null {
    if (!node || typeof node.text !== "string") return null;

    if (
      node.type === "identifier" ||
      node.type === "alias" ||
      node.type === "operator_identifier" ||
      node.type === "atom" ||
      node.type === "quoted_atom"
    ) {
      return node.text.trim();
    }

    if (node.type === "dot") {
      const right = node.childForFieldName?.("right");
      return this.getElixirNameFromNode(right) ?? this.getNormalizedNodeText(node);
    }

    return this.getNormalizedNodeText(node);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNormalizedNodeText(node: any): string | null {
    if (!node || typeof node.text !== "string") return null;
    const text = node.text.replace(/\s+/g, " ").trim();
    return text || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getFirstNamedChild(node: any): any | null {
    if (!node) return null;

    const childLimit = Math.min(node.childCount ?? 0, MAX_CHILDREN);
    for (let i = 0; i < childLimit; i++) {
      const child = node.child(i);
      if (child?.isNamed) {
        return child;
      }
    }

    return null;
  }

  /**
   * Get a signature string for a symbol
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSignature(node: any, language: SupportedLanguage): string | undefined {
    if (!node?.text || typeof node.text !== "string") return undefined;
    if (node.text.length > MAX_SIGNATURE_TEXT_LENGTH) return undefined;

    const isElixirDefinition =
      language === "elixir" && node.type === "call" && ELIXIR_FUNCTION_MACROS.has(this.getElixirCallTargetName(node) ?? "");
    if (!SIGNATURE_FUNCTION_TYPES.includes(node.type) && !isElixirDefinition) return undefined;

    const text = node.text;
    const lines = text.split("\n", 50);
    if (lines.length > 0) {
      let firstLine = lines[0];
      // Clean up the signature
      if (language === "python") {
        const colonIndex = firstLine.indexOf(":");
        if (colonIndex !== -1) {
          firstLine = firstLine.substring(0, colonIndex + 1);
        }
      } else {
        const braceIndex = firstLine.indexOf("{");
        if (braceIndex !== -1) {
          firstLine = firstLine.substring(0, braceIndex).trim();
        }
      }
      return firstLine.trim();
    }

    return undefined;
  }
}

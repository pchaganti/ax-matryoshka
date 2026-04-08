import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ParserRegistry } from "../../src/treesitter/parser-registry.js";
import { SymbolExtractor } from "../../src/treesitter/symbol-extractor.js";
import type { Symbol } from "../../src/treesitter/types.js";

describe("SymbolExtractor", () => {
  let registry: ParserRegistry;
  let extractor: SymbolExtractor;

  beforeAll(async () => {
    registry = new ParserRegistry();
    await registry.init();
    extractor = new SymbolExtractor(registry);
  });

  afterAll(() => {
    registry.dispose();
  });

  describe("TypeScript", () => {
    it("should extract function declarations", async () => {
      const code = `
function hello(name: string): string {
  return "Hello, " + name;
}

function goodbye(): void {
  console.log("Goodbye");
}
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      expect(symbols.length).toBeGreaterThanOrEqual(2);
      const funcNames = symbols.filter((s) => s.kind === "function").map((s) => s.name);
      expect(funcNames).toContain("hello");
      expect(funcNames).toContain("goodbye");
    });

    it("should extract class and methods", async () => {
      const code = `
class Greeter {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return "Hello, " + this.name;
  }

  farewell(): void {
    console.log("Goodbye");
  }
}
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      // Should have class
      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe("Greeter");

      // Should have methods
      const methods = symbols.filter((s) => s.kind === "method");
      const methodNames = methods.map((s) => s.name);
      expect(methodNames).toContain("greet");
      expect(methodNames).toContain("farewell");
    });

    it("should capture parent-child relationships", async () => {
      const code = `
class Parent {
  childMethod(): void {
    // method body
  }
}
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      const parentClass = symbols.find((s) => s.name === "Parent" && s.kind === "class");
      const childMethod = symbols.find((s) => s.name === "childMethod" && s.kind === "method");

      expect(parentClass).toBeDefined();
      expect(childMethod).toBeDefined();

      // Method should reference parent class
      if (parentClass && childMethod) {
        expect(childMethod.parentSymbolId).toBe(parentClass.id);
      }
    });

    it("should extract interfaces and types", async () => {
      const code = `
interface Person {
  name: string;
  age: number;
}

type ID = string | number;

interface Employee extends Person {
  department: string;
}
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      const interfaces = symbols.filter((s) => s.kind === "interface");
      expect(interfaces.length).toBe(2);
      const interfaceNames = interfaces.map((s) => s.name);
      expect(interfaceNames).toContain("Person");
      expect(interfaceNames).toContain("Employee");

      const types = symbols.filter((s) => s.kind === "type");
      expect(types.length).toBe(1);
      expect(types[0].name).toBe("ID");
    });

    it("should track accurate line numbers", async () => {
      const code = `// Line 1
// Line 2
function test(): void { // Line 3
  // Line 4
} // Line 5
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      const testFunc = symbols.find((s) => s.name === "test");
      expect(testFunc).toBeDefined();
      expect(testFunc!.startLine).toBe(3);
      expect(testFunc!.endLine).toBe(5);
    });

    it("should extract arrow functions assigned to variables", async () => {
      const code = `
const add = (a: number, b: number): number => a + b;

const multiply = (a: number, b: number): number => {
  return a * b;
};
`;
      const symbols = await extractor.extractSymbols(code, ".ts");

      // Arrow functions assigned to const are typically extracted as variables
      const varNames = symbols.filter((s) => s.kind === "variable" || s.kind === "function").map((s) => s.name);
      expect(varNames.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("JavaScript", () => {
    it("should extract function declarations", async () => {
      const code = `
function add(a, b) {
  return a + b;
}

const multiply = function(a, b) {
  return a * b;
};
`;
      const symbols = await extractor.extractSymbols(code, ".js");

      const funcNames = symbols.filter((s) => s.kind === "function" || s.kind === "variable").map((s) => s.name);
      expect(funcNames).toContain("add");
    });

    it("should extract class definitions", async () => {
      const code = `
class Calculator {
  add(a, b) {
    return a + b;
  }
}
`;
      const symbols = await extractor.extractSymbols(code, ".js");

      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe("Calculator");
    });
  });

  describe("Python", () => {
    it("should extract function definitions", async () => {
      const code = `
def hello(name):
    return f"Hello, {name}"

def goodbye():
    print("Goodbye")
`;
      const symbols = await extractor.extractSymbols(code, ".py");

      const funcNames = symbols.filter((s) => s.kind === "function").map((s) => s.name);
      expect(funcNames).toContain("hello");
      expect(funcNames).toContain("goodbye");
    });

    it("should extract class definitions", async () => {
      const code = `
class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}"
`;
      const symbols = await extractor.extractSymbols(code, ".py");

      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe("Greeter");

      const methods = symbols.filter((s) => s.kind === "method");
      expect(methods.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Go", () => {
    it("should extract function declarations", async () => {
      const code = `
package main

func hello(name string) string {
    return "Hello, " + name
}

func add(a, b int) int {
    return a + b
}
`;
      const symbols = await extractor.extractSymbols(code, ".go");

      const funcNames = symbols.filter((s) => s.kind === "function").map((s) => s.name);
      expect(funcNames).toContain("hello");
      expect(funcNames).toContain("add");
    });

    it("should extract struct and methods", async () => {
      const code = `
package main

type Person struct {
    Name string
    Age  int
}

func (p *Person) Greet() string {
    return "Hello, " + p.Name
}
`;
      const symbols = await extractor.extractSymbols(code, ".go");

      const structs = symbols.filter((s) => s.kind === "struct");
      expect(structs.length).toBe(1);
      expect(structs[0].name).toBe("Person");

      const methods = symbols.filter((s) => s.kind === "method");
      expect(methods.length).toBe(1);
      expect(methods[0].name).toBe("Greet");
    });
  });

  describe("Elixir", () => {
    it("should extract module, functions, and macros", async () => {
      const code = `
defmodule Greeter do
  def hello(name) do
    "Hello, #{name}"
  end

  defp secret do
    :ok
  end

  defmacro announce(value) do
    value
  end
end
`;
      const symbols = await extractor.extractSymbols(code, ".ex");

      const moduleSymbol = symbols.find((s) => s.kind === "module" && s.name === "Greeter");
      expect(moduleSymbol).toBeDefined();

      const functionNames = symbols.filter((s) => s.kind === "function").map((s) => s.name);
      expect(functionNames).toContain("hello");
      expect(functionNames).toContain("secret");
      expect(functionNames).toContain("announce");
    });

    it("should extract guarded function definitions", async () => {
      const code = `
defmodule Guarded do
  def greet(name) when is_binary(name) do
    name
  end
end
`;
      const symbols = await extractor.extractSymbols(code, ".ex");

      const greet = symbols.find((s) => s.kind === "function" && s.name === "greet");
      expect(greet).toBeDefined();
    });

    it("should extract protocols and implementations", async () => {
      const code = `
defprotocol String.Chars do
  def to_string(data)
end

defimpl String.Chars, for: Integer do
  def to_string(data) do
    Integer.to_string(data)
  end
end
`;
      const symbols = await extractor.extractSymbols(code, ".ex");

      const protocolSymbol = symbols.find((s) => s.kind === "interface" && s.name === "String.Chars");
      expect(protocolSymbol).toBeDefined();

      const implSymbol = symbols.find((s) => s.kind === "module" && s.name === "String.Chars for Integer");
      expect(implSymbol).toBeDefined();

      const toStringSymbols = symbols.filter((s) => s.kind === "function" && s.name === "to_string");
      expect(toStringSymbols.length).toBeGreaterThanOrEqual(2);
    });

    it("should capture parent-child relationships for nested Elixir definitions", async () => {
      const code = `
defmodule Parent do
  def child(value) do
    value
  end
end
`;
      const symbols = await extractor.extractSymbols(code, ".ex");

      const parentModule = symbols.find((s) => s.kind === "module" && s.name === "Parent");
      const childFunction = symbols.find((s) => s.kind === "function" && s.name === "child");

      expect(parentModule).toBeDefined();
      expect(childFunction).toBeDefined();

      if (parentModule && childFunction) {
        expect(childFunction.parentSymbolId).toBe(parentModule.id);
      }
    });
  });

  describe("Clojure", () => {
    it("should extract ns, def, defn, and defmacro", async () => {
      const code = `
(ns myapp.core
  (:require [clojure.string :as str]))

(def config {:port 3000})

(defn greet [name]
  (str "Hello, " name))

(defn- private-fn [x]
  (+ x 1))

(defmacro with-logging [& body]
  \`(do (println "Logging...") ~@body))
`;
      const symbols = await extractor.extractSymbols(code, ".clj");

      const nsSymbol = symbols.find((s) => s.kind === "namespace" && s.name === "myapp.core");
      expect(nsSymbol).toBeDefined();

      const varSymbol = symbols.find((s) => s.kind === "variable" && s.name === "config");
      expect(varSymbol).toBeDefined();

      const functionNames = symbols.filter((s) => s.kind === "function").map((s) => s.name);
      expect(functionNames).toContain("greet");
      expect(functionNames).toContain("private-fn");
      expect(functionNames).toContain("with-logging");
    });

    it("should extract defprotocol and defrecord", async () => {
      const code = `
(defprotocol MyProtocol
  (my-method [this x]))

(defrecord MyRecord [field1 field2])
`;
      const symbols = await extractor.extractSymbols(code, ".clj");

      const protocolSymbol = symbols.find((s) => s.kind === "interface" && s.name === "MyProtocol");
      expect(protocolSymbol).toBeDefined();

      const recordSymbol = symbols.find((s) => s.kind === "class" && s.name === "MyRecord");
      expect(recordSymbol).toBeDefined();
    });

    it("should extract defmulti and defmethod with dispatch values", async () => {
      const code = `
(defmulti dispatch-fn :type)

(defmethod dispatch-fn :a [m]
  (:value m))

(defmethod dispatch-fn :b [m]
  (:other m))
`;
      const symbols = await extractor.extractSymbols(code, ".clj");

      const multiSymbol = symbols.find((s) => s.kind === "function" && s.name === "dispatch-fn");
      expect(multiSymbol).toBeDefined();

      const methodSymbols = symbols.filter((s) => s.kind === "function" && s.name.startsWith("dispatch-fn :"));
      expect(methodSymbols.length).toBe(2);
      expect(methodSymbols.map((s) => s.name)).toContain("dispatch-fn :a");
      expect(methodSymbols.map((s) => s.name)).toContain("dispatch-fn :b");
    });

    it("should include signatures for function definitions", async () => {
      const code = `
(defn greet [name]
  (str "Hello, " name))
`;
      const symbols = await extractor.extractSymbols(code, ".clj");

      const greet = symbols.find((s) => s.name === "greet");
      expect(greet).toBeDefined();
      expect(greet!.signature).toBe("(defn greet [name]");
    });

    it("should preserve map destructuring in signatures", async () => {
      const code = `
(defn handler [{:keys [params body]} request]
  (process params body))
`;
      const symbols = await extractor.extractSymbols(code, ".clj");

      const handler = symbols.find((s) => s.name === "handler");
      expect(handler).toBeDefined();
      expect(handler!.signature).toBe("(defn handler [{:keys [params body]} request]");
    });

    it("should work with ClojureScript files", async () => {
      const code = `
(ns myapp.views
  (:require [reagent.core :as r]))

(defn main-view []
  [:div "Hello"])
`;
      const symbols = await extractor.extractSymbols(code, ".cljs");

      const nsSymbol = symbols.find((s) => s.kind === "namespace");
      expect(nsSymbol).toBeDefined();
      expect(nsSymbol!.name).toBe("myapp.views");

      const funcSymbol = symbols.find((s) => s.kind === "function");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol!.name).toBe("main-view");
    });
  });

  describe("error handling", () => {
    it("should return empty array for parse errors", async () => {
      const code = `
function incomplete(
  // missing closing paren and body
`;
      const symbols = await extractor.extractSymbols(code, ".ts");
      // Should not throw, may return partial results or empty
      expect(Array.isArray(symbols)).toBe(true);
    });

    it("should throw for unsupported extension", async () => {
      await expect(extractor.extractSymbols("code", ".rs")).rejects.toThrow();
    });
  });
});

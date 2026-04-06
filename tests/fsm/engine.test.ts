import { describe, it, expect } from "vitest";
import { FSMEngine, type FSMSpec, type State } from "../../src/fsm/engine.js";

interface Counter {
  value: number;
  log: string[];
}

describe("FSMEngine", () => {
  describe("basic execution", () => {
    it("should run a simple linear FSM", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "start",
        terminal: new Set(["done"]),
        states: new Map<string, State<Counter>>([
          ["start", {
            handler: (ctx) => ({ ...ctx, value: ctx.value + 1, log: [...ctx.log, "start"] }),
            transitions: [["done", () => true]],
          }],
          ["done", {
            handler: (ctx) => ctx,
            transitions: [],
          }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      const result = await engine.run(spec, { value: 0, log: [] });
      expect(result.value).toBe(1);
      expect(result.log).toEqual(["start"]);
    });

    it("should run multi-step FSM", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "a",
        terminal: new Set(["c"]),
        states: new Map<string, State<Counter>>([
          ["a", {
            handler: (ctx) => ({ ...ctx, value: ctx.value + 1, log: [...ctx.log, "a"] }),
            transitions: [["b", () => true]],
          }],
          ["b", {
            handler: (ctx) => ({ ...ctx, value: ctx.value + 10, log: [...ctx.log, "b"] }),
            transitions: [["c", () => true]],
          }],
          ["c", {
            handler: (ctx) => ctx,
            transitions: [],
          }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      const result = await engine.run(spec, { value: 0, log: [] });
      expect(result.value).toBe(11);
      expect(result.log).toEqual(["a", "b"]);
    });
  });

  describe("branching transitions", () => {
    it("should take first matching transition", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "check",
        terminal: new Set(["high", "low"]),
        states: new Map<string, State<Counter>>([
          ["check", {
            handler: (ctx) => ctx,
            transitions: [
              ["high", (ctx) => ctx.value > 10],
              ["low", () => true],
            ],
          }],
          ["high", { handler: (ctx) => ctx, transitions: [] }],
          ["low", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();

      const lowResult = await engine.run(spec, { value: 5, log: [] });
      expect(lowResult.log).toEqual([]); // went to "low" terminal

      const highResult = await engine.run(spec, { value: 20, log: [] });
      expect(highResult.log).toEqual([]); // went to "high" terminal
    });
  });

  describe("looping", () => {
    it("should support loops (state transitioning back to earlier state)", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "increment",
        terminal: new Set(["done"]),
        states: new Map<string, State<Counter>>([
          ["increment", {
            handler: (ctx) => ({ ...ctx, value: ctx.value + 1 }),
            transitions: [
              ["done", (ctx) => ctx.value >= 5],
              ["increment", () => true],
            ],
          }],
          ["done", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      const result = await engine.run(spec, { value: 0, log: [] });
      expect(result.value).toBe(5);
    });
  });

  describe("async handlers", () => {
    it("should support async handlers", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "fetch",
        terminal: new Set(["done"]),
        states: new Map<string, State<Counter>>([
          ["fetch", {
            handler: async (ctx) => {
              await new Promise((r) => setTimeout(r, 1));
              return { ...ctx, value: 42 };
            },
            transitions: [["done", () => true]],
          }],
          ["done", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      const result = await engine.run(spec, { value: 0, log: [] });
      expect(result.value).toBe(42);
    });
  });

  describe("safety limits", () => {
    it("should throw on max iterations exceeded", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "loop",
        terminal: new Set(["done"]),
        maxIterations: 10,
        states: new Map<string, State<Counter>>([
          ["loop", {
            handler: (ctx) => ({ ...ctx, value: ctx.value + 1 }),
            transitions: [["loop", () => true]], // infinite loop
          }],
          ["done", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      await expect(engine.run(spec, { value: 0, log: [] })).rejects.toThrow(/max iterations/i);
    });

    it("should throw if no transition matches", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "stuck",
        terminal: new Set(["done"]),
        states: new Map<string, State<Counter>>([
          ["stuck", {
            handler: (ctx) => ctx,
            transitions: [["done", () => false]], // never matches
          }],
          ["done", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      await expect(engine.run(spec, { value: 0, log: [] })).rejects.toThrow(/no matching transition/i);
    });
  });

  describe("trace", () => {
    it("should record state trace", async () => {
      const spec: FSMSpec<Counter> = {
        initial: "a",
        terminal: new Set(["c"]),
        states: new Map<string, State<Counter>>([
          ["a", {
            handler: (ctx) => ctx,
            transitions: [["b", () => true]],
          }],
          ["b", {
            handler: (ctx) => ctx,
            transitions: [["c", () => true]],
          }],
          ["c", { handler: (ctx) => ctx, transitions: [] }],
        ]),
      };

      const engine = new FSMEngine<Counter>();
      const trace: string[] = [];
      await engine.run(spec, { value: 0, log: [] }, { onTransition: (from, to) => trace.push(`${from}->${to}`) });
      expect(trace).toEqual(["a->b", "b->c"]);
    });
  });
});

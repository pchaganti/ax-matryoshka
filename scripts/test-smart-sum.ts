import { solve, type Bindings, type SolverTools } from "../src/logic/lc-solver.js";
import { parse } from "../src/logic/lc-parser.js";

// Simulated grep result objects (what Turn 3 produced)
const grepResults = [
  { match: "SALES", line: "SALES_DATA_NORTH: $2,340,000", lineNum: 20, index: 0, groups: [] },
  { match: "SALES", line: "SALES_DATA_SOUTH: $3,120,000", lineNum: 45, index: 0, groups: [] },
  { match: "SALES", line: "SALES_DATA_EAST: $2,890,000", lineNum: 65, index: 0, groups: [] },
  { match: "SALES", line: "SALES_DATA_WEST: $2,670,000", lineNum: 85, index: 0, groups: [] },
  { match: "SALES", line: "SALES_DATA_CENTRAL: $1,980,000", lineNum: 108, index: 0, groups: [] },
];

const tools: SolverTools = {
  context: "",
  grep: () => [],
  fuzzy_search: () => [],
  bm25: () => [],
  semantic: () => [],
  text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
};

const bindings: Bindings = new Map();
bindings.set("RESULTS", grepResults);

const result = solve(parse("(sum RESULTS)").term!, tools, bindings);
console.log("Sum result:", result.value);
console.log("Expected: 13,000,000");
console.log("Correct:", result.value === 13000000);

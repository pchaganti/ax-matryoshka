import { SynthesisIntegrator } from "../src/logic/synthesis-integrator.js";

const integrator = new SynthesisIntegrator();

const result = integrator.synthesizeOnFailure({
  operation: "predicate",
  input: "[ERROR] One",
  expectedType: "boolean",
  examples: [
    { input: "[ERROR] One", output: true },
    { input: "[INFO] Two", output: false },
  ],
});

console.log("Synthesis result:", result);

if (result.fn) {
  const testCases = [
    "[ERROR] One",
    "[INFO] Two",
    "[ERROR] Three",
    "[WARN] Slow",
  ];

  for (const test of testCases) {
    console.log(`  "${test}" ->`, result.fn(test));
  }
}

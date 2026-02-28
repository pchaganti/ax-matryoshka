/**
 * Relational Solver
 *
 * The relational solver runs bidirectionally:
 * - Forward: (program, input) → output
 * - Backward: (input, output) → program (SYNTHESIS)
 *
 * Key capabilities:
 * 1. Automatic primitive composition
 * 2. Function derivation (filter from reduce)
 * 3. Synthesis on failure (when built-ins don't work)
 */

import { validateRegex } from "./lc-solver.js";

// ============================================================================
// Types
// ============================================================================

export type Primitive =
  | "match"
  | "replace"
  | "split"
  | "parseInt"
  | "parseFloat"
  | "parseDate"
  | "parseCurrency"
  | "parseNumber"
  | "toUpperCase"
  | "toLowerCase"
  | "trim"
  | "index";

export interface CompositionStep {
  primitive: Primitive;
  args: Record<string, unknown>;
}

export interface Composition {
  steps: CompositionStep[];
}

export interface SynthesisResult {
  success: boolean;
  composition?: Composition;
  apply: (input: string) => unknown;
}

export interface Example {
  input: string;
  output: unknown;
}

// ============================================================================
// Primitive Implementations
// ============================================================================

const PRIMITIVES: Record<Primitive, (input: unknown, args: Record<string, unknown>) => unknown> = {
  match: (input, args) => {
    if (typeof input !== "string") return null;
    const pattern = args.pattern as string;
    const group = (args.group as number) ?? 0;
    if (group < 0) return null;
    const validation = validateRegex(pattern);
    if (!validation.valid) return null;
    try {
      const regex = new RegExp(pattern);
      const result = input.match(regex);
      if (!result) return null;
      if (group >= result.length) return null;
      return result[group] ?? null;
    } catch {
      return null;
    }
  },

  replace: (input, args) => {
    if (typeof input !== "string") return null;
    const from = args.from as string;
    const to = args.to as string;
    const fromValidation = validateRegex(from);
    if (!fromValidation.valid) return null;
    try {
      const regex = new RegExp(from, "g");
      const safeTo = to.replace(/\$/g, "$$$$");
      return input.replace(regex, safeTo);
    } catch {
      return null;
    }
  },

  split: (input, args) => {
    if (typeof input !== "string") return null;
    const delim = args.delim as string;
    if (!delim || delim.length === 0) return null;
    const idx = args.index as number;
    if (!Number.isInteger(idx) || idx < 0) return null;
    const parts = input.split(delim);
    if (idx >= parts.length) return null;
    return parts[idx] ?? null;
  },

  parseInt: (input, _args) => {
    if (input === null || input === undefined) return null;
    const str = String(input).replace(/,/g, "");
    const result = parseInt(str, 10);
    return isNaN(result) || !Number.isSafeInteger(result) ? null : result;
  },

  parseFloat: (input, _args) => {
    if (input === null || input === undefined) return null;
    const str = String(input).replace(/,/g, "");
    const result = parseFloat(str);
    return isNaN(result) || !isFinite(result) ? null : result;
  },

  parseDate: (input, args) => {
    if (typeof input !== "string") return null;
    const format = args.format as string | undefined;
    return parseDateImpl(input, format);
  },

  parseCurrency: (input, _args) => {
    if (typeof input !== "string") return null;
    return parseCurrencyImpl(input);
  },

  parseNumber: (input, _args) => {
    if (typeof input !== "string") return null;
    return parseNumberImpl(input);
  },

  toUpperCase: (input, _args) => {
    if (typeof input !== "string") return null;
    return input.toUpperCase();
  },

  toLowerCase: (input, _args) => {
    if (typeof input !== "string") return null;
    return input.toLowerCase();
  },

  trim: (input, _args) => {
    if (typeof input !== "string") return null;
    return input.trim();
  },

  index: (input, args) => {
    if (!Array.isArray(input)) return null;
    const idx = args.index as number;
    if (!Number.isInteger(idx) || idx < 0 || idx >= input.length) return null;
    return input[idx] ?? null;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

const MONTHS: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(month: number, year: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month] ?? 0;
}

function parseDateImpl(str: string, formatHint?: string): string | null {
  const trimmed = str.trim();

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  // US format: MM/DD/YYYY
  if (formatHint === "US" || !formatHint) {
    const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const [, mm, dd, yyyy] = usMatch;
      const month = parseInt(mm, 10);
      const day = parseInt(dd, 10);
      const year = parseInt(yyyy, 10);
      if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) return null;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  // EU format: DD/MM/YYYY
  if (formatHint === "EU") {
    const euMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (euMatch) {
      const [, dd, mm, yyyy] = euMatch;
      const month = parseInt(mm, 10);
      const day = parseInt(dd, 10);
      const year = parseInt(yyyy, 10);
      if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) return null;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  // Natural: Month Day, Year (January 15, 2024)
  const naturalMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (naturalMatch) {
    const [, monthName, day, year] = naturalMatch;
    const month = MONTHS[monthName.toLowerCase()];
    const dayNum = parseInt(day, 10);
    const m = month ? parseInt(month, 10) : 0;
    if (month && dayNum >= 1 && dayNum <= daysInMonth(m, parseInt(year, 10))) {
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
    if (month) return null; // Recognized month but invalid day
  }

  // Day Month Year (15 Jan 2024)
  const dmyMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dmyMatch) {
    const [, day, monthName, year] = dmyMatch;
    const month = MONTHS[monthName.toLowerCase()];
    const dayNum = parseInt(day, 10);
    const m = month ? parseInt(month, 10) : 0;
    if (month && dayNum >= 1 && dayNum <= daysInMonth(m, parseInt(year, 10))) {
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
    if (month) return null; // Recognized month but invalid day
  }

  // DD-Mon-YY format (15-Jan-24)
  const shortMatch = trimmed.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2})$/);
  if (shortMatch) {
    const [, day, monthName, shortYear] = shortMatch;
    const month = MONTHS[monthName.toLowerCase()];
    if (month) {
      const year = parseInt(shortYear) < 50 ? `20${shortYear}` : `19${shortYear}`;
      const dayNum = parseInt(day, 10);
      const m = parseInt(month, 10);
      if (dayNum < 1 || dayNum > daysInMonth(m, parseInt(year, 10))) return null;
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
  }

  return null;
}

function parseCurrencyImpl(str: string, depth: number = 0): number | null {
  if (depth > 10) return null; // Recursion depth limit
  const trimmed = str.trim();

  // Handle negative in parentheses: ($1,234)
  const negParenMatch = trimmed.match(/^\(([^)]+)\)$/);
  if (negParenMatch) {
    const inner = parseCurrencyImpl(negParenMatch[1], depth + 1);
    return inner !== null ? -inner : null;
  }

  // Handle negative with minus: -$1,234
  const negMinusMatch = trimmed.match(/^-([^-].*)$/);
  if (negMinusMatch) {
    const inner = parseCurrencyImpl(negMinusMatch[1], depth + 1);
    return inner !== null ? -inner : null;
  }

  // Strip currency symbols
  let cleaned = trimmed.replace(/^[\$€£¥₹]/, "").trim();

  // Detect format (EU vs US)
  // EU: 1.234,56 (dot for thousands, comma for decimal)
  // US: 1,234.56 (comma for thousands, dot for decimal)
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Check which comes last
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");

    if (lastComma > lastDot) {
      // EU format: 1.234,56
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Check if comma is decimal separator (single comma with 2 digits after)
    const commaMatch = cleaned.match(/^([^,]+),(\d{2})$/);
    if (commaMatch) {
      cleaned = cleaned.replace(",", ".");
    } else {
      // Thousands separator
      cleaned = cleaned.replace(/,/g, "");
    }
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? null : result;
}

function parseNumberImpl(str: string): number | null {
  const trimmed = str.trim();

  // Handle percentage
  const percentMatch = trimmed.match(/^([\d.,]+)%$/);
  if (percentMatch) {
    const num = parseFloat(percentMatch[1].replace(/,/g, ""));
    return isNaN(num) || !isFinite(num) ? null : num / 100;
  }

  // Handle scientific notation
  if (/^[\d.]+e[+-]?\d+$/i.test(trimmed)) {
    const result = parseFloat(trimmed);
    return isNaN(result) || !isFinite(result) ? null : result;
  }

  // Standard number with commas
  const cleaned = trimmed.replace(/,/g, "");
  const result = parseFloat(cleaned);
  return isNaN(result) || !isFinite(result) ? null : result;
}

// ============================================================================
// Composition Evaluation (Forward Mode)
// ============================================================================

export function evaluateComposition(composition: Composition, input: string): unknown {
  let current: unknown = input;

  for (const step of composition.steps) {
    const primitive = PRIMITIVES[step.primitive];
    if (!primitive) {
      throw new Error(`Unknown primitive: ${step.primitive}`);
    }
    current = primitive(current, step.args);
    if (current === null || current === undefined) {
      return null;
    }
  }

  return current;
}

// ============================================================================
// Primitive Composition Search
// ============================================================================

/**
 * Common patterns for extraction
 */
const COMMON_PATTERNS = [
  { pattern: "\\$([\\d,]+)", group: 1 },         // $1,234
  { pattern: "\\$([\\d,.]+)", group: 1 },        // $1,234.56
  { pattern: "(\\d+)", group: 1 },               // plain number
  { pattern: "([\\d,]+)", group: 1 },            // number with commas
  { pattern: "(\\d+)%", group: 1 },              // percentage
  { pattern: "#(\\d+)", group: 1 },              // #12345
  { pattern: ":\\s*([^)]+)", group: 1 },         // : value
  { pattern: "Q(\\d)-(\\d+)", group: 0 },        // Q1-2024
  { pattern: "[A-Za-z]+\\s+\\d+,?\\s+\\d+", group: 0 }, // Jan 15, 2024
  { pattern: "\\d+-[A-Za-z]+-\\d+", group: 0 },  // 15-Jan-24
];

/**
 * Generate candidate compositions for string → number transformations
 */
function* generateNumberExtractionCandidates(): Generator<Composition> {
  // Direct parseInt/parseFloat
  yield { steps: [{ primitive: "parseInt", args: {} }] };
  yield { steps: [{ primitive: "parseFloat", args: {} }] };
  yield { steps: [{ primitive: "parseCurrency", args: {} }] };
  yield { steps: [{ primitive: "parseNumber", args: {} }] };

  // Match + parseInt/parseFloat
  for (const { pattern, group } of COMMON_PATTERNS) {
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "parseInt", args: {} },
      ],
    };
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "parseFloat", args: {} },
      ],
    };
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "parseCurrency", args: {} },
      ],
    };
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "parseNumber", args: {} },
      ],
    };

    // Match + replace + parse
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "replace", args: { from: ",", to: "" } },
        { primitive: "parseInt", args: {} },
      ],
    };
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "replace", args: { from: ",", to: "" } },
        { primitive: "parseFloat", args: {} },
      ],
    };
  }
}

/**
 * Generate candidate compositions for string → string transformations
 */
function* generateStringExtractionCandidates(): Generator<Composition> {
  // Direct operations
  yield { steps: [{ primitive: "trim", args: {} }] };
  yield { steps: [{ primitive: "toUpperCase", args: {} }] };
  yield { steps: [{ primitive: "toLowerCase", args: {} }] };
  yield { steps: [{ primitive: "parseDate", args: {} }] };

  // Match operations
  for (const { pattern, group } of COMMON_PATTERNS) {
    yield {
      steps: [{ primitive: "match", args: { pattern, group } }],
    };
    yield {
      steps: [
        { primitive: "match", args: { pattern, group } },
        { primitive: "parseDate", args: {} },
      ],
    };
  }

  // Split operations
  for (const delim of [",", ";", ":", " ", "-", "/"]) {
    for (let idx = 0; idx < 5; idx++) {
      yield {
        steps: [{ primitive: "split", args: { delim, index: idx } }],
      };
      yield {
        steps: [
          { primitive: "split", args: { delim, index: idx } },
          { primitive: "trim", args: {} },
        ],
      };
    }
  }
}

/**
 * Generate compositions for quarter-to-month mapping
 */
function* generateQuarterMappingCandidates(): Generator<Composition> {
  // Q1-2024 -> 2024-01
  yield {
    steps: [
      { primitive: "match", args: { pattern: "Q(\\d)-(\\d+)", group: 0 } },
    ],
  };
}

/**
 * Search for a composition that maps all examples correctly
 */
function searchComposition(examples: Example[]): Composition | null {
  if (examples.length === 0) return null;

  const firstOutput = examples[0].output;
  const outputType = typeof firstOutput;

  // Choose appropriate candidate generators
  const generators: Generator<Composition>[] = [];

  if (outputType === "number") {
    generators.push(generateNumberExtractionCandidates());
  } else if (outputType === "string") {
    generators.push(generateStringExtractionCandidates());
    generators.push(generateQuarterMappingCandidates());
  }

  // Also try number extraction for string outputs that might be dates
  if (outputType === "string" && String(firstOutput).match(/^\d{4}-\d{2}/)) {
    generators.push(generateNumberExtractionCandidates());
  }

  // Search through all candidates (with iteration limit to prevent runaway search)
  const MAX_CANDIDATES = 10_000;
  let candidatesChecked = 0;

  for (const generator of generators) {
    for (const candidate of generator) {
      if (++candidatesChecked > MAX_CANDIDATES) {
        return null;
      }

      let allMatch = true;

      for (const { input, output } of examples) {
        try {
          const result = evaluateComposition(candidate, input);
          // Use epsilon comparison for floats to handle IEEE 754 precision issues (e.g., 0.1+0.2 !== 0.3)
          const matches = typeof result === "number" && typeof output === "number"
            ? Math.abs(result - output) < 1e-9
            : result === output;
          if (!matches) {
            allMatch = false;
            break;
          }
        } catch {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return candidate;
      }
    }
  }

  return null;
}

// ============================================================================
// Special Case: Quarter Mapping
// ============================================================================

/**
 * Build a quarter-to-month mapper from examples
 */
function buildQuarterMapper(examples: Example[]): ((input: string) => string) | null {
  // Check if this looks like quarter mapping
  const quarterRegex = /Q([1-4])-(\d{4})/;

  // Build mapping from quarter to month
  const quarterToMonth: Record<string, string> = {};

  for (const { input, output } of examples) {
    const match = input.match(quarterRegex);
    if (!match) return null;

    const quarter = match[1];
    const year = match[2];
    const outputStr = String(output);

    // Check output format matches YYYY-MM
    const outputMatch = outputStr.match(/^(\d+)-(\d+)$/);
    if (!outputMatch) return null;

    const [, outYear, month] = outputMatch;
    if (outYear !== year) return null;

    quarterToMonth[quarter] = month;
  }

  // Verify we have a mapping for quarters 1-4
  if (Object.keys(quarterToMonth).length === 0) return null;

  return (input: string) => {
    const match = input.match(quarterRegex);
    if (!match) return input;

    const quarter = match[1];
    const year = match[2];

    // Infer month from quarter if not in our examples
    let month = quarterToMonth[quarter];
    if (!month) {
      const q = parseInt(quarter, 10);
      if (isNaN(q) || q < 1 || q > 4) return input;
      month = String((q - 1) * 3 + 1).padStart(2, "0");
    }

    return `${year}-${month}`;
  };
}

// ============================================================================
// Synthesis from Examples (Backward Mode)
// ============================================================================

/**
 * Synthesize a function from input/output examples
 */
export function synthesizeFromExamples(examples: Example[]): SynthesisResult {
  if (examples.length === 0) {
    return {
      success: false,
      apply: () => null,
    };
  }

  // Try special case: quarter mapping
  if (examples.some(e => String(e.input).match(/Q\d-\d+/))) {
    const mapper = buildQuarterMapper(examples);
    if (mapper) {
      // Verify it works on all examples
      const allMatch = examples.every(({ input, output }) => mapper(input) === output);
      if (allMatch) {
        return {
          success: true,
          composition: { steps: [{ primitive: "match", args: { pattern: "Q(\\d)-(\\d+)", group: 0 } }] },
          apply: mapper,
        };
      }
    }
  }

  // Search for a composition
  const composition = searchComposition(examples);

  if (composition) {
    return {
      success: true,
      composition,
      apply: (input: string) => evaluateComposition(composition, input),
    };
  }

  // Fallback: return a failure
  return {
    success: false,
    apply: () => null,
  };
}

// ============================================================================
// Composition Search with Limited Primitives
// ============================================================================

/**
 * Find a composition using only the specified primitives
 */
export function composeToMatch(
  example: Example,
  availablePrimitives: Primitive[]
): Composition | null {
  const examples = [example];

  // Filter candidates to only use available primitives
  const isAllowed = (composition: Composition): boolean => {
    return composition.steps.every(step => availablePrimitives.includes(step.primitive));
  };

  // Try all generators but filter by available primitives
  const generators: Generator<Composition>[] = [
    generateNumberExtractionCandidates(),
    generateStringExtractionCandidates(),
  ];

  const MAX_CANDIDATES = 10000;
  let candidateCount = 0;

  for (const generator of generators) {
    for (const candidate of generator) {
      if (++candidateCount > MAX_CANDIDATES) break;
      if (!isAllowed(candidate)) continue;

      let allMatch = true;
      for (const { input, output } of examples) {
        try {
          const result = evaluateComposition(candidate, input);
          if (result !== output) {
            allMatch = false;
            break;
          }
        } catch {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return candidate;
      }
    }
    if (candidateCount > MAX_CANDIDATES) break;
  }

  return null;
}

// ============================================================================
// Function Derivation
// ============================================================================

/**
 * The primitive reduce function - all other list operations can be derived from this
 */
const MAX_REDUCE_LENGTH = 1_000_000;

function reduce<T, R>(arr: T[], fn: (acc: R, item: T) => R, initial: R): R {
  let acc = initial;
  const limit = Math.min(arr.length, MAX_REDUCE_LENGTH);
  for (let i = 0; i < limit; i++) {
    acc = fn(acc, arr[i]);
  }
  return acc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

/**
 * Derive higher-order functions from reduce
 */
export function deriveFunction(name: string): AnyFunction | null {
  switch (name) {
    case "filter":
      // filter = reduce with conditional cons (push for O(n) instead of spread O(n^2))
      return <T>(arr: T[], predicate: (x: T) => boolean): T[] => {
        return reduce(
          arr,
          (acc: T[], item: T) => { if (predicate(item)) acc.push(item); return acc; },
          [] as T[]
        );
      };

    case "map":
      // map = reduce with transform + cons (push for O(n) instead of spread O(n^2))
      return <T, R>(arr: T[], transform: (x: T) => R): R[] => {
        return reduce(
          arr,
          (acc: R[], item: T) => { acc.push(transform(item)); return acc; },
          [] as R[]
        );
      };

    case "sum":
      // sum = reduce with addition
      return (arr: number[]): number => {
        return reduce(arr, (acc: number, item: number) => acc + item, 0);
      };

    case "count":
      // count = reduce with increment
      return <T>(arr: T[]): number => {
        return reduce(arr, (acc: number, _item: T) => acc + 1, 0);
      };

    case "find":
      // find = reduce with early termination
      return <T>(arr: T[], predicate: (x: T) => boolean): T | undefined => {
        return reduce(
          arr,
          (acc: T | undefined, item: T) => (acc !== undefined ? acc : predicate(item) ? item : undefined),
          undefined as T | undefined
        );
      };

    case "every":
      // every = reduce with conjunction
      return <T>(arr: T[], predicate: (x: T) => boolean): boolean => {
        return reduce(arr, (acc: boolean, item: T) => acc && predicate(item), true);
      };

    case "some":
      // some = reduce with disjunction
      return <T>(arr: T[], predicate: (x: T) => boolean): boolean => {
        return reduce(arr, (acc: boolean, item: T) => acc || predicate(item), false);
      };

    default:
      return null;
  }
}

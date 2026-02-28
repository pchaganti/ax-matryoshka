// There are 3 types of terms: atomic terms, compound terms, and
// variable terms. Compound terms are object literals whose keys are
// strings, numbers, or symbols and whose values are terms.
export type Term = AtomicTerm | CompoundTerm | Var;

export type AtomicTerm = null | undefined | boolean | number | string | object;

export type CompoundTerm = { [key: string]: Term };

export class Var {
  static new(): Var {
    return new Var();
  }
}

export function isComp(x: Term): x is CompoundTerm {
  return x != null && typeof x === 'object' && !isVar(x);
}

export function isVar(x: unknown): x is Var {
  return x instanceof Var;
}

// A "substitution" is a Map associating variables with terms. In order
// to find the term associated with a variable, we "walk" the variable
// in the substitution. The `walk` function is recursive: after looking
// up the term associated with a variable, we then walk *that* term,
// until we come to a term that is not associated in the substitution.
export type Subst = Map<Var, Term>;

const MAX_WALK_DEPTH = 1000;

export function walk(x: Term, s: Subst, depth: number = 0): Term {
  if (depth > MAX_WALK_DEPTH) return x;
  if (isVar(x) && s.has(x)) return walk(s.get(x)!, s, depth + 1);
  else return x;
}

// `walkAll` behaves exactly like `walk`, except that it recursively
// walks variable terms found within compound terms. It is used
// exclusively in the reification process.
const MAX_WALKALL_DEPTH = 200;

export function walkAll(x: Term, s: Subst, depth: number = 0): Term {
  if (depth > MAX_WALKALL_DEPTH) return x;
  const walked = walk(x, s);
  if (isComp(walked)) {
    const x1 = Object.create(Object.getPrototypeOf(walked));
    for (const k of keysIn(walked)) {
      x1[k] = walkAll(walked[k], s, depth + 1);
    }
    return x1;
  } else {
    return walked;
  }
}

// We allow symbols to be used as keys in compound terms (in order to
// facilitate the desugaring process); this lets us easily collect all
// "normal" and symbol keys of an object.
export function keysIn(x: CompoundTerm): string[] {
  return [
    ...Object.keys(x),
    // Type Hack
    ...((Object.getOwnPropertySymbols(x) as any) as string[]),
  ];
}

// `iota` constructs an array containing the numbers 0..n. We use it to
// generate arrays containing a certain number of elements.
const MAX_IOTA = 10_000;

export function iota(n: number): number[] {
  const limit = Math.min(Math.max(0, Math.floor(n)), MAX_IOTA);
  let res = [];
  for (let i = 0; i < limit; i++) res.push(i);
  return res;
}

// Todo: Check polyfill for `Array.isArray`
export function toArray<A>(x: A | A[]): A[] {
  if (Array.isArray(x)) return x;
  else return [x];
}

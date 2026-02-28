import { isComp, isVar, walk, keysIn, type Term, type Subst, type CompoundTerm } from './common.js';

// Unification is at the heart of miniKanren, ramo, and logic
// programming in general. Here we use Friedman and Byrd's quite elegant
// version (with the occurs check).
export const unify = (x: Term, y: Term, s: Subst): Subst | false => {
  const xWalked = walk(x, s) as Term;
  const yWalked = walk(y, s) as Term;
  if (xWalked === yWalked) return s;
  else if (isVar(xWalked)) return extendS(xWalked, yWalked, s);
  else if (isVar(yWalked)) return extendS(yWalked, xWalked, s);
  else if (isComp(xWalked) && isComp(yWalked)) return unifyComp(xWalked as CompoundTerm, yWalked as CompoundTerm, s);
  else return false;
};

const unifyComp = (x: CompoundTerm, y: CompoundTerm, s: Subst): Subst | false =>
  keysIn(y).every((k: string) => k in x) &&
  keysIn(x).reduce((s: Subst | false, k: string) => s && k in y && unify(x[k], y[k], s as Subst), s as Subst | false);

const extendS = (v: Term, x: Term, s: Subst): Subst | false => !occursIn(v, x, s) && new Map(s).set(v as any, x);

const MAX_OCCURS_DEPTH = 200;

const occursIn = (v: Term, x: Term, s: Subst, depth: number = 0): boolean => {
  if (depth > MAX_OCCURS_DEPTH) return true; // Assume occurs to be safe
  const xWalked = walk(x, s) as Term;
  if (v === xWalked) return true;
  else if (isComp(xWalked)) return keysIn(xWalked as CompoundTerm).some((k: string) => occursIn(v, (xWalked as CompoundTerm)[k], s, depth + 1));
  else return false;
};

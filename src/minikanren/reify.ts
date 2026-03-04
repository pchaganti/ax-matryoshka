import {
  isComp,
  isVar,
  walk,
  walkAll,
  keysIn,
  Var,
  type Subst,
  type Term,
  type CompoundTerm,
} from './common.js';

// To reify a term, we first generate a substitution that associates
// each fresh variable with a reified name (like "_0", "_1", etc.). We
// then walk the term in this substitution.
export function reify(x: Term, s: Subst): Term {
  x = walkAll(x, s);
  return walkAll(x, reifyS(x, new Map()));
}

const MAX_REIFY_DEPTH = 200;

function reifyS(x: Term, r: Subst, depth: number = 0): Subst {
  if (depth > MAX_REIFY_DEPTH) return r;
  x = walk(x, r);
  if (isVar(x)) return reifyVar(x, r);
  else if (isComp(x)) return reifyComp(x as CompoundTerm, r, depth);
  else return r;
}

// As in "The Reasoned Schemer", we reify unassociated variables as an
// underscore followed by a number. The same number is used for each
// occurrence of a variable.
function reifyVar(v: Var, r: Subst): Subst {
  return new Map(r).set(v, `_${r.size}`);
}

function reifyComp(x: CompoundTerm, r: Subst, depth: number = 0): Subst {
  return keysIn(x).reduce((r, k) => reifyS(x[k], r, depth + 1), r);
}

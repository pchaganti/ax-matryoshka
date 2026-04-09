Here are the bugs found across all 8 files:

  --------

  ### 1.  /Users/yogthos/src/matryoshka/src/logic/bm25.ts  — Line 114

  Severity: Medium Description: Division by zero when  avgDocLength  is 0. If all document lines tokenize to empty
  arrays (only stopwords/single characters),  avgDocLength  is 0. The expression  dl / avgDocLength  produces  NaN ,
  which propagates through the entire score calculation. Runtime impact: All BM25 scores become  NaN , making results
  unsortable and meaningless. Currently latent (unreachable because no terms → no matches), but fragile if the
  index/search are ever used with mismatched data.

  --------

  ### 2.  /Users/yogthos/src/matryoshka/src/logic/rrf.ts  — Line 71

  Severity: Medium Description:  1 / weights.length  produces  Infinity  when  weights  is an empty array. While
  normalizeWeights([])  returns  []  (map of empty array), the computation of  eq = 1/0  is a latent error. If someone
  calls  normalizeWeights  directly with an empty array and later indexes the result, they'd get unexpected behavior.
  Runtime impact:  eq  is  Infinity ; if used in any arithmetic downstream, produces  NaN .

  --------

  ### 3.  /Users/yogthos/src/matryoshka/src/logic/semantic.ts  — Line 66

  Severity: High Description:  index.lineTokens[i]  accesses the index by position  i  derived from  lines.length ,
  with no bounds check. If  lines  and  index.lineTokens  have different lengths (e.g., stale index built from a
  different version of the document),  index.lineTokens[i]  is  undefined , which will crash inside  tfidfVector .
  Runtime impact:  TypeError  at runtime when a stale or mismatched index is used —  tfidfVector(undefined, index.idf)
  will throw.

  --------

  ### 4.  /Users/yogthos/src/matryoshka/src/logic/qvalue.ts  — Lines 180–186

  Severity: Medium Description:  rerank()  mutates the  QValueStore  as a side effect —  incrementExposure()  is
  called per result inside  .map()  (line 180) and  incrementQueryCount()  is called at the end (line 186). If an
  exception occurs between these calls, exposure counts are incremented but the query count is not, leaving the store
  in an inconsistent state. Additionally, calling  rerank()  is not idempotent — repeated calls with the same results
  keep incrementing exposure/query counts. Runtime impact: Inconsistent store state on error; runaway counters on
  repeated calls.

  --------

  ### 5.  /Users/yogthos/src/matryoshka/src/fuzzy-search.ts  — Lines 67–97

  Severity: High Description: The  fuzzyScore  algorithm undercounts edit distance when the pattern is longer than the
  matched portion of text. When the inner loop exits because  j >= textLen  (text exhausted before pattern), the
  remaining unmatched pattern characters are not added to  errors . The check  matched >= patternLen - maxDistance
  can still pass, producing a  bestScore  of 0 when the true edit distance is much higher. Example: pattern
  "abcdefgh"  (len 8, maxDistance 3), text  "abcde"  (len 5). The loop matches 5 chars with 0 errors, exits when text
  is exhausted.  matched(5) >= 8 - 3 = 5  → true, so  bestScore = 0 . But the true edit distance is 3 (3 deletions).
  Runtime impact: Fuzzy search reports extremely high-confidence matches (score=0) for lines that actually have
  significant edit distance, producing false positives ranked above genuine matches.

  --------

  ### 6.  /Users/yogthos/src/matryoshka/src/synthesis/coordinator.ts  — Line 51

  Severity: High Description:  safeEvalSynthesized  uses  new Function("return " + code)()  to execute arbitrary code,
  relying on a blocklist of dangerous patterns. Blocklist-based sandboxing is fundamentally incomplete. For example,
  atob  can reconstruct blocked strings,  this.constructor.constructor('return process')()  can escape, and numeric
  bracket access  obj[0]  is not blocked (only string bracket access  obj['x']  is). Runtime impact: Arbitrary code
  execution in the host process — an attacker or adversarial LLM output could bypass the blocklist and execute system
  commands, read files, or exfiltrate data.

  --------

  ### 7.  /Users/yogthos/src/matryoshka/src/synthesis/coordinator.ts  — Line 319

  Severity: Medium Description:  regex.test(p)  is called inside a loop ( every ). If  component.pattern  includes the
  global ( g ) flag (e.g., stored as a regex string with flags),  new RegExp(pattern)  would create a regex with the
  g  flag. The  test()  method on a global regex advances  lastIndex , causing subsequent  .test()  calls to produce
  alternating  true / false  results. Runtime impact: A valid regex that should match all positive examples may fail
  the  every()  check on alternating calls, causing correct knowledge-base matches to be skipped.

  --------

  ### 8.  /Users/yogthos/src/matryoshka/src/session.ts  — Lines 59–75

  Severity: Medium Description: The  getOrCreate  method caches sandboxes by  filePath  + content hash, but does not
  account for changes to the  llmFn  parameter. If the same file is opened with a different LLM function, the old
  sandbox (with the stale  __llmQueryBridge ) is returned. Runtime impact: Sandbox uses a stale or garbage-collected
  LLM function reference, causing queries to fail or produce incorrect results. In MCP mode this is avoided (per the
  NOTE), but in standalone mode it's a real bug.

  --------

  ### 9.  /Users/yogthos/src/matryoshka/src/graph/symbol-graph.ts  — Line 149

  Severity: Low Description:  this.graph.getNodeAttribute(source, "symbol")  returns  undefined  if a node exists but
  somehow lacks the  symbol  attribute. The result is pushed directly into the  Symbol[]  array without a null check,
  corrupting the type contract. Same issue at line 187. Runtime impact:  undefined  values in returned  Symbol[]
  arrays cause downstream crashes when callers try to access  .name  or other  Symbol  properties.

  --------

  ### 10.  /Users/yogthos/src/matryoshka/src/graph/symbol-graph.ts  — Line 125

  Severity: Low Description:  implementations()  only returns direct implementors (single hop), but the JSDoc says
  "All classes that implement this interface." Unlike  descendants()  which is transitive,  implementations()  is not.
  Runtime impact: Callers expecting transitive implementations (e.g., class C implements I, class D extends C) will
  miss indirect implementors.

  --------

  ### Summary Table

   #              │ File            │ Line           │ Severity       │ Bug
  ────────────────┼─────────────────┼────────────────┼────────────────┼───────────────────────────────────────────────
   1              │ bm25.ts         │ 114            │ Medium         │ Division by zero when avgDocLength=0
   2              │ rrf.ts          │ 71             │ Medium         │ 1/0 when weights array is empty
   3              │ semantic.ts     │ 66             │ High           │ No bounds check on stale index → crash
   4              │ qvalue.ts       │ 180-186        │ Medium         │ Non-atomic store mutation in rerank
   5              │ fuzzy-search.ts │ 67-97          │ High           │ Edit distance undercounted for long patterns
   6              │ coordinator.ts  │ 51             │ High           │ Blocklist-based sandbox is bypassable
   7              │ coordinator.ts  │ 319            │ Medium         │ Global regex .test() lastIndex bug
   8              │ session.ts      │ 59-75          │ Medium         │ Stale llmFn in cached sandbox
   9              │ symbol-graph.ts │ 149            │ Low            │ Undefined pushed into Symbol[]
   10             │ symbol-graph.ts │ 125            │ Low            │ implementations() not transitive despite docs

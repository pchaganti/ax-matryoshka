/**
 * Phase 3 cross-document benefit demo.
 *
 * THREE separate logs from a (mock) production incident, each with
 * its own line-numbering and structure. The user wants:
 *
 *   "Did the v1.2.3 deploy correlate with the customer-facing
 *    outage? Cite the deploy line and the outage line."
 *
 * Baseline today: concatenate all three docs into one string, the
 * LLM greps over the concatenation. Two failure modes:
 *   (a) Line numbers from grep are absolute over the concatenation
 *       — they don't tell you which doc the line came from.
 *   (b) Without a per-doc anchor regex, grep matches the same word
 *       across docs without provenance, so the LLM can't reliably
 *       cite "deploy from doc A, outage from doc C."
 *
 * Phase 3 path: load each doc as a separate context, grep each via
 * `(grep "pat" (context N))`, then correlate. Per-doc line numbers
 * mean the LLM can cite "doc 0 line 4" and "doc 2 line 2" with
 * confidence.
 *
 * Pass criteria: the after-run produces a structured result that
 * names the SOURCE doc for each citation. The before-run produces
 * a flat result without per-doc provenance.
 */

import type { Responder } from "../phase1-rlm-query/harness.js";

export const DEPLOY_LOG = [
  "info: 09:55 system idle",
  "info: 09:58 deploy queue length 1",
  "info: 10:00 starting deploy",
  "DEPLOY: v1.2.3 at 10:00",
  "info: 10:01 deploy complete",
].join("\n");

export const ERROR_LOG = [
  "info: 10:01 healthcheck ok",
  "info: 10:03 healthcheck ok",
  "ERROR: 500 at 10:05",
  "ERROR: 500 at 10:06",
  "info: 10:30 healthcheck ok",
].join("\n");

export const COMMS_LOG = [
  "comms: routine status update at 10:00",
  "OUTAGE: 10:05-10:30, root cause unclear",
  "comms: post-mortem scheduled",
].join("\n");

export const ALL_DOCS: string[] = [DEPLOY_LOG, ERROR_LOG, COMMS_LOG];

export const SCENARIO_QUERY =
  "Did the v1.2.3 deploy correlate with the customer-facing outage? Cite both lines.";

/**
 * Concatenated form for the BASELINE single-doc path. We mark each
 * doc with a header so a sufficiently-clever LLM could reconstruct
 * provenance — but the line numbers grep returns are still absolute
 * over the whole blob, so even with headers the citation is awkward.
 */
export const CONCATENATED_DOC = [
  "=== DOC: deploy.log ===",
  DEPLOY_LOG,
  "=== DOC: error.log ===",
  ERROR_LOG,
  "=== DOC: comms.log ===",
  COMMS_LOG,
].join("\n");

/**
 * BASELINE script: parent runs ONE grep over the concatenated doc
 * and tries to extract the deploy and outage from a single result
 * set. Final answer cites grep line numbers as a "best effort."
 */
export const BASELINE_PARENT_SCRIPT: string[] = [
  // First grep matches both DEPLOY and OUTAGE in the same call. The
  // result is a flat list — the LLM has to figure out provenance
  // from the line content, NOT from per-doc structure.
  `(grep "(DEPLOY|OUTAGE)")`,
  // Final answer inlines the matches without per-doc provenance.
  `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`,
];

/**
 * PHASE 3 script: parent runs grep separately against each context
 * via (grep "pat" (context N)). Each result set has per-doc line
 * numbers (lineNum 4 of doc 0, lineNum 2 of doc 2) — the LLM can
 * now cite provenance reliably.
 */
export const PHASE3_PARENT_SCRIPT: string[] = [
  // Grep doc #0 for deploy lines.
  `(grep "DEPLOY" (context 0))`,
  // Grep doc #2 for outage lines.
  `(grep "OUTAGE" (context 2))`,
  // Final answer can reference both per-doc results by binding name.
  `<<<FINAL>>>deploy=FINAL_VAR(_1) outage=FINAL_VAR(_2)<<<END>>>`,
];

/** Both modes use the same scripted parent — no children involved. */
export const NO_CHILD_RESPONDER: Responder = () => "<<<FINAL>>>n/a<<<END>>>";

/** Ground truth: deploy is line 4 of doc 0, outage is line 2 of doc 2. */
export const EXPECTED_DEPLOY_LINE_NUM = 4;
export const EXPECTED_OUTAGE_LINE_NUM = 2;

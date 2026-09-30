// SPDX-License-Identifier: MIT
/** Offline by default. Live mode has a separate key and explicit request/input budgets. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  budgetedEvaluationTransport,
  evaluate,
  evaluationDiff,
  validateFixtures,
  type EvaluationReport,
} from "../src/evaluation.ts";
import { fetchBytes } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { isRecord } from "../src/text.ts";

const argv = process.argv.slice(2);
const allowed = new Set([
  "--live",
  "--max-calls",
  "--max-input-bytes",
  "--fixtures",
  "--baseline",
  "--output",
]);
const parameters = new Map<string, string>();
let live = false;
for (let index = 0; index < argv.length; index++) {
  const name = argv[index]!;
  if (!allowed.has(name)) throw new Error(`Unknown evaluation option: ${name}`);
  if (name === "--live") {
    live = true;
    continue;
  }
  const value = argv[++index];
  if (!value || value.startsWith("--"))
    throw new Error(`Missing value for ${name}`);
  parameters.set(name, value);
}
const fixtures = validateFixtures(
  JSON.parse(
    readFileSync(
      parameters.get("--fixtures") ??
        new URL("../evaluation/fixtures-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);
let requestCalls = () => 0;
let transport: FetchBytes | undefined;
if (live) {
  const maxCalls = Number(parameters.get("--max-calls"));
  const maxInputBytes = Number(parameters.get("--max-input-bytes") ?? 32000);
  if (!process.env.NILAY_EVAL_KEY || !process.env.NILAY_EVAL_MODEL)
    throw new Error(
      "Set isolated NILAY_EVAL_KEY and NILAY_EVAL_MODEL for live evaluation",
    );
  const budget = budgetedEvaluationTransport(
    fetchBytes,
    maxCalls,
    maxInputBytes,
  );
  transport = budget.transport;
  requestCalls = budget.calls;
}
const report = await evaluate(fixtures, {
  mode: live ? "live-model" : "mocked-regression",
  ...(live
    ? {
        key: process.env.NILAY_EVAL_KEY,
        model: process.env.NILAY_EVAL_MODEL,
        transport,
      }
    : {}),
});
const baselinePath =
  parameters.get("--baseline") ??
  new URL("../evaluation/baseline-v1.json", import.meta.url);
const baselineFile: unknown = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineValue =
  isRecord(baselineFile) && isRecord(baselineFile.report)
    ? baselineFile.report
    : baselineFile;
if (
  !isRecord(baselineValue) ||
  baselineValue.reportVersion !== 1 ||
  !Array.isArray(baselineValue.cases) ||
  typeof baselineValue.fixtureHash !== "string" ||
  !["mocked-regression", "live-model"].includes(String(baselineValue.mode))
)
  throw new Error("Invalid versioned evaluation baseline");
const baseline = baselineValue as unknown as EvaluationReport;
const day = new Date().toISOString().slice(0, 10);
const defaultOutput = new URL(
  `../../../.local/${day}-nilay-news-evaluation/report.json`,
  import.meta.url,
).pathname;
const output = resolve(parameters.get("--output") ?? defaultOutput);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      report,
      requestCalls: requestCalls(),
      diff: evaluationDiff(baseline, report),
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  JSON.stringify({
    report: output,
    mode: report.mode,
    requestCalls: requestCalls(),
    humanReviewedCases: report.humanReviewedCases,
    pendingReviewCases: report.pendingReviewCases,
    changedCases: evaluationDiff(baseline, report).changed.map((row) => row.id),
  }) + "\n",
);

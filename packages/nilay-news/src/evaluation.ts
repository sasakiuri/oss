// SPDX-License-Identifier: MIT
/** Isolated evaluation: fixtures and a Jev transport only, never production storage or posting. */
import { isSourceCandidate } from "./candidates.ts";
import type { Article, Analysis } from "./domain.ts";
import {
  Jev,
  relatedCandidates,
  ROUTING_POLICY,
  TOPICS,
  REASONS,
} from "./jev.ts";
import type { FetchBytes } from "./net/types.ts";
import { modelEvidence } from "./news-evidence.ts";
import { isRecord, sha256, utf8 } from "./text.ts";

export interface EvaluationCase {
  id: string;
  humanReview: {
    status: "pending" | "reviewed";
    reviewer: string | null;
    reviewedAt: string | null;
  };
  rationale: string;
  article: Article;
  others: Article[];
  expected: {
    decision: string;
    relation: string | null;
    comparisonArticleId: string | null;
    sourceCandidate: boolean;
  };
  mock: {
    classification: string;
    probability: number;
    relations: Record<string, string>;
  };
}
export interface EvaluationFixtures {
  fixtureVersion: number;
  synthetic: boolean;
  curation: string;
  rubric: string;
  cases: EvaluationCase[];
}
export function validateFixtures(value: unknown): EvaluationFixtures {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.fixtureVersion) ||
    Number(value.fixtureVersion) < 1 ||
    typeof value.synthetic !== "boolean" ||
    typeof value.curation !== "string" ||
    typeof value.rubric !== "string" ||
    !Array.isArray(value.cases) ||
    value.cases.length < 1 ||
    value.cases.length > 100
  )
    throw new Error("Invalid evaluation fixture envelope");
  const ids = new Set<string>();
  for (const fixture of value.cases) {
    if (
      !isRecord(fixture) ||
      typeof fixture.id !== "string" ||
      !fixture.id ||
      ids.has(fixture.id) ||
      !isRecord(fixture.humanReview) ||
      !["pending", "reviewed"].includes(String(fixture.humanReview.status)) ||
      typeof fixture.rationale !== "string" ||
      !isRecord(fixture.article) ||
      typeof fixture.article.title !== "string" ||
      typeof fixture.article.id !== "string" ||
      !Array.isArray(fixture.article.sourceIds) ||
      !Array.isArray(fixture.others) ||
      !isRecord(fixture.expected) ||
      !["candidate", "review", "irrelevant"].includes(
        String(fixture.expected.decision),
      ) ||
      !isRecord(fixture.mock) ||
      !Object.hasOwn(REASONS, String(fixture.mock.classification)) ||
      typeof fixture.mock.probability !== "number" ||
      !Number.isFinite(fixture.mock.probability) ||
      fixture.mock.probability < 0 ||
      fixture.mock.probability > 1 ||
      !isRecord(fixture.mock.relations) ||
      typeof fixture.expected.sourceCandidate !== "boolean" ||
      ![null, "duplicate", "followup", "different", "uncertain"].includes(
        fixture.expected.relation as null | string,
      ) ||
      !(
        fixture.expected.comparisonArticleId === null ||
        typeof fixture.expected.comparisonArticleId === "string"
      ) ||
      fixture.others.some(
        (other: unknown) =>
          !isRecord(other) ||
          typeof other.id !== "string" ||
          typeof other.title !== "string" ||
          !Array.isArray(other.sourceIds),
      ) ||
      Object.values(fixture.mock.relations).some(
        (relation) =>
          !["duplicate", "followup", "different", "uncertain"].includes(
            String(relation),
          ),
      )
    )
      throw new Error("Invalid evaluation case");
    if (
      fixture.humanReview.status === "reviewed" &&
      (typeof fixture.humanReview.reviewer !== "string" ||
        !fixture.humanReview.reviewer.trim() ||
        typeof fixture.humanReview.reviewedAt !== "string" ||
        !Number.isFinite(Date.parse(fixture.humanReview.reviewedAt)))
    )
      throw new Error(
        "Reviewed fixtures require a named human reviewer and date",
      );
    if (
      fixture.humanReview.status === "pending" &&
      (fixture.humanReview.reviewer !== null ||
        fixture.humanReview.reviewedAt !== null)
    )
      throw new Error("Pending fixtures cannot imply human approval");
    const otherIds = new Set(
      fixture.others.map((other: Record<string, unknown>) => other.id),
    );
    if (
      otherIds.size !== fixture.others.length ||
      (fixture.expected.comparisonArticleId !== null &&
        !otherIds.has(fixture.expected.comparisonArticleId)) ||
      Object.keys(fixture.mock.relations).some((id) => !otherIds.has(id))
    )
      throw new Error("Invalid comparison fixture references");
    ids.add(fixture.id);
  }
  return value as unknown as EvaluationFixtures;
}
const choice = (selected: string, options: string[], probability: number) => ({
  type: "choice",
  choice: selected,
  probabilities: Object.fromEntries(
    options.map((name) => [
      name,
      name === selected
        ? probability
        : (1 - probability) / (options.length - 1),
    ]),
  ),
});
export function mockedEvaluationTransport(fixture: EvaluationCase): FetchBytes {
  return async (_url, options) => {
    const input: unknown = JSON.parse(new TextDecoder().decode(options?.body));
    if (
      !isRecord(input) ||
      !isRecord(input.questions) ||
      !isRecord(input.state)
    )
      throw new Error("Invalid evaluation request");
    let answers: object;
    if (input.questions.relation) {
      const previous = input.state.previous_article;
      if (!isRecord(previous)) throw new Error("Missing comparison evidence");
      const other = fixture.others.find(
        (item) =>
          JSON.stringify(modelEvidence(item)) === JSON.stringify(previous),
      );
      const relation =
        (other && fixture.mock.relations[other.id]) || "different";
      answers = {
        relation: choice(
          relation,
          ["duplicate", "followup", "different", "uncertain"],
          0.98,
        ),
      };
    } else
      answers = {
        classification: choice(
          fixture.mock.classification,
          Object.keys(REASONS),
          fixture.mock.probability,
        ),
        topic: choice("鳥獣被害・管理", Object.keys(TOPICS), 0.98),
        priority: choice("1", ["0", "1", "2", "3"], 0.98),
      };
    return {
      data: utf8(JSON.stringify({ model: "jev-fixture-v1", answers })),
      url: _url,
      contentType: "application/json",
    };
  };
}
/** Count every attempted paid request, refusing an oversized request before transport. */
export function budgetedEvaluationTransport(
  transport: FetchBytes,
  maxCalls: number,
  maxInputBytes: number,
) {
  if (
    !Number.isInteger(maxCalls) ||
    maxCalls < 1 ||
    maxCalls > 20 ||
    !Number.isInteger(maxInputBytes) ||
    maxInputBytes < 1000 ||
    maxInputBytes > 32000
  )
    throw new Error(
      "Live evaluation requires --max-calls 1..20 and an input budget of 1000..32000 bytes",
    );
  let calls = 0;
  return {
    calls: () => calls,
    transport: (async (url, options) => {
      if (calls >= maxCalls)
        throw new Error("Live evaluation request budget exhausted");
      if ((options?.body?.byteLength ?? 0) > maxInputBytes)
        throw new Error("Live evaluation input budget exceeded");
      calls++;
      return transport(url, options);
    }) satisfies FetchBytes,
  };
}
export interface EvaluationRow {
  id: string;
  reviewStatus: "pending" | "reviewed";
  expected: EvaluationCase["expected"];
  comparisonIds: string[];
  retrievalHit: boolean | null;
  retrievalFailure: boolean;
  classificationFailure: boolean;
  relationshipFailure: boolean;
  sourceCandidate: boolean;
  sourceRuleFailure: boolean;
  decision: Analysis;
}
export interface EvaluationReport {
  reportVersion: 1;
  fixtureVersion: number;
  fixtureHash: string;
  mode: "mocked-regression" | "live-model";
  comparisonLimit: number;
  humanReviewedCases: number;
  pendingReviewCases: number;
  metrics: ReturnType<typeof metrics>;
  /** Agreement with provisional synthetic labels is a regression signal, never model accuracy. */
  provisionalMetrics: ReturnType<typeof metrics>;
  cases: EvaluationRow[];
}
const ratio = (n: number, d: number) => (d ? n / d : null);
function metrics(rows: EvaluationRow[]) {
  const predicted = rows.filter((row) => row.decision.decision === "candidate");
  const expected = rows.filter((row) => row.expected.decision === "candidate");
  const truePositive = predicted.filter(
    (row) => row.expected.decision === "candidate",
  ).length;
  const comparisons = rows.filter(
    (row) => row.expected.comparisonArticleId !== null,
  );
  const confusion: Record<string, Record<string, number>> = {};
  for (const row of comparisons) {
    const actual = row.decision.relation ?? "different",
      wanted = row.expected.relation ?? "different";
    const bucket = confusion[wanted] ?? {};
    bucket[actual] = (bucket[actual] ?? 0) + 1;
    confusion[wanted] = bucket;
  }
  return {
    cases: rows.length,
    candidatePrecision: ratio(truePositive, predicted.length),
    candidateRecall: ratio(truePositive, expected.length),
    manualReviewRate: ratio(
      rows.filter((row) => row.decision.decision === "review").length,
      rows.length,
    ),
    comparisonRecall: ratio(
      comparisons.filter((row) => row.retrievalHit).length,
      comparisons.length,
    ),
    classificationFailures: rows
      .filter((row) => row.classificationFailure)
      .map((row) => row.id),
    sourceRuleFailures: rows
      .filter((row) => row.sourceRuleFailure)
      .map((row) => row.id),
    retrievalFailures: rows
      .filter((row) => row.retrievalFailure)
      .map((row) => row.id),
    relationshipFailuresAfterRetrieval: rows
      .filter((row) => row.relationshipFailure)
      .map((row) => row.id),
    duplicateFollowupConfusion: confusion,
  };
}
export async function evaluate(
  fixtures: EvaluationFixtures,
  options: {
    mode?: "mocked-regression" | "live-model";
    key?: string;
    model?: string;
    transport?: FetchBytes;
  } = {},
): Promise<EvaluationReport> {
  const mode = options.mode ?? "mocked-regression";
  if (mode === "live-model" && (!options.key || !options.transport))
    throw new Error(
      "Live evaluation requires an isolated key and budgeted transport",
    );
  const cases: EvaluationRow[] = [];
  for (const fixture of fixtures.cases) {
    if (mode === "live-model" && fixture.humanReview.status !== "reviewed")
      continue;
    const comparisonIds = relatedCandidates(
      fixture.article,
      fixture.others,
    ).map((article) => article.id);
    const retrievalHit = fixture.expected.comparisonArticleId
      ? comparisonIds.includes(fixture.expected.comparisonArticleId)
      : null;
    const decision = await new Jev(
      options.key ?? "mock-evaluation-key",
      options.model ?? "jev-evaluation-fixture",
      options.transport ?? mockedEvaluationTransport(fixture),
      mode === "mocked-regression"
        ? () => Date.UTC(2026, 8, 30) / 1000
        : undefined,
    ).analyze(fixture.article, fixtures.rubric, fixture.others);
    cases.push({
      id: fixture.id,
      reviewStatus: fixture.humanReview.status,
      expected: fixture.expected,
      comparisonIds,
      retrievalHit,
      retrievalFailure: retrievalHit === false,
      classificationFailure: decision.decision !== fixture.expected.decision,
      relationshipFailure:
        retrievalHit === true &&
        (decision.relation ?? null) !== fixture.expected.relation,
      sourceCandidate: isSourceCandidate(fixture.article),
      sourceRuleFailure:
        isSourceCandidate(fixture.article) !== fixture.expected.sourceCandidate,
      decision,
    });
  }
  if (mode === "live-model" && !cases.length)
    throw new Error("No human-reviewed evaluation cases are available");
  return {
    reportVersion: 1,
    fixtureVersion: fixtures.fixtureVersion,
    fixtureHash: await sha256(JSON.stringify(fixtures)),
    mode,
    comparisonLimit: ROUTING_POLICY.comparisonLimit,
    humanReviewedCases: cases.filter((row) => row.reviewStatus === "reviewed")
      .length,
    pendingReviewCases: cases.filter((row) => row.reviewStatus === "pending")
      .length,
    metrics: metrics(cases.filter((row) => row.reviewStatus === "reviewed")),
    provisionalMetrics: metrics(cases),
    cases,
  };
}
const comparable = (value: unknown) =>
  JSON.stringify(value, (key, item: unknown) =>
    key === "analyzedAt" ? undefined : item,
  );
export function evaluationDiff(
  before: EvaluationReport,
  after: EvaluationReport,
) {
  if (before.reportVersion !== after.reportVersion)
    throw new Error("Incompatible evaluation report version");
  const previous = new Map(before.cases.map((row) => [row.id, row]));
  const changed = after.cases.flatMap((row) => {
    const earlier = previous.get(row.id);
    return !earlier || comparable(earlier) !== comparable(row)
      ? [{ id: row.id, before: earlier ?? null, after: row }]
      : [];
  });
  const deleted = before.cases
    .filter((row) => !after.cases.some((next) => next.id === row.id))
    .map((row) => row.id);
  return {
    reportVersion: 1,
    configurationChanged:
      before.mode !== after.mode ||
      before.fixtureHash !== after.fixtureHash ||
      comparable(
        before.cases.map((row) => [
          row.decision.provenance,
          row.decision.relationProvenance,
        ]),
      ) !==
        comparable(
          after.cases.map((row) => [
            row.decision.provenance,
            row.decision.relationProvenance,
          ]),
        ),
    changed,
    deleted,
  };
}

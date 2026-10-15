// SPDX-License-Identifier: MIT
/** Validates Jev distributions and applies the conservative routing policy. */
import { UserError } from "../errors.ts";
import { isRecord } from "../text.ts";

import { REASONS } from "./questions.ts";

export const ROUTING_POLICY = {
  classificationThreshold: 0.85,
  relationThreshold: 0.9,
  comparisonLimit: 3,
  comparisonOverlap: 0.2,
  retrievalVersion: "1",
} as const;

/** Routing groups of the classification labels, in tie-break order. */
export const GROUPS = {
  review: ["insufficient"],
  candidate: ["relevant", "policy"],
  irrelevant: ["excluded", "fiction", "unrelated"],
} as const;
/** A conservative routing threshold on the grouped probability, not a measured accuracy. */
const THRESHOLD = ROUTING_POLICY.classificationThreshold;
/** Validate one choice answer; returns the choice and its probability. */
export function choice(
  answers: Record<string, unknown>,
  key: string,
  options: Iterable<string>,
): [string, number] {
  const [value, probabilities] = distribution(answers, key, options);
  return [value, probabilities[value] ?? 0];
}

/** Validate one choice answer; returns the choice and its full, validated distribution. */
export function distribution(
  answers: Record<string, unknown>,
  key: string,
  options: Iterable<string>,
): [string, Record<string, number>] {
  const answer = key in answers ? answers[key] : {};
  const invalid = new UserError(`Jev の判定形式が不正です (${key})`);
  if (!isRecord(answer)) throw invalid;
  const value = answer.choice;
  const probabilities = "probabilities" in answer ? answer.probabilities : {};
  const names = new Set(options);
  if (
    answer.type !== "choice" ||
    typeof value !== "string" ||
    !names.has(value) ||
    !isRecord(probabilities)
  )
    throw invalid;
  const keys = Object.keys(probabilities);
  if (keys.length !== names.size || keys.some((name) => !names.has(name)))
    throw new UserError(`Jev の選択肢が一致しません (${key})`);
  let sum = 0;
  for (const p of Object.values(probabilities)) {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1)
      throw new UserError(`Jev の確率が不正です (${key})`);
    sum += p;
  }
  if (sum < 0.98 || sum > 1.02)
    throw new UserError(`Jev の確率分布が不正です (${key})`);
  return [value, probabilities as Record<string, number>];
}

/** Summed probability of a label group, rounded against float drift. */
function grouped(
  probabilities: Record<string, number>,
  labels: readonly string[],
): number {
  const total = labels.reduce(
    (sum, label) => sum + (probabilities[label] ?? 0),
    0,
  );
  return Math.round(total * 1e6) / 1e6;
}

/** The most probable label of a group; ties keep the group's order. */
function strongest(
  probabilities: Record<string, number>,
  labels: readonly string[],
): string {
  return labels.reduce((best, label) =>
    (probabilities[label] ?? 0) > (probabilities[best] ?? 0) ? label : best,
  );
}

/**
 * Route one validated classification distribution, normalized to a total of 1. An
 * action needs its group at or above the threshold; anything else is reviewed with the
 * most probable group's explanation.
 */
export function route(distribution: Record<string, number>): {
  decision: keyof typeof GROUPS;
  probability: number;
  reason: string;
} {
  const total = Object.values(distribution).reduce((sum, p) => sum + p, 0);
  const probabilities = Object.fromEntries(
    Object.entries(distribution).map(([name, p]) => [name, p / total]),
  );
  const groups = (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map(
    (name) => [name, grouped(probabilities, GROUPS[name])] as const,
  );
  const [top, probability] = groups.reduce((best, group) =>
    group[1] > best[1] ? group : best,
  );
  const label = strongest(probabilities, GROUPS[top]);
  if (top !== "review" && probability >= THRESHOLD)
    return { decision: top, probability, reason: REASONS[label] ?? label };
  return {
    decision: "review",
    probability,
    reason:
      top === "review"
        ? (REASONS[label] ?? label)
        : `判定が割れたため確認：「${REASONS[label] ?? label}」が最有力だが分類確率が基準未満`,
  };
}

export function answersOf(
  raw: unknown,
  message: string,
): Record<string, unknown> {
  if (!isRecord(raw) || !isRecord(raw.answers)) throw new UserError(message);
  return raw.answers;
}

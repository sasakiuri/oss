// SPDX-License-Identifier: MIT
/** Orchestrates classification and relationship checks over sanitized article evidence. */
import { clock as defaultClock } from "../domain.ts";
import type { Analysis, Article, Clock } from "../domain.ts";
import { UserError } from "../errors.ts";
import { fetchBytes } from "../net/http.ts";
import type { FetchBytes } from "../net/types.ts";

import {
  answersOf,
  choice,
  distribution,
  route,
  ROUTING_POLICY,
} from "./decisions.ts";
import { modelEvidence } from "./evidence.ts";
import {
  CLASSIFICATION,
  CLASSIFICATION_QUESTIONS,
  PRIORITY,
  RELATIONS,
  RELATION_QUESTIONS,
  TOPICS,
} from "./questions.ts";
import { relatedCandidates } from "./related.ts";
import { JevTransport } from "./transport.ts";

export class Jev {
  readonly key: string;
  readonly model: string;
  private readonly api: JevTransport;

  constructor(
    key = "",
    model = "jev-latest",
    transport: FetchBytes = fetchBytes,
    clock: Clock = defaultClock,
  ) {
    this.key = key;
    this.model = model;
    this.api = new JevTransport(key, model, transport, clock);
  }

  async analyze(
    article: Article,
    rubric: string,
    others: readonly Article[],
    signal?: AbortSignal,
  ): Promise<Analysis> {
    if (!this.key) throw new UserError("Jev の API キーが未設定です");
    const observation = await this.api.request(
      { selection_criteria: rubric, article: modelEvidence(article) },
      CLASSIFICATION_QUESTIONS,
      signal,
    );
    const answers = answersOf(
      observation.raw,
      "Jev の応答に判定結果がありません",
    );
    const [, probabilities] = distribution(
      answers,
      "classification",
      Object.keys(CLASSIFICATION),
    );
    const [topic] = choice(answers, "topic", Object.keys(TOPICS));
    const [priority] = choice(answers, "priority", Object.keys(PRIORITY));
    const { decision, probability, reason } = route(probabilities);
    const result: Analysis = {
      decision,
      probability,
      topic,
      reason,
      priority: Number(priority),
      analysisStatus: "done",
      analysisError: null,
      relatedArticleId: null,
      relation: null,
      provenance: observation.provenance,
      relationProvenance: [],
    };
    if (decision === "irrelevant") return result;
    return {
      ...result,
      ...(await this.relate(article, rubric, others, signal)),
    };
  }

  async relate(
    article: Article,
    rubric: string,
    others: readonly Article[],
    signal?: AbortSignal,
  ): Promise<
    Pick<Analysis, "relatedArticleId" | "relation" | "relationProvenance">
  > {
    if (!this.key) throw new UserError("Jev の API キーが未設定です");
    const result: Pick<
      Analysis,
      "relatedArticleId" | "relation" | "relationProvenance"
    > = {
      relatedArticleId: null,
      relation: null,
      relationProvenance: [],
    };
    for (const other of relatedCandidates(article, others)) {
      const comparison = { id: other.id, evidence: modelEvidence(other) };
      const observation = await this.api.request(
        {
          selection_criteria: rubric,
          new_article: modelEvidence(article),
          previous_article: comparison.evidence,
        },
        RELATION_QUESTIONS,
        signal,
        comparison,
      );
      const related = answersOf(observation.raw, "Jev の照合結果が不正です");
      result.relationProvenance!.push(observation.provenance);
      const [chosen, p] = choice(related, "relation", Object.keys(RELATIONS));
      const relation =
        p < ROUTING_POLICY.relationThreshold ? "uncertain" : chosen;
      if (relation === "duplicate") {
        // Duplicate detection is an annotation; every article is kept.
        result.relatedArticleId = other.id;
        result.relation = relation;
        break;
      }
      if (
        (relation === "uncertain" && result.relation !== "uncertain") ||
        (relation === "followup" && result.relation === null)
      ) {
        result.relatedArticleId = other.id;
        result.relation = relation;
      }
    }
    return result;
  }
}

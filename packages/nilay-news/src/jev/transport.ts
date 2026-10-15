// SPDX-License-Identifier: MIT
/** Authenticated requests and provenance for the exact serialized model input. */
import type { Clock, DecisionProvenance } from "../domain.ts";
import { UserError } from "../errors.ts";
import { FetchError } from "../net/http.ts";
import type { FetchBytes } from "../net/types.ts";
import { parseUtf8Json, isRecord, sha256, utf8 } from "../text.ts";
import { isoSeconds } from "../time.ts";

import { GROUPS, ROUTING_POLICY } from "./decisions.ts";
import { comparisonInputHash, type ModelEvidence } from "./evidence.ts";
import { DECISION_VERSIONS, type Questions } from "./questions.ts";

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const API_ERRORS: Record<number, string> = {
  401: "Jev の API キーを確認してください",
  403: "Jev API の利用権限を確認してください",
  429: "Jev の利用上限です。時間をおいて再実行してください",
};

export class JevTransport {
  private readonly key: string;
  private readonly model: string;
  private readonly transport: FetchBytes;
  private readonly clock: Clock;

  constructor(key: string, model: string, transport: FetchBytes, clock: Clock) {
    this.key = key;
    this.model = model;
    this.transport = transport;
    this.clock = clock;
  }

  async request(
    state: object,
    questions: Questions,
    signal?: AbortSignal,
    comparison?: { id: string; evidence: ModelEvidence },
  ): Promise<{ raw: unknown; provenance: DecisionProvenance }> {
    signal?.throwIfAborted();
    const input = JSON.stringify({ model: this.model, state, questions });
    let data: Uint8Array;
    try {
      ({ data } = await this.transport(ENDPOINT, {
        body: utf8(input),
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        timeout: 25,
        maxBytes: 1_000_000,
        signal,
      }));
    } catch (error) {
      if (!(error instanceof FetchError)) throw error;
      // Remote error bodies could echo credentials or request data.
      throw new UserError(
        (error.status && API_ERRORS[error.status]) ||
          `Jev API: ${error.message}`,
      );
    }
    signal?.throwIfAborted();
    try {
      const raw: unknown = parseUtf8Json(data);
      const rubric =
        isRecord(state) && typeof state.selection_criteria === "string"
          ? state.selection_criteria
          : "";
      const resolvedModel =
        isRecord(raw) &&
        typeof raw.model === "string" &&
        raw.model.length > 0 &&
        raw.model.length <= 120 &&
        !/[\u0000-\u001f\u007f]/u.test(raw.model)
          ? raw.model
          : null;
      const provenance: DecisionProvenance = {
        requestedModel: this.model,
        resolvedModel,
        promptVersion: questions.relation
          ? DECISION_VERSIONS.relationshipPrompt
          : DECISION_VERSIONS.classificationPrompt,
        criteriaVersion: DECISION_VERSIONS.criteria,
        routingPolicyVersion: DECISION_VERSIONS.routing,
        routingPolicyHash: await sha256(
          JSON.stringify({ ...ROUTING_POLICY, groups: GROUPS }),
        ),
        criteriaHash: await sha256(JSON.stringify(questions)),
        rubricHash: await sha256(rubric),
        modelInputHash: await sha256(input),
        analyzedAt: isoSeconds(this.clock()),
      };
      if (comparison?.id && isRecord(state)) {
        provenance.comparisonArticleId = comparison.id;
        provenance.comparisonInputHash = await comparisonInputHash(
          comparison.evidence,
        );
      }
      return { raw, provenance };
    } catch {
      throw new UserError("Jev が不正な JSON を返しました");
    }
  }
}

// SPDX-License-Identifier: MIT
import {
  correctionSeriesIndex,
  scoreCorrectionDigest as digest,
  type IResultScoreCorrectionSource,
  type ScoreCorrectionBasis,
  type ScoreCorrectionProjection,
} from '@/main/modules/results';

import type {
  IScoreCorrectionRepository,
  IScoreCorrectionTargetSource,
  IScoreCorrectionCaseSource,
  ScoreCorrectionRequest,
  ScoreCorrectionPreview,
  ScoreCorrectionWithdrawal,
} from '../domain/ScoreCorrection';

/** Official corrections are separate from raw results, scoring penalties and firing authorization. */
export class ScoreCorrectionService implements IResultScoreCorrectionSource {
  constructor(
    private readonly repository: IScoreCorrectionRepository,
    private readonly targets: IScoreCorrectionTargetSource,
    private readonly cases: IScoreCorrectionCaseSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  workspace(input: Pick<ScoreCorrectionRequest, 'resultId' | 'resultScope'>) {
    const target = this.targets.resolve(input.resultId, input.resultScope);
    return {
      ...target,
      cases: this.cases.list(target.basis),
      history: this.repository
        .list(target.basis)
        .map((application) => ({ application, withdrawal: this.repository.withdrawal(application.id) })),
      projection: this.project(target.basis),
    };
  }

  preview(request: ScoreCorrectionRequest): ScoreCorrectionPreview {
    requireOfficial(request);
    const { basis, scoring } = this.targets.resolve(request.resultId, request.resultScope);
    if (basis.issues.length) throw new Error(basis.issues.join('; '));
    if (this.repository.list(basis).some((item) => !this.repository.withdrawal(item.id))) {
      throw new Error('Withdraw the active correction before confirming a replacement');
    }
    const caseRevision = this.cases.revision(request.caseId, request.decisionId, basis);
    this.cases.validate?.(request, basis);
    if (!request.changes.length) throw new Error('At least one correction is required');
    const shots = structuredClone([...basis.shots]);
    const indices = new Set<number>();
    for (const change of request.changes) {
      if (!Number.isInteger(change.shotIndex) || !shots[change.shotIndex] || indices.has(change.shotIndex))
        throw new Error('Select distinct existing shot positions');
      indices.add(change.shotIndex);
      if (!change.evidenceReference.trim()) throw new Error('Every correction requires an evidence reference');
      if (
        !Number.isInteger(change.scoreX10) ||
        change.scoreX10 < 0 ||
        change.scoreX10 > (scoring === 'HIT_MISS' ? 10 : 109) ||
        (scoring !== 'DECIMAL' && change.scoreX10 % 10 !== 0)
      )
        throw new Error('The corrected score does not match the event scoring mode');
      if (
        change.decimalScore !== null &&
        (!Number.isFinite(change.decimalScore) ||
          change.decimalScore < 0 ||
          change.decimalScore > 10.9 ||
          Math.abs(change.decimalScore * 10 - Math.round(change.decimalScore * 10)) > 0.000001 ||
          (scoring === 'RING' && Math.floor(change.decimalScore) !== change.scoreX10 / 10) ||
          (scoring === 'DECIMAL' && Math.round(change.decimalScore * 10) !== change.scoreX10))
      )
        throw new Error('Independent decimal evidence conflicts with the corrected score');
      if (scoring === 'HIT_MISS' && (change.innerTen !== null || change.decimalScore !== null))
        throw new Error('Hit/miss result corrections must not invent decimal or inner-ten evidence');
      if (change.innerTen === true && Math.floor(change.scoreX10 / 10) !== 10)
        throw new Error('Only a ten may be classified as an inner ten');
      const replacement = {
        scoreX10: change.scoreX10,
        ranking: {
          shotId: change.sourceShotId,
          ringScore: Math.floor(change.scoreX10 / 10),
          decimalScore: change.decimalScore,
          ...(change.decimalScore !== null ? { decimalScoreSource: 'DEVICE' as const } : {}),
          innerTen: change.innerTen,
          seriesIndex: 0,
        },
      };
      if (change.operation === 'INSERT_MISSING') {
        shots.splice(change.shotIndex, 0, replacement);
        shots.pop();
      } else if (change.operation === 'REPLACE') shots[change.shotIndex] = replacement;
      else throw new Error('Unsupported correction operation');
    }
    const linkedIds = shots.map((shot) => shot.ranking.shotId).filter((id) => id !== null);
    if (new Set(linkedIds).size !== linkedIds.length) throw new Error('A source shot cannot be counted twice');
    const corrected = shots.map((shot, index) => ({
      ...shot,
      ranking: { ...shot.ranking, seriesIndex: correctionSeriesIndex(basis.seriesShotCounts, index) },
    }));
    const content = { request: structuredClone(request), basis, caseRevision, shots: corrected };
    return { ...content, digest: digest(content) };
  }

  apply(input: { id: string; request: ScoreCorrectionRequest; expectedDigest: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error('Explicit confirmation is required');
    return this.repository.transaction(() => {
      const existing = this.repository.find(input.id);
      if (existing) {
        if (existing.digest !== input.expectedDigest || digest(existing.request) !== digest(input.request))
          throw new Error('Correction ID is bound to different evidence');
        return existing;
      }
      const preview = this.preview(input.request);
      if (preview.digest !== input.expectedDigest)
        throw new Error('Source result or Jury evidence changed; preview again');
      const value = { ...preview, id: input.id, recordedAt: this.now().toISOString() };
      this.repository.append(value);
      return value;
    });
  }

  withdraw(input: Omit<ScoreCorrectionWithdrawal, 'recordedAt'>) {
    requireOfficial(input);
    return this.repository.transaction(() => {
      if (!this.repository.find(input.applicationId)) throw new Error('Correction not found');
      const existing = this.repository.withdrawal(input.applicationId);
      if (existing) {
        const { recordedAt: _time, ...saved } = existing;
        if (digest(saved) !== digest(input)) throw new Error('Correction already withdrawn with different evidence');
        return existing;
      }
      const value = { ...input, recordedAt: this.now().toISOString() };
      this.repository.withdraw(value);
      return value;
    });
  }

  project(basis: ScoreCorrectionBasis): ScoreCorrectionProjection {
    const history = this.repository
      .list(basis)
      .map((application) => ({ application, withdrawal: this.repository.withdrawal(application.id) }));
    const active = history.filter((item) => !item.withdrawal).map((item) => item.application);
    const result = {
      shots: basis.shots,
      shotOrigins: basis.shots.map((_, sourceShotIndex) => ({ sourceShotIndex, corrected: false })),
      revision: history.length ? digest(history) : '',
      ids: active.map((item) => item.id),
      remarks: active.map(() => 'Jury score correction applied'),
      issues: [] as string[],
    };
    if (!active.length) return result;
    if (active.length !== 1) return { ...result, issues: ['Conflicting active result corrections require review'] };
    const correction = active[0]!;
    try {
      if (
        digest(correction.basis) !== digest(basis) ||
        this.cases.revision(correction.request.caseId, correction.request.decisionId, basis) !== correction.caseRevision
      ) {
        throw new Error('Source result or Jury evidence changed; withdraw and review the correction');
      }
      // Derive provenance from the persisted instructions without changing their saved format.
      const shotOrigins: { sourceShotIndex: number | null; corrected: boolean }[] = [...result.shotOrigins];
      for (const change of correction.request.changes) {
        const origin = { sourceShotIndex: null, corrected: true };
        if (change.operation === 'INSERT_MISSING') {
          shotOrigins.splice(change.shotIndex, 0, origin);
          shotOrigins.pop();
        } else shotOrigins[change.shotIndex] = origin;
      }
      return { ...result, shots: correction.shots, shotOrigins };
    } catch (error) {
      return { ...result, issues: [error instanceof Error ? error.message : 'Correction evidence is unavailable'] };
    }
  }
}
function requireOfficial(input: { officialName: string; statement: string }) {
  if (!input.officialName.trim() || !input.statement.trim())
    throw new Error('RTS/Jury identity and a statement are required');
}

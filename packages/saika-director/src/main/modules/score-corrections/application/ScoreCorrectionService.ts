// SPDX-License-Identifier: MIT
import {
  correctionSeriesIndex,
  type IResultScoreCorrectionSource,
  type ScoreCorrectionBasis,
  type ScoreCorrectionProjection,
} from '@/main/modules/results';

import {
  applyCorrectionChange,
  correctShots,
  type IScoreCorrectionRepository,
  type IScoreCorrectionTargetSource,
  type IScoreCorrectionCaseSource,
  type ScoreCorrectionRequest,
  type ScoreCorrectionPreview,
  type ScoreCorrectionWithdrawal,
} from '../domain/ScoreCorrection';
import { sha256Json } from '@/main/domain/sha256Json';

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
      history: this.history(target.basis),
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
    const shots = correctShots(basis.shots, request.changes, scoring);
    const corrected = shots.map((shot, index) => ({
      ...shot,
      ranking: { ...shot.ranking, seriesIndex: correctionSeriesIndex(basis.seriesShotCounts, index) },
    }));
    const content = { request: structuredClone(request), basis, caseRevision, shots: corrected };
    return { ...content, digest: sha256Json(content) };
  }

  apply(input: { id: string; request: ScoreCorrectionRequest; expectedDigest: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error('Explicit confirmation is required');
    return this.repository.transaction(() => {
      const existing = this.repository.find(input.id);
      if (existing) {
        if (existing.digest !== input.expectedDigest || sha256Json(existing.request) !== sha256Json(input.request))
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
        if (sha256Json(saved) !== sha256Json(input))
          throw new Error('Correction already withdrawn with different evidence');
        return existing;
      }
      const value = { ...input, recordedAt: this.now().toISOString() };
      this.repository.withdraw(value);
      return value;
    });
  }

  private history(basis: ScoreCorrectionBasis) {
    return this.repository
      .list(basis)
      .map((application) => ({ application, withdrawal: this.repository.withdrawal(application.id) }));
  }

  project(basis: ScoreCorrectionBasis): ScoreCorrectionProjection {
    const history = this.history(basis);
    const active = history.filter((item) => !item.withdrawal).map((item) => item.application);
    const result = {
      shots: basis.shots,
      shotOrigins: basis.shots.map((_, sourceShotIndex) => ({ sourceShotIndex, corrected: false })),
      revision: history.length ? sha256Json(history) : '',
      ids: active.map((item) => item.id),
      remarks: active.map(() => 'Jury score correction applied'),
      issues: [] as string[],
    };
    if (!active.length) return result;
    if (active.length !== 1) return { ...result, issues: ['Conflicting active result corrections require review'] };
    const correction = active[0]!;
    try {
      if (
        sha256Json(correction.basis) !== sha256Json(basis) ||
        this.cases.revision(correction.request.caseId, correction.request.decisionId, basis) !== correction.caseRevision
      ) {
        throw new Error('Source result or Jury evidence changed; withdraw and review the correction');
      }
      // Derive provenance from the persisted instructions without changing their saved format.
      const shotOrigins: { sourceShotIndex: number | null; corrected: boolean }[] = [...result.shotOrigins];
      for (const change of correction.request.changes) {
        applyCorrectionChange(shotOrigins, change, { sourceShotIndex: null, corrected: true });
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

import { createHash } from 'node:crypto';
import type {
  AddVerificationCheckPayload,
  ApplyEstBackupChecksPayload,
  EstBackupCheckPreviewDto,
  EstBackupCheckReceiptDto,
  ResultVerificationCheckDto,
  ResultVerificationStatusDto,
} from '@/shared/ipc/contracts';
import type { IEstBackupVerificationRepository } from '../domain/IEstBackupVerificationRepository';

/** The bridge can record checks, but has no score mutation or result-list approval capability. */
export interface IBackupResultCheckTarget {
  getStatus(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): Promise<ResultVerificationStatusDto>;
  addCheck(input: AddVerificationCheckPayload): Promise<ResultVerificationCheckDto>;
}

export class EstBackupResultCheckService {
  constructor(
    private readonly runs: Pick<IEstBackupVerificationRepository, 'findByEvent'>,
    private readonly target: IBackupResultCheckTarget,
  ) {}

  async preview(eventId: string, runId: string): Promise<EstBackupCheckPreviewDto> {
    return (await this.prepare(eventId, runId)).preview;
  }

  async apply(input: ApplyEstBackupChecksPayload): Promise<EstBackupCheckReceiptDto> {
    if (!input.manualInterventionsReviewed || !input.statement.trim() || !input.officialName.trim())
      throw new Error('An official must review the source and all manual interventions');
    if (!['TARGET_PRINTOUT', 'INDEPENDENT_MEMORY'].includes(input.evidenceSource))
      throw new Error('Select an EST printout or independent-memory source');
    const { preview, status, run } = await this.prepare(input.eventId, input.runId);
    if (preview.digest !== input.digest) throw new Error('Results or checks changed; reload the preview');
    if (!input.resultIds.length || new Set(input.resultIds).size !== input.resultIds.length)
      throw new Error('Select distinct results from the preview');
    const selected = input.resultIds.map((id) => {
      const item = preview.items.find((value) => value.resultId === id);
      if (!item || item.state === 'BLOCKED') throw new Error(item?.issue ?? 'Result is not part of this comparison');
      return item;
    });
    const items: EstBackupCheckReceiptDto['items'] = [];
    for (const item of selected) {
      const result = status.results.find((value) => value.resultId === item.resultId)!;
      if (item.state === 'ALREADY_VERIFIED') {
        items.push({
          resultId: result.resultId,
          state: 'ALREADY_VERIFIED',
          checkId: result.currentCheck!.id,
          issue: null,
        });
        continue;
      }
      try {
        const check = await this.target.addCheck({
          eventId: input.eventId,
          resultScope: run.resultScope ?? 'QUALIFICATION',
          resultId: result.resultId,
          resultRevision: result.revision,
          expectedPreviousCheckId: result.currentCheck?.id ?? null,
          evidenceSource: input.evidenceSource,
          evidenceReference: `EST_BACKUP:${run.id}`,
          comparisonStatus: 'MATCHED',
          manualInterventionsReviewed: true,
          officialName: input.officialName.trim(),
          note: `Retained comparison: ${run.sourceName} (${run.id}). ${input.statement.trim()}`,
        });
        items.push({ resultId: result.resultId, state: 'CREATED', checkId: check.id, issue: null });
      } catch (error) {
        // Each check is independent. Keep successful writes visible when another result changed during the batch.
        items.push({
          resultId: result.resultId,
          state: 'FAILED',
          checkId: null,
          issue: error instanceof Error ? error.message : 'Verification could not be recorded',
        });
      }
    }
    return { items };
  }

  private async prepare(eventId: string, runId: string) {
    const run = this.runs.findByEvent(eventId).find((value) => value.id === runId && value.eventId === eventId);
    if (
      !run ||
      !run.verified ||
      (run.resultKind !== 'INDIVIDUAL' && !(run.resultScope === 'FINAL' && run.resultKind === 'MIXED_TEAM')) ||
      (run.keyType === 'TEAM_ID') !== (run.resultKind === 'MIXED_TEAM')
    )
      throw new Error('Select a verified individual or Mixed Team Final comparison from this event');
    const official = run.items.filter((item) => item.officialRank !== null);
    if (!official.length) throw new Error('The comparison has no individual results');
    const bindings = official.flatMap((item) => (item.resultBinding ? [item.resultBinding] : []));
    if (
      new Set(bindings.map((item) => item.resultId)).size !== bindings.length ||
      new Set(bindings.map((item) => item.participantId)).size !== bindings.length ||
      new Set(official.map((item) => item.key)).size !== official.length
    )
      throw new Error('Comparison identities are ambiguous; compare the source again');
    const scope = run.resultScope ?? 'QUALIFICATION';
    const status = await this.target.getStatus(eventId, scope);
    if (status.eventId !== eventId || status.resultScope !== scope) throw new Error('Wrong result scope');
    const items: EstBackupCheckPreviewDto['items'] = official.map((item) => {
      const binding = item.resultBinding;
      const candidates = status.results.filter((result) => result.resultId === binding?.resultId);
      const result = candidates.length === 1 ? candidates[0] : undefined;
      let issue: string | null = null;
      if (!binding) issue = 'This older comparison has no result revision; compare the source again';
      else if (
        !result ||
        result.participantId !== binding.participantId ||
        result.revision !== binding.resultRevision ||
        result.rank !== item.officialRank ||
        result.totalScore !== item.officialTotalScore ||
        result.decisionCount !== item.interventionCount
      )
        issue = 'The result changed since comparison; compare the source again';
      else if (item.status !== 'MATCH') issue = 'The retained backup does not match';
      else if (result.status !== 'confirmed' || result.classificationCode !== null || result.projectionIssues.length)
        issue = 'The result must be confirmed with no unresolved scoring issues';
      else if (result.currentCheck && !result.currentCheck.qualifies)
        issue = 'Review the current unsuccessful check in the individual RTS workflow';
      return {
        key: item.key,
        resultId: binding?.resultId ?? null,
        name: item.name,
        rank: item.officialRank!,
        totalScore: item.officialTotalScore!,
        interventionCount: item.interventionCount,
        state: issue ? 'BLOCKED' : result?.currentCheck?.qualifies ? 'ALREADY_VERIFIED' : 'READY',
        issue,
      };
    });
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          run,
          snapshot: status.snapshotRevision,
          items,
          checks: status.results.map((result) => [result.resultId, result.revision, result.currentCheck?.id ?? null]),
        }),
      )
      .digest('hex');
    return { run, status, preview: { eventId, runId, digest, items } };
  }
}

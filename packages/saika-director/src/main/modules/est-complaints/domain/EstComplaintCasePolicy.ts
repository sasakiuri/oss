import type { CreateTargetExaminationCasePayload } from '@/shared/ipc/contracts';

import type { EstComplaintSignalSnapshot } from './IEstComplaintSignalSource';

type ExaminationPlan = Pick<
  CreateTargetExaminationCasePayload,
  'issueKind' | 'summary' | 'details' | 'ruleReferences' | 'shotId'
>;

/** Maps a Lane observation into initial examination facts without making a decision. */
export class EstComplaintCasePolicy {
  plan(snapshot: EstComplaintSignalSnapshot): ExaminationPlan {
    const issue = issuePlan(snapshot);
    const lastShot = snapshot.context.lastShot;
    const details = [
      `Lane signal ${snapshot.signalId}.`,
      `${snapshot.context.phase}, stage ${snapshot.context.stageIndex + 1}, series ${snapshot.context.seriesIndex + 1}, ${snapshot.context.recordedShots} shot(s) recorded.`,
      lastShot
        ? `Latest recorded shot ${lastShot.shotNumberInSeries} (${lastShot.shotId}), fired ${lastShot.firedAt}, received ${lastShot.receivedAt}.`
        : 'No latest recorded shot was available when the complaint was raised.',
      snapshot.context.timedTargetProgramId
        ? `Timed-target program ${snapshot.context.timedTargetProgramId}${
            snapshot.context.exposureIndex === null ? '' : `, exposure ${snapshot.context.exposureIndex + 1}`
          }.`
        : 'No timed-target program was active.',
      snapshot.message ? `Lane observation: ${snapshot.message}` : 'No additional Lane observation was entered.',
    ].join(' ');

    return {
      ...issue,
      details,
      ...(snapshot.issue === 'SHOT_VALUE' && lastShot ? { shotId: lastShot.shotId } : {}),
    };
  }
}

function issuePlan(
  snapshot: EstComplaintSignalSnapshot,
): Pick<ExaminationPlan, 'issueKind' | 'summary' | 'ruleReferences'> {
  switch (snapshot.issue) {
    case 'SHOT_VALUE':
      return snapshot.context.phase === 'SIGHTING'
        ? {
            issueKind: 'SIGHTING_COMPLAINT',
            summary: 'Lane EST complaint: sighting shot value',
            ruleReferences: 'ISSF 6.10.5, 6.10.8, 6.16.5.2',
          }
        : {
            issueKind: 'SCORE_VALUE_PROTEST',
            summary: 'Lane EST complaint: displayed shot value',
            ruleReferences: 'ISSF 6.10.7, 6.10.8, 6.16.5.2',
          };
    case 'SHOT_NOT_REGISTERED':
      return {
        issueKind: 'NO_SHOT_INDICATION',
        summary: 'Lane EST complaint: shot not registered or displayed',
        ruleReferences: 'ISSF 6.10.8, 6.10.9.3',
      };
    case 'TARGET_FAILURE':
      return {
        issueKind: 'SINGLE_TARGET_FAILURE',
        summary: 'Lane EST complaint: target failure',
        ruleReferences: 'ISSF 6.10.8, 6.10.9.2, 6.16.5.2',
      };
    case 'TARGET_MEDIA_ADVANCE':
      return {
        issueKind: 'PAPER_OR_RUBBER_FAILURE',
        summary: 'Lane EST complaint: target media advance',
        ruleReferences: 'ISSF 6.10.6, 6.10.8',
      };
    case 'OTHER':
      return {
        issueKind: 'OTHER',
        summary: 'Lane EST complaint: other target issue',
        ruleReferences: 'ISSF 6.10.8',
      };
  }
}

import type { FinalSeriesIncidentKind, RulePack } from '../RulePack';

import { validatePositiveInteger, validateText } from './primitives';

export function validateFiringWindowReview(pack: RulePack): void {
  const firingWindowReview = pack.capabilities.firingWindowReview;
  if (firingWindowReview) {
    if (firingWindowReview.rules.length === 0) {
      throw new Error('firingWindowReview.rules must not be empty');
    }
    const ruleIds = new Set<string>();
    for (const rule of firingWindowReview.rules) {
      validateText(rule.id, 'firingWindowReview.rules.id');
      validateText(rule.ruleReference, `firingWindowReview rule ${rule.id} ruleReference`);
      validateText(rule.reviewGuidance, `firingWindowReview rule ${rule.id} reviewGuidance`);
      if (ruleIds.has(rule.id)) throw new Error('firingWindowReview.rules must have unique IDs');
      ruleIds.add(rule.id);
    }
  }
}

export function validateFinalSeriesAdjudication(pack: RulePack): void {
  const capability = pack.capabilities.finalSeriesAdjudication;
  if (!capability) return;
  if (pack.round !== 'FINAL') throw new Error('finalSeriesAdjudication is only valid for Finals');
  if (capability.incidents.length === 0) throw new Error('finalSeriesAdjudication.incidents must not be empty');

  const kinds = new Set<FinalSeriesIncidentKind>();
  for (const incident of capability.incidents) {
    if (kinds.has(incident.kind)) throw new Error('finalSeriesAdjudication incidents must have unique kinds');
    kinds.add(incident.kind);
    validateText(incident.label, `finalSeriesAdjudication ${incident.kind} label`);
    validateText(incident.ruleReference, `finalSeriesAdjudication ${incident.kind} ruleReference`);
    if (incident.reviewGuidance.length === 0) {
      throw new Error(`finalSeriesAdjudication ${incident.kind} reviewGuidance must not be empty`);
    }
    incident.reviewGuidance.forEach((item) =>
      validateText(item, `finalSeriesAdjudication ${incident.kind} reviewGuidance`),
    );
    if (incident.minimumConcurringJuryMembers !== undefined) {
      validatePositiveInteger(
        incident.minimumConcurringJuryMembers,
        `finalSeriesAdjudication ${incident.kind} minimumConcurringJuryMembers`,
      );
    }
    if (incident.consequences.length === 0) {
      throw new Error(`finalSeriesAdjudication ${incident.kind} consequences must not be empty`);
    }
    for (const consequence of incident.consequences) {
      if (consequence.action === 'DEDUCT') {
        validatePositiveInteger(consequence.amount, `finalSeriesAdjudication ${incident.kind} deduction`);
        if (pack.capabilities.resultProjection?.displayUnit !== 'HITS') {
          throw new Error(
            `finalSeriesAdjudication ${incident.kind} HIT deduction requires a HIT_MISS result projection`,
          );
        }
      }
    }
  }
}

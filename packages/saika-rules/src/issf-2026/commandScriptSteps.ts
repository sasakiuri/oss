import type { RuleCommandScriptStep } from '../RulePack';

const NO_EFFECT = { type: 'NONE' } as const;

export function step(
  prefix: string,
  suffix: string,
  actor: RuleCommandScriptStep['actor'],
  kind: RuleCommandScriptStep['kind'],
  text: string,
  ruleReference: string,
  timing: RuleCommandScriptStep['timing'],
): RuleCommandScriptStep {
  return { id: `${prefix}.${suffix}`, actor, kind, text, ruleReference, timing, effect: NO_EFFECT };
}

export function withEffect(
  source: RuleCommandScriptStep,
  effect: RuleCommandScriptStep['effect'],
): RuleCommandScriptStep {
  return { ...source, effect };
}

export function checkpoint(
  prefix: string,
  suffix: string,
  afterMatchShot: number,
  text: string,
  ruleReference: string,
): RuleCommandScriptStep {
  return withEffect(step(prefix, suffix, 'OFFICIAL', 'CHECK', text, ruleReference, { mode: 'MANUAL' }), {
    type: 'CHECKPOINT',
    afterMatchShot,
  });
}

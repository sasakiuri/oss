import type {
  CompetitionStartScope,
  CompetitionStartIssue,
  ICompetitionStartReadinessSource,
} from '@/main/shared-infra/operations/CompetitionStartReadiness';

import {
  IssfEstChampionshipInspectionPolicy,
  type IEstChampionshipInspectionPolicy,
} from '../domain/EstChampionshipInspection';
import type { IEstChampionshipInspectionRepository } from '../domain/IEstChampionshipInspectionRepository';
import type {
  EstInspectionStartSettings,
  IEstInspectionStartSettingsRepository,
} from '../domain/IEstInspectionStartSettingsRepository';

/** Associates actual Lane targets with the current inspection ledger without owning competition state. */
export class EstInspectionStartService implements ICompetitionStartReadinessSource {
  constructor(
    private readonly settings: IEstInspectionStartSettingsRepository,
    private readonly inspections: IEstChampionshipInspectionRepository,
    private readonly policy: IEstChampionshipInspectionPolicy = new IssfEstChampionshipInspectionPolicy(),
  ) {}
  getSettings(competitionId: string): EstInspectionStartSettings {
    return (
      this.settings.find(competitionId) ?? { competitionId, championshipId: null, mode: 'ADVISORY', laneTargets: [] }
    );
  }
  saveSettings(settings: EstInspectionStartSettings): EstInspectionStartSettings {
    if (new Set(settings.laneTargets.map((target) => target.laneId)).size !== settings.laneTargets.length)
      throw new Error('Each Lane must have one inspection target binding');
    if (
      new Set(settings.laneTargets.flatMap((target) => target.targetIdentifiers)).size !==
      settings.laneTargets.reduce((count, target) => count + target.targetIdentifiers.length, 0)
    )
      throw new Error('Each physical target must be assigned to one Lane');
    if (settings.championshipId) {
      const plan = this.inspections.findPlans(settings.championshipId).at(-1);
      if (!plan) throw new Error('Create a target inspection plan for this championship first');
      if (
        settings.laneTargets.some(
          (target) =>
            !target.targetIdentifiers.length ||
            target.targetIdentifiers.some((id) => !plan.targetIdentifiers.includes(id)),
        )
      )
        throw new Error('Lane targets must belong to the current championship inspection plan');
    } else if (settings.laneTargets.length) throw new Error('Select a championship before binding Lane targets');
    this.settings.save(settings);
    return this.getSettings(settings.competitionId);
  }
  getStartIssues(scope: CompetitionStartScope): readonly CompetitionStartIssue[] {
    const settings = this.getSettings(scope.competitionId);
    if (settings.mode === 'DISABLED') return [];
    const issue = (code: string, message: string): CompetitionStartIssue => ({
      code,
      message,
      blocking: settings.mode === 'REQUIRED',
    });
    const plan = settings.championshipId ? this.inspections.findPlans(settings.championshipId).at(-1) : undefined;
    if (!plan) return [issue('EST_INSPECTION_PLAN', 'Select a championship with a current EST inspection plan')];
    const assessment = this.policy.assess(plan, this.inspections.findEntries(plan.id));
    const issues: CompetitionStartIssue[] = [];
    if (!assessment.ready)
      issues.push(
        issue(
          'EST_INSPECTION_INCOMPLETE',
          `EST inspection plan ${plan.versionNumber} has pending or failed target checks (${assessment.ruleReference})`,
        ),
      );
    for (const laneId of scope.laneIds) {
      const binding = settings.laneTargets.find((target) => target.laneId === laneId);
      if (
        !binding ||
        !binding.targetIdentifiers.length ||
        binding.targetIdentifiers.some((id) => !plan.targetIdentifiers.includes(id))
      )
        issues.push(issue('EST_TARGET_BINDING', `Bind Lane ${laneId} to a target in the current EST inspection plan`));
    }
    return issues;
  }
}

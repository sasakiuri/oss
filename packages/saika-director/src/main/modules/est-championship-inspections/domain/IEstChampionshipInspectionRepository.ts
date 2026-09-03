import type { EstInspectionEntry, EstInspectionPlan } from './EstChampionshipInspection';

export interface IEstChampionshipInspectionRepository {
  appendPlan(plan: EstInspectionPlan): void;
  appendEntries(entries: readonly EstInspectionEntry[]): void;
  findPlans(championshipId: string): EstInspectionPlan[];
  findPlanById(planId: string): EstInspectionPlan | null;
  findEntries(planId: string): EstInspectionEntry[];
  findEntryById(entryId: string): EstInspectionEntry | null;
}

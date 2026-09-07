export interface EstInspectionStartSettings {
  readonly competitionId: string;
  readonly championshipId: string | null;
  readonly mode: 'DISABLED' | 'ADVISORY' | 'REQUIRED';
  readonly laneTargets: readonly { readonly laneId: string; readonly targetIdentifiers: readonly string[] }[];
}
export interface IEstInspectionStartSettingsRepository {
  find(competitionId: string): EstInspectionStartSettings | null;
  save(settings: EstInspectionStartSettings): void;
}

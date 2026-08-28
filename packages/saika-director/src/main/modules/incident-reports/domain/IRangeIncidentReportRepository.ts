import type { RangeIncidentReport } from './RangeIncidentReport';
import type { RangeIncidentReportEntry } from './RangeIncidentReportEntry';

export interface IRangeIncidentReportRepository {
  appendReport(report: RangeIncidentReport): void;
  findReportById(id: string): RangeIncidentReport | null;
  findReportBySerial(eventId: string, serialNumber: string): RangeIncidentReport | null;
  findReportsByEvent(eventId: string): RangeIncidentReport[];
  appendEntry(entry: RangeIncidentReportEntry): void;
  findEntriesByReportIds(reportIds: readonly string[]): Map<string, RangeIncidentReportEntry[]>;
}

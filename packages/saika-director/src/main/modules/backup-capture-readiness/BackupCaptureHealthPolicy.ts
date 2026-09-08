export interface BackupCaptureHealthFacts {
  readonly runId: string | null;
  readonly state: string;
  readonly sourceId: string | null;
  readonly retainedSourceCheckedAt: string | null;
  readonly error: string | null;
}
export interface BackupCaptureHealth {
  readonly state: 'HEALTHY' | 'STOPPED' | 'ERROR' | 'WAITING' | 'STALE';
  readonly issues: readonly string[];
}
export interface IBackupCaptureHealthPolicy {
  assess(facts: BackupCaptureHealthFacts, maximumAgeMilliseconds: number, now: Date): BackupCaptureHealth;
}

/** Read availability is not a judgment about source independence or completeness of the results. */
export class BackupCaptureHealthPolicy implements IBackupCaptureHealthPolicy {
  assess(facts: BackupCaptureHealthFacts, maximumAgeMilliseconds: number, now: Date): BackupCaptureHealth {
    if (facts.error || facts.state === 'ERROR')
      return { state: 'ERROR', issues: [facts.error ?? 'Backup capture failed'] };
    if (!facts.runId || facts.state === 'STOPPED')
      return { state: 'STOPPED', issues: ['Start or resume backup capture for the selected event'] };
    if (!facts.sourceId || !facts.retainedSourceCheckedAt)
      return { state: 'WAITING', issues: ['No snapshot has been retained and checked by this capture run'] };
    const age = now.getTime() - Date.parse(facts.retainedSourceCheckedAt);
    if (!Number.isFinite(age) || age < 0 || age > maximumAgeMilliseconds)
      return {
        state: 'STALE',
        issues: ['The retained backup snapshot has not been checked within the allowed interval'],
      };
    return { state: 'HEALTHY', issues: [] };
  }
}

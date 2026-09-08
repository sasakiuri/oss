import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estBackupVerificationContract } from '@/shared/ipc/contracts';

import { ColumnMappedEstBackupRecordParser } from './domain/ColumnMappedEstBackupRecordParser';

export const estBackupVerificationModule: ModuleDefinition<
  | 'ipcRouter'
  | 'estBackupVerificationService'
  | 'estBackupRecordImportService'
  | 'estBackupResultCheckService'
  | 'estBackupSourceService'
  | 'estBackupCaptureService'
> = {
  name: 'estBackupVerification',
  deps: [
    'ipcRouter',
    'estBackupVerificationService',
    'estBackupRecordImportService',
    'estBackupResultCheckService',
    'estBackupSourceService',
    'estBackupCaptureService',
  ] as const,
  register({
    ipcRouter,
    estBackupVerificationService: service,
    estBackupRecordImportService: imports,
    estBackupResultCheckService: checks,
    estBackupSourceService: sources,
    estBackupCaptureService: capture,
  }) {
    ipcRouter.register(estBackupVerificationContract, {
      getCapture: async ({ eventId }) => capture.status(eventId),
      startCapture: ({ eventId, intervalMilliseconds, mapping, snapshotMode, resumeOnStartup }) =>
        capture.start(
          eventId,
          intervalMilliseconds,
          mapping ? new ColumnMappedEstBackupRecordParser(mapping) : undefined,
          { snapshotMode, resumeOnStartup },
        ),
      stopCapture: async ({ eventId, runId }) => capture.stop(eventId, runId),
      resumeCapture: ({ eventId }) => capture.resume(eventId),
      forgetCapture: async ({ eventId }) => capture.forgetSaved(eventId),
      checkCapture: ({ eventId, runId }) => capture.check(eventId, runId),
      captureRecords: ({ eventId, mapping }) =>
        imports.importRecords(mapping ? new ColumnMappedEstBackupRecordParser(mapping) : undefined, eventId),
      listSources: async ({ eventId }) => sources.list(eventId),
      getSource: async ({ sourceId }) => sources.get(sourceId),
      previewChecks: ({ eventId, runId }) => checks.preview(eventId, runId),
      applyChecks: (input) => checks.apply(input),
      list: ({ eventId }) => service.list(eventId),
      importRecords: () => imports.importRecords(),
      importDelimitedRecords: (input) => imports.importRecords(new ColumnMappedEstBackupRecordParser(input)),
      verify: (input) => service.verify(input),
    });
    return {
      lifecycle: [
        { name: 'estBackupCapture', start: () => capture.restoreSavedRuns(), stop: async () => capture.dispose() },
      ],
    };
  },
};

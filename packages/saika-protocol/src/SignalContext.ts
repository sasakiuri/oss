// SPDX-License-Identifier: MIT

import { z } from 'zod';

/** Series position captured by the EST complaint and Qualification malfunction signals. */
export const signalContextShape = {
  competitionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  participantId: z.string().min(1),
  participantName: z.string().min(1),
  startNumber: z.string().min(1).nullable(),
  phase: z.enum(['SIGHTING', 'MATCH']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  seriesShotLimit: z.number().int().positive().nullable(),
  recordedShots: z.number().int().nonnegative(),
  timedTargetProgramId: z.string().min(1).nullable(),
  exposureIndex: z.number().int().nonnegative().nullable(),
};

type SignalContext = z.infer<z.ZodObject<typeof signalContextShape>>;

export function refineSignalContext(snapshot: SignalContext, context: z.core.$RefinementCtx<SignalContext>): void {
  if (snapshot.seriesShotLimit !== null && snapshot.recordedShots > snapshot.seriesShotLimit) {
    context.addIssue({
      code: 'custom',
      path: ['recordedShots'],
      message: 'Recorded shots cannot exceed the series shot limit',
    });
  }
  if (snapshot.exposureIndex !== null && !snapshot.timedTargetProgramId) {
    context.addIssue({
      code: 'custom',
      path: ['exposureIndex'],
      message: 'An exposure index requires a timed-target program',
    });
  }
}

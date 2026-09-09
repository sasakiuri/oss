// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CommandAcknowledgementSchema = z.object({
  commandId: z.string().uuid(),
  laneId: z.string().uuid(),
  status: z.enum(['executing', 'done', 'error']),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  warning: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  acknowledgedAt: z.string().datetime(),
});

export const ClockProbeAcknowledgementDataSchema = z.object({
  directorSentAt: z.string().datetime(),
  laneReceivedAt: z.string().datetime(),
  laneSentAt: z.string().datetime(),
});

export type CommandAcknowledgement = z.infer<typeof CommandAcknowledgementSchema>;
export type ClockProbeAcknowledgementData = z.infer<typeof ClockProbeAcknowledgementDataSchema>;

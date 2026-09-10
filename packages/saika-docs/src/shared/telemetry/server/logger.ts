// SPDX-License-Identifier: MIT
import 'server-only';
import { Axiom } from '@axiomhq/js';
import { AxiomJSTransport, ConsoleTransport, Logger } from '@axiomhq/logging';
import { nextJsFormatters } from '@axiomhq/nextjs';
import * as Sentry from '@sentry/nextjs';

import { readServerEnv } from '../../config/env';
import { redact } from '../redact';

const env = readServerEnv();
const transport =
  env.AXIOM_TOKEN && env.AXIOM_DATASET
    ? new AxiomJSTransport({ axiom: new Axiom({ token: env.AXIOM_TOKEN }), dataset: env.AXIOM_DATASET })
    : new ConsoleTransport();
const sink = new Logger({ transports: [transport], formatters: nextJsFormatters });
export const logger = {
  info(message: string, fields: Record<string, unknown> = {}) {
    sink.info(message, redact(fields) as Record<string, unknown>);
  },
  warn(message: string, fields: Record<string, unknown> = {}) {
    sink.warn(message, redact(fields) as Record<string, unknown>);
  },
  error(message: string, error: unknown, fields: Record<string, unknown> = {}) {
    sink.error(message, redact(fields) as Record<string, unknown>);
    Sentry.captureException(error, { extra: redact(fields) as Record<string, unknown> });
  },
  flush() {
    return sink.flush();
  },
};

// SPDX-License-Identifier: MIT
import { z } from 'zod';

const optionalText = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional());
const flag = z
  .enum(['0', '1'])
  .default('0')
  .transform((value) => value === '1');
const ratio = z.preprocess((value) => (value === '' ? undefined : value), z.coerce.number().min(0).max(1).default(0));

export const publicEnvSchema = z
  .object({
    NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:5175'),
    NEXT_PUBLIC_BASE_PATH: z
      .string()
      .default('')
      .refine(
        (value) => value === '' || (/^\/[a-zA-Z0-9/_-]+$/.test(value) && !value.endsWith('/') && !value.includes('//')),
        'Use an absolute path without a trailing slash',
      ),
    NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: ratio,
    NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE: ratio,
    NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE: ratio,
    NEXT_PUBLIC_RELEASE: optionalText,
    NEXT_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
    NEXT_PUBLIC_GTM_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^GTM-[A-Z0-9]+$/)
        .optional(),
    ),
    NEXT_PUBLIC_CLARITY_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[a-zA-Z0-9]+$/)
        .optional(),
    ),
    NEXT_PUBLIC_WEB_VITALS: flag,
    NEXT_PUBLIC_DEV_AXE: flag,
  })
  .superRefine((value, context) => {
    const url = new URL(value.NEXT_PUBLIC_SITE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_SITE_URL'],
        message: 'Use an HTTP(S) site URL without credentials, query or fragment',
      });
    }
    const path = url.pathname.replace(/\/$/, '');
    if (path && path !== value.NEXT_PUBLIC_BASE_PATH)
      context.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_BASE_PATH'], message: 'Must match the site URL path' });
  });

export const serverEnvSchema = z
  .object({
    DOCS_OUTPUT: z.enum(['server', 'export', 'standalone']).default('server'),
    DOCS_SOURCE_REF: z.string().min(1).default('1.x'),
    DOCS_SOFT_BREAKS: flag,
    DOCS_IMAGE_HOSTS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((host) => host.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(/^[a-zA-Z0-9.-]+$/))),
    SENTRY_ORG: optionalText,
    SENTRY_PROJECT: optionalText,
    SENTRY_AUTH_TOKEN: optionalText,
    SENTRY_CSP_REPORT_URI: optionalUrl,
    AXIOM_TOKEN: optionalText,
    AXIOM_DATASET: optionalText,
    API_BASE_URL: optionalUrl,
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalText,
    PREVIEW_AUTH_USER: optionalText,
    PREVIEW_AUTH_PASSWORD: optionalText,
    DOCS_PREVIEW_AUTH: flag,
  })
  .superRefine((value, context) => {
    for (const [left, right] of [
      ['AXIOM_TOKEN', 'AXIOM_DATASET'],
      ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ] as const) {
      if (Boolean(value[left]) !== Boolean(value[right]))
        context.addIssue({ code: 'custom', path: [left], message: `Configure both ${left} and ${right}` });
    }
    if (value.DOCS_PREVIEW_AUTH && (!value.PREVIEW_AUTH_USER || !value.PREVIEW_AUTH_PASSWORD))
      context.addIssue({
        code: 'custom',
        path: ['DOCS_PREVIEW_AUTH'],
        message: 'Preview authentication requires a username and password',
      });
    if (value.DOCS_OUTPUT === 'export' && value.DOCS_PREVIEW_AUTH)
      context.addIssue({
        code: 'custom',
        path: ['DOCS_PREVIEW_AUTH'],
        message: 'Use hosting authentication for a static export',
      });
  });

export function parseEnvironment<T>(schema: z.ZodType<T>, values: Record<string, unknown>): T {
  const result = schema.safeParse(values);
  if (!result.success)
    throw new Error(
      `Environment validation failed: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}

// Next replaces each literal NEXT_PUBLIC reference at build time. Never pass process.env to client code.
export const publicEnv = parseEnvironment(publicEnvSchema, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE,
  NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE,
  NEXT_PUBLIC_RELEASE: process.env.NEXT_PUBLIC_RELEASE,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
  NEXT_PUBLIC_CLARITY_ID: process.env.NEXT_PUBLIC_CLARITY_ID,
  NEXT_PUBLIC_WEB_VITALS: process.env.NEXT_PUBLIC_WEB_VITALS,
  NEXT_PUBLIC_DEV_AXE: process.env.NEXT_PUBLIC_DEV_AXE,
});

export function readServerEnv() {
  return parseEnvironment(serverEnvSchema, process.env);
}

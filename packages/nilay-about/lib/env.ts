import 'server-only';
import { z } from 'zod';

import { assertVapidKeyPair } from '@/lib/server/web-push';

/**
 * Check if running in production mode
 * This is evaluated before schema creation to enable conditional validation
 */
const isProductionEnv = process.env.NODE_ENV === 'production';
// ビルドフェーズかどうかを検出（next build 実行時）
const isBuildingEnv = process.env.NEXT_PHASE === 'phase-production-build';
// Vercel Preview 環境かどうか
const isVercelPreview = process.env.VERCEL_ENV === 'preview';
// 実際のプロダクションランタイムかどうか（ビルド時・Preview時は除外）
const isProductionRuntime = isProductionEnv && !isBuildingEnv && !isVercelPreview;

/**
 * Server-side environment variable schema
 * Validates and types environment variables at runtime
 *
 * NOTE: This module is server-only. For client-side public env access,
 * use process.env.NEXT_PUBLIC_* directly.
 */
const envSchema = z
  .object({
    // External Services
    SLACK_WEBHOOK_URL: z.string().url().optional(),

    // Upstash Redis (for rate limiting)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Web Push (VAPID). Labs notifications need all three; without them they answer 503.
    VAPID_PUBLIC_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/, 'VAPID_PUBLIC_KEY must be an uncompressed P-256 key in base64url')
      .optional(),
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'VAPID_PRIVATE_KEY must be a 32-byte key in base64url')
      .optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)\S+$/, 'VAPID_SUBJECT must be a mailto: or https: URL')
      .optional(),

    // Vercel Cron sends it as a bearer token; scheduled jobs refuse every call without it.
    CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),

    // Security
    // PIIログマスキング用の秘密鍵（HMAC-SHA256で使用）
    // 本番環境ランタイムでは必須（16文字以上）、開発/テスト/ビルド時は任意
    LOG_MASKING_SECRET: isProductionRuntime
      ? z.string().min(16, 'LOG_MASKING_SECRET must be at least 16 characters in production')
      : z.string().min(16).optional(),

    // App
    // 本番環境では必ず NEXT_PUBLIC_SITE_URL を設定してください
    // 未設定の場合、本番ではエラー、開発環境ではローカルホストを使用します
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  })
  .refine(
    (value) =>
      [value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY, value.VAPID_SUBJECT].every((item) => item === undefined) ||
      [value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY, value.VAPID_SUBJECT].every((item) => item !== undefined),
    { message: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together', path: ['VAPID_PUBLIC_KEY'] },
  )
  .superRefine((value, context) => {
    if (!value.VAPID_PUBLIC_KEY || !value.VAPID_PRIVATE_KEY) return;
    try {
      assertVapidKeyPair(value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY);
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['VAPID_PUBLIC_KEY'], message: (error as Error).message });
    }
  });

type Env = z.infer<typeof envSchema>;

/**
 * Get the site URL with Vercel fallback
 *
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (explicitly set)
 * 2. VERCEL_URL (auto-set by Vercel for preview deployments)
 * 3. localhost (development only)
 */
function getSiteUrl(): string {
  // 明示的に設定された URL を優先
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  // Vercel 環境では VERCEL_URL を使用（Preview デプロイ用）
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 開発環境のフォールバック
  if (!isProductionRuntime) {
    return 'http://localhost:3001';
  }

  // 本番環境で URL が見つからない場合はエラー
  throw new Error(
    'NEXT_PUBLIC_SITE_URL is required in production. ' +
      'Please set this environment variable to prevent API calls to wrong environments.',
  );
}

/**
 * Get validated environment variables
 */
function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV || 'development';

  const envVars = {
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    CRON_SECRET: process.env.CRON_SECRET,
    LOG_MASKING_SECRET: process.env.LOG_MASKING_SECRET,
    NEXT_PUBLIC_SITE_URL: getSiteUrl(),
    NODE_ENV: nodeEnv,
  };

  const result = envSchema.safeParse(envVars);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten());
    throw new Error('Invalid environment variables');
  }

  return result.data;
}

export const env = getEnv();

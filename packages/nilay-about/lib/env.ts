import "server-only";
import { z } from "zod";

/**
 * Check if running in production mode
 * This is evaluated before schema creation to enable conditional validation
 */
const isProductionEnv = process.env.NODE_ENV === "production";

/**
 * Server-side environment variable schema
 * Validates and types environment variables at runtime
 *
 * NOTE: This module is server-only. For client-side public env access,
 * use process.env.NEXT_PUBLIC_* directly.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().optional(),

  // External Services
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Upstash Redis (for rate limiting)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Security
  // PIIログマスキング用の秘密鍵（HMAC-SHA256で使用）
  // 本番環境では必須（16文字以上）、開発/テスト環境では任意
  LOG_MASKING_SECRET: isProductionEnv
    ? z.string().min(16, "LOG_MASKING_SECRET must be at least 16 characters in production")
    : z.string().min(16).optional(),

  // App
  // 本番環境では必ず NEXT_PUBLIC_SITE_URL を設定してください
  // 未設定の場合、本番ではエラー、開発環境ではローカルホストを使用します
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

/**
 * Get validated environment variables
 */
function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  // 本番環境では NEXT_PUBLIC_SITE_URL が必須
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (isProduction && !siteUrl) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is required in production. " +
      "Please set this environment variable to prevent API calls to wrong environments."
    );
  }

  const envVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    LOG_MASKING_SECRET: process.env.LOG_MASKING_SECRET,
    // 開発環境ではローカルホストをデフォルトとして使用
    NEXT_PUBLIC_SITE_URL: siteUrl || "http://localhost:3000",
    NODE_ENV: nodeEnv,
  };

  const result = envSchema.safeParse(envVars);

  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten());
    throw new Error("Invalid environment variables");
  }

  return result.data;
}

export const env = getEnv();

// Type-safe access helpers
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

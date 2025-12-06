import { z } from "zod";

/**
 * Environment variable schema
 * Validates and types environment variables at runtime
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().optional(),

  // App
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://about.nilay.jp"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

/**
 * Get validated environment variables
 */
function getEnv(): Env {
  const envVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://about.nilay.jp",
    NODE_ENV: process.env.NODE_ENV || "development",
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

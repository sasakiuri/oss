import { z } from "zod";

/**
 * Environment variable schema
 * Validates and types environment variables at runtime
 */
const envSchema = z.object({
  // Firebase
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),

  // App
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://about.nilay.jp"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

/**
 * Get validated environment variables
 * Falls back to hardcoded values in development for backwards compatibility
 */
function getEnv(): Env {
  // Development fallback values
  const devDefaults = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "REDACTED_FIREBASE_API_KEY",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "nilay-about.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://nilay-about.firebaseio.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "nilay-about",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "nilay-about.appspot.com",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "501712650959",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:501712650959:web:191a29b977cad3f2472dba",
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-C3KJX5WQEM",
    NEXT_PUBLIC_SITE_URL: "https://about.nilay.jp",
    NODE_ENV: process.env.NODE_ENV || "development",
  };

  const envVars = {
    NEXT_PUBLIC_FIREBASE_API_KEY:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY || devDefaults.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || devDefaults.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || devDefaults.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || devDefaults.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || devDefaults.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || devDefaults.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID || devDefaults.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || devDefaults.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL || devDefaults.NEXT_PUBLIC_SITE_URL,
    NODE_ENV: devDefaults.NODE_ENV,
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

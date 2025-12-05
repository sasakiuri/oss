import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { env } from "@/lib/env";

/**
 * Firebase configuration from environment variables
 */
const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

// Singleton instances
let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let analytics: Analytics | undefined;

/**
 * Get or initialize Firebase app instance
 */
export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existingApps = getApps();
    app = existingApps.length === 0 ? initializeApp(firebaseConfig) : existingApps[0];
  }
  return app;
}

/**
 * Get or initialize Firestore instance
 */
export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

/**
 * Get or initialize Firebase Functions instance
 */
export function getFirebaseFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
  }
  return functions;
}

/**
 * Get or initialize Firebase Analytics instance
 * Returns null if not supported or in SSR context
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  // Skip in SSR
  if (typeof window === "undefined") return null;

  const supported = await isSupported();
  if (!supported) return null;

  if (!analytics) {
    analytics = getAnalytics(getFirebaseApp());
  }
  return analytics;
}

// Export config for testing
export { firebaseConfig };

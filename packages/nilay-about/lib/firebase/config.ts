import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getAnalytics, Analytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "REDACTED_FIREBASE_API_KEY",
  authDomain: "nilay-about.firebaseapp.com",
  databaseURL: "https://nilay-about.firebaseio.com",
  projectId: "nilay-about",
  storageBucket: "nilay-about.appspot.com",
  messagingSenderId: "501712650959",
  appId: "1:501712650959:web:191a29b977cad3f2472dba",
  measurementId: "G-C3KJX5WQEM",
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let analytics: Analytics | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
  }
  return functions;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;

  const supported = await isSupported();
  if (!supported) return null;

  if (!analytics) {
    analytics = getAnalytics(getFirebaseApp());
  }
  return analytics;
}

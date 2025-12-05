/**
 * Application-wide constants
 */

// API timing
export const API_STALE_TIME = 5 * 60 * 1000; // 5 minutes
export const API_CACHE_TIME = 10 * 60 * 1000; // 10 minutes

// UI timing
export const TOAST_DURATION = 5000; // 5 seconds
export const DEBOUNCE_DELAY = 300; // 300ms
export const AUTO_PLAY_INTERVAL = 3000; // 3 seconds

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

// Validation limits
export const MAX_TITLE_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_SUMMARY_DISPLAY_LENGTH = 140;

// Routes
export const ROUTES = {
  HOME: "/",
  NEWS: "/news",
  NEWS_DETAIL: (id: string) => `/news/${id}`,
  CONTACT: "/contact",
  LABS: "/labs",
  LABS_GAME_SPECIES: "/labs/game-species-test",
  LABS_HOME_TARGET: "/labs/home-target",
} as const;

// External links
export const EXTERNAL_LINKS = {
  KNOWLEDGE: "https://knowledge.nilay.jp/",
  ECOMMERCE: "https://www.nilay.jp/",
  GUNMAN: "https://gunman.nilay.jp/",
} as const;

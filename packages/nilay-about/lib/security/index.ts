/**
 * Security module exports
 *
 * IMPORTANT: This barrel file only exports server-safe functions.
 * For DOMPurify-based functions, import directly from:
 * - sanitize.ts (server-side with jsdom)
 * - sanitize.client.ts (client-side)
 */

// Server-safe exports (no DOMPurify/jsdom dependency)
export { sanitizeForLogging, sanitizeForSlack } from './sanitize-logging';

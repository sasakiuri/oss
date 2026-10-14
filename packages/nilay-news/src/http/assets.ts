// SPDX-License-Identifier: MIT
/** Public files served by the Worker; index.html is served at the root. */
export const STATIC_ASSET_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/app.js",
  "/styles.css",
]);

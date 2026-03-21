// SPDX-License-Identifier: MIT
import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: ["*.config.{js,mjs,cjs,ts}"],
      project: ["*.{js,mjs,cjs,ts}"],
    },
    "packages/saika-lane": {
      entry: [
        "src/main/main.ts",
        "src/preload/preload.ts",
        "src/renderer/print.tsx",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/eslint-config": {
      project: ["**/*.js"],
    },
    "packages/prettier-config": {
      project: ["**/*.js"],
    },
    "packages/stylelint-config": {
      project: ["**/*.js"],
    },
    "packages/typescript-config": {
      entry: ["*.json"],
      project: ["**/*.json"],
    },
  },
  ignoreBinaries: ["tsc", "vitest", "electron-rebuild"],
  ignoreDependencies: [
    // Workspace package used in root eslint.config.mjs (resolved via npm workspaces)
    "@sasakiuri/eslint-config",
    // Native addon dynamically loaded by serialport at runtime
    "@serialport/bindings-cpp",
    // Stylelint shared configs loaded via "extends", not direct import
    "stylelint-config-recess-order",
    "stylelint-config-standard",
    "stylelint-config-standard-scss",
    // E2E test helper, used in e2e tests outside src/
    "electron-playwright-helpers",
    // ESLint import resolver used in eslint config, not directly imported
    "eslint-import-resolver-typescript",
  ],
  ignoreExportsUsedInFile: true,
  exclude: ["types"],
};

export default config;

// SPDX-License-Identifier: MIT
import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: ["*.config.{js,mjs,cjs,ts}"],
      ignoreDependencies: [
        "stylelint", // Pins the shared config peer; Docs executes the CLI.
        "textlint-rule-*", // Textlint loads rules from configuration.
      ],
      project: ["*.{js,mjs,cjs,ts}"],
    },
    "packages/saika-docs": {
      entry: [
        "src/app/**/{page,route}.server.{ts,tsx}",
        "src/proxy.server.ts",
        "tests/{e2e,offline}/**/*.spec.ts",
        "playwright.*.config.ts",
        "vitest.mutation.config.ts",
        "playwright.config.ts",
        "scripts/**/*.{ts,mjs}",
        "test-runner-jest.config.cjs",
      ],
      // Independent Playwright installations can conflict when evaluated in Knip's process.
      playwright: false,
      // Textlint loads these rule and dictionary modules by configuration, not static imports.
      ignoreDependencies: ["textlint-rule-*", "sudachi-synonyms-dictionary"],
    },
    "packages/saika-lane": {
      entry: [
        "src/main/main.ts",
        "src/preload/preload.ts",
        "src/renderer/print.tsx",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/saika-vista": {
      entry: [
        "src/main/main.ts",
        "src/preload/preload.ts",
        "src/renderer/main.tsx",
        "e2e/**/*.spec.ts",
      ],
      project: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    },
    "packages/saika-director": {
      entry: [
        "src/main/main.ts",
        "src/preload/preload.ts",
        "src/renderer/board.tsx",
      ],
      project: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
      // Preserve upstream compatibility barrels and dormant screens while
      // Director is integrated incrementally. They are intentionally not app
      // entry points yet, so only unused-file reporting is suppressed.
      ignoreFiles: [
        "src/**/index.ts",
        "src/main/modules/lane-control/domain/{CompetitionInfo,StageTransitions}.ts",
        "src/preload/{createBridge,createEventBridge}.ts",
        "src/renderer/presentation/features/competition-control/ScoreboardScreen.tsx",
        "src/renderer/presentation/features/competition-control/components/{LaneCard,ShootoffModal,ShootoffScoreboard,TimerDisplay}.tsx",
        "src/renderer/presentation/features/print/components/PrintContainer.tsx",
        "src/renderer/presentation/features/shared/layout/{Header,ScoreboardGrid}.tsx",
        "src/renderer/presentation/hooks/useLaneControl.ts",
      ],
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
      // The consuming application supplies this TypeScript language service plugin.
      ignoreUnresolved: ["^next$"],
      entry: ["*.json"],
      project: ["**/*.json"],
    },
  },
  // These Director exports are compatibility/test seams retained from the
  // imported application even though the current runtime entry does not call
  // them directly.
  ignoreIssues: {
    // Knip 6 checks re-exported symbols that Knip 5 did not report. These are stable Electron module interfaces.
    "packages/saika-director/src/**/index.ts": ["exports"],
    "packages/saika-lane/src/**/index.ts": ["exports"],
    "packages/saika-director/src/main/infrastructure/logging/Logger.ts": [
      "exports",
    ],
    "packages/saika-director/src/main/composition/createContainer.ts": [
      "exports",
    ],
    "packages/saika-director/src/main/modules/lane-control/infra/InMemoryLaneControlRepository.ts":
      ["exports"],
    "packages/saika-director/src/renderer/presentation/features/shared/common/LaneCard.tsx":
      ["exports"],
    "packages/saika-director/src/shared/constants/protocol.ts": ["exports"],
    "packages/saika-director/src/shared/constants/roundConfig.ts": ["exports"],
    "packages/saika-director/src/shared/logging/LoggerFactory.ts": ["exports"],
  },
  ignoreBinaries: [
    "playwright",
    "weasyprint",
    "pandoc",
    "pdfinfo",
    "pdftotext",
  ],
  ignoreDependencies: [
    // Workspace package used in root eslint.config.mjs (resolved via npm workspaces)
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

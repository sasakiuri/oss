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
      entry: ["*.json"],
      project: ["**/*.json"],
    },
  },
  // These Director exports are compatibility/test seams retained from the
  // imported application even though the current runtime entry does not call
  // them directly.
  ignoreIssues: {
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
  ignoreBinaries: ["tsc", "vitest", "electron-rebuild", "electron-builder"],
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

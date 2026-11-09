// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: { lines: 96, statements: 94, branches: 90, functions: 96 },
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json", "json-summary", "html"],
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/runtime/**"],
        },
      },
      {
        test: {
          name: "runtime",
          environment: "node",
          include: ["tests/runtime/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

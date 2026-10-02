// SPDX-License-Identifier: MIT
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { toolRequire } from "./runtime.mjs";

export async function createWebsiteVitestConfig(root) {
  const require = toolRequire(root, { defaultProfile: "nilay-knowledge" });
  const { default: react } = await import(
    pathToFileURL(require.resolve("@vitejs/plugin-react")).href
  );
  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      maxWorkers: 4,
      setupFiles: ["./vitest.setup.ts"],
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["node_modules", ".next", "dist", "out"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: [
          "app/**/*.{ts,tsx}",
          "components/**/*.{ts,tsx}",
          "lib/**/*.ts",
        ],
        exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/*.config.*"],
      },
    },
    resolve: { alias: { "@": resolve(root) } },
  };
}

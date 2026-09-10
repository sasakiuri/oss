// SPDX-License-Identifier: MIT
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const destination = path.resolve(".tools/docker-context");
const excluded = new Set([
  "node_modules",
  ".next",
  "dist",
  "out",
  ".generated",
  "coverage",
  "storybook-static",
  "test-results",
  "playwright-report",
  ".lighthouse.reports",
  "reports",
  ".git",
  ".local",
  ".local-reference",
  ".agents",
  ".claude",
  "claude",
  ".tools",
  ".tmp",
  "AGENTS.md",
  "AGENTS.local.md",
  "CLAUDE.md",
]);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const rootFiles = (await readdir(".")).filter((file) =>
  /^(package(-lock)?\.json|turbo\.json|\.npmrc|\.dockerignore|.*\.config\.(ts|mjs|cjs|js)|.*\.md|LICENSE)$/.test(
    file,
  ),
);
const packageSources = [];
for (const entry of await readdir("packages", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  // Keep workspace manifests for lockfile resolution, and copy only application build inputs.
  packageSources.push(
    path.join(
      "packages",
      entry.name,
      entry.name === "saika-docs" || entry.name.endsWith("-config")
        ? ""
        : "package.json",
    ),
  );
}
for (const source of [
  ...rootFiles,
  ...packageSources,
  "scripts",
  "docker/docs",
]) {
  await cp(source, path.join(destination, source), {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return (
        !excluded.has(name) &&
        !name.endsWith(".tsbuildinfo") &&
        (!name.startsWith(".env") || name === ".env.example")
      );
    },
  });
}
console.log(destination);

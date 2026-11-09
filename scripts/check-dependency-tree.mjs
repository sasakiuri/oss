#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { dependencyTreeProblems } from "./dependency-tree-problems.mjs";

async function main() {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync("npm", ["ls", "--all", "--json", "--long"], {
    cwd: repositoryRoot,
    // Windows starts npm.cmd only through a shell; the arguments are fixed.
    shell: process.platform === "win32",
    encoding: "utf8",
    env: { ...process.env, npm_config_loglevel: "error" },
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!result.stdout.trim()) {
    throw new Error(
      `npm ls returned no dependency tree.\n${result.stderr.trim()}`,
    );
  }
  const tree = JSON.parse(result.stdout);
  const problems = await dependencyTreeProblems(repositoryRoot, tree);
  if (problems.length) {
    throw new Error(`Inconsistent dependency tree:\n${problems.join("\n")}`);
  }
  if (result.status !== 0 && tree.error?.code !== "ELSPROBLEMS") {
    throw new Error(`npm ls failed.\n${result.stderr.trim()}`);
  }
  console.log(
    "Dependency tree is consistent (optional peer conflicts and extraneous packages ignored).",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

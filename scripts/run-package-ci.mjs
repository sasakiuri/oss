// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readGitWorkspaces } from "./select-ci-packages.mjs";

export function packageCommands(task, names, workspaces) {
  if (!Array.isArray(names) || new Set(names).size !== names.length) {
    throw new Error("Expected a unique package selection.");
  }
  const packages = names.map((name) => {
    const pkg = workspaces.find((item) => item.name === name);
    if (!pkg || name === "@sasakiuri/saika-docs") {
      throw new Error(`Unexpected package in CI selection: ${name}`);
    }
    return pkg;
  });
  if (
    ["build", "typecheck", "lint", "depcruise", "size-limit"].includes(task)
  ) {
    if (!packages.some((pkg) => pkg.scripts?.[task])) return [];
    return [
      ["exec", "--", "turbo", task, ...names.map((name) => `--filter=${name}`)],
    ];
  }
  if (["test", "test:e2e"].includes(task)) {
    return packages.flatMap((pkg) => {
      const script =
        task === "test" && pkg.scripts?.["test:coverage"]
          ? "test:coverage"
          : task;
      return pkg.scripts?.[script]
        ? [["run", script, `--workspace=${pkg.name}`]]
        : [];
    });
  }
  if (task === "knip") {
    return packages.length
      ? [
          [
            "exec",
            "--",
            "knip",
            ...packages.flatMap((pkg) => ["--workspace", pkg.directory]),
          ],
        ]
      : [];
  }
  throw new Error(`Unsupported CI task: ${task}`);
}

export function runCommands(commands, npmCli, execute = spawnSync) {
  if (!npmCli) throw new Error("Run package CI through npm run ci:packages.");
  for (const args of commands) {
    const result = execute(process.execPath, [npmCli, ...args], {
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status || 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packages = JSON.parse(process.env.CI_PACKAGES_JSON);
  const commands = packageCommands(
    process.argv[2],
    packages,
    readGitWorkspaces("HEAD"),
  );
  console.log(`Selected package commands: ${JSON.stringify(commands)}`);
  process.exitCode = runCommands(commands, process.env.npm_execpath);
}

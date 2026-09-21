// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { readGitWorkspaces } from "./select-ci-packages.mjs";

export function packageCommands(
  task,
  names,
  workspaces,
  { includeDocs = false, coverage = true, shard } = {},
) {
  if (!Array.isArray(names) || new Set(names).size !== names.length) {
    throw new Error("Expected a unique package selection.");
  }
  const packages = names.map((name) => {
    const pkg = workspaces.find((item) => item.name === name);
    if (!pkg || (!includeDocs && name === "@sasakiuri/saika-docs")) {
      throw new Error(`Unexpected package in CI selection: ${name}`);
    }
    return pkg;
  });
  if (shard !== undefined) {
    const match = /^(\d+)\/(\d+)$/.exec(shard);
    if (
      task !== "test:e2e" ||
      packages.length !== 1 ||
      !packages[0]?.scripts?.["test:e2e"] ||
      !match ||
      Number(match[1]) < 1 ||
      Number(match[1]) > Number(match[2])
    )
      throw new Error(
        "Expected one E2E package and a valid shard index/total.",
      );
  }
  if (
    ["build", "typecheck", "lint", "depcruise", "size-limit"].includes(task)
  ) {
    if (!packages.some((pkg) => pkg.scripts?.[task])) return [];
    return [
      ["exec", "--", "turbo", task, ...names.map((name) => `--filter=${name}`)],
    ];
  }
  if (["test", "test:e2e", "test:mutation"].includes(task)) {
    return packages.flatMap((pkg) => {
      if (
        task === "test" &&
        !coverage &&
        pkg.scripts?.["test:coverage"] &&
        !pkg.scripts?.test
      )
        throw new Error(`Expected a normal unit test script for ${pkg.name}.`);
      const script =
        task === "test" && coverage && pkg.scripts?.["test:coverage"]
          ? "test:coverage"
          : task;
      return pkg.scripts?.[script]
        ? [
            [
              "run",
              script,
              `--workspace=${pkg.name}`,
              ...(shard ? ["--", `--shard=${shard}`] : []),
            ],
          ]
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

// Local checks must include manifest edits that have not been committed yet.
export function readWorkingWorkspaces(root = process.cwd()) {
  const read = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
  if (
    JSON.stringify(read("package.json").workspaces) !==
    JSON.stringify(["packages/*"])
  ) {
    throw new Error(
      "Package checks must be updated for these workspace patterns.",
    );
  }
  return readdirSync(resolve(root, "packages"))
    .sort()
    .map((name) => `packages/${name}`)
    .filter((directory) => existsSync(resolve(root, directory, "package.json")))
    .map((directory) => ({ ...read(`${directory}/package.json`), directory }));
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
  const { values, positionals } = parseArgs({
    options: {
      all: { type: "boolean", default: false },
      "without-coverage": { type: "boolean", default: false },
      shard: { type: "string" },
    },
    allowPositionals: true,
  });
  if (positionals.length !== 1) throw new Error("Expected one package task.");
  const workspaces = values.all
    ? readWorkingWorkspaces()
    : readGitWorkspaces("HEAD");
  const packages = values.all
    ? workspaces.map((pkg) => pkg.name)
    : JSON.parse(process.env.CI_PACKAGES_JSON);
  const commands = packageCommands(positionals[0], packages, workspaces, {
    includeDocs: values.all,
    coverage: !values["without-coverage"],
    shard: values.shard,
  });
  if (values.all && positionals[0] === "test") {
    // Bound local coverage workers so startup imports do not contend across every CPU.
    process.env.VITEST_MAX_WORKERS ??= "2";
  }
  console.log(`Selected package commands: ${JSON.stringify(commands)}`);
  process.exitCode = runCommands(commands, process.env.npm_execpath);
}

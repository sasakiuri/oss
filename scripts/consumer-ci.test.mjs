// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const workflow = yaml.load(
  readFileSync(
    new URL("../.github/workflows/consumer-ci.yml", import.meta.url),
    "utf8",
  ),
);
const steps = workflow.jobs.quality.steps;
const install = steps.find((step) => step.name === "Install upstream tools");

test("upstream cache is scoped to the complete runtime and lockfile", () => {
  const cache = steps.find((step) => step.id === "upstream-cache");
  assert.equal(
    cache.uses,
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
  );
  assert.equal(
    cache.with.key,
    "consumer-ci-tools-${{ runner.os }}-${{ runner.arch }}-node-${{ steps.runtime.outputs.node }}-npm-${{ steps.runtime.outputs.npm }}-${{ hashFiles('oss/package-lock.json') }}",
  );
  assert.deepEqual(cache.with.path.trim().split("\n"), [
    "oss/node_modules",
    "oss/packages/*/node_modules",
  ]);
  assert.equal(cache.with["restore-keys"], undefined);
  assert.equal(
    install.env.CACHE_HIT,
    "${{ steps.upstream-cache.outputs.cache-hit }}",
  );
  assert.ok(steps.indexOf(cache) < steps.indexOf(install));
  assert.equal(
    steps.find((step) => step.uses?.startsWith("actions/setup-node@")).with
      .cache,
    undefined,
  );
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const step of steps) assert.ok(!step.run?.includes("${{"));
});

for (const [name, hit, lock, cliStatus, installs] of [
  ["exact hit", "true", true, 0, false],
  ["miss", "", false, 0, true],
  ["non-exact hit", "false", true, 0, true],
  ["missing hidden lockfile", "true", false, 0, true],
  ["broken CLI", "true", true, 1, true],
]) {
  test(`upstream install handles ${name}`, (t) => {
    const scratch = fileURLToPath(
      new URL("../.local/ci-opt/", import.meta.url),
    );
    mkdirSync(scratch, { recursive: true });
    const root = mkdtempSync(join(scratch, "consumer-ci-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "bin"));
    mkdirSync(join(root, "node_modules"));
    if (lock)
      writeFileSync(join(root, "node_modules/.package-lock.json"), "{}");
    writeFileSync(
      join(root, "bin/node"),
      '#!/bin/bash\nprintf "node %s\\n" "$*" >> "$CALLS"\nexit "$CLI_STATUS"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(root, "bin/npm"),
      '#!/bin/bash\nprintf "npm %s\\n" "$*" >> "$CALLS"\nexit "${INSTALL_STATUS:-0}"\n',
      { mode: 0o755 },
    );
    const calls = join(root, "calls");
    writeFileSync(calls, "");
    const env = {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      CACHE_HIT: hit,
      CALLS: calls,
      CLI_STATUS: String(cliStatus),
    };
    const run = (extra = {}) =>
      spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", install.run],
        {
          cwd: root,
          env: { ...env, ...extra },
          encoding: "utf8",
        },
      );
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const expected = [
      ...(hit === "true" && lock
        ? ["node packages/repo-tooling/cli.mjs run eslint --version"]
        : []),
      ...(installs ? ["npm ci --ignore-scripts"] : []),
    ];
    assert.deepEqual(readFileSync(calls, "utf8").trim().split("\n"), expected);
    if (installs) assert.equal(run({ INSTALL_STATUS: "42" }).status, 42);
  });
}

test("PR history and all consumer quality gates remain enabled", () => {
  assert.equal(
    steps[0].with["fetch-depth"],
    "${{ github.event_name == 'pull_request' && '0' || '1' }}",
  );
  for (const name of [
    "Validate pull request title",
    "Changed executable line coverage",
  ])
    assert.equal(
      steps.find((step) => step.name === name).if,
      "github.event_name == 'pull_request'",
    );
  for (const [name, run] of [
    ["Infrastructure lint", "npm run lint:infra"],
    ["Quality assurance", "npm run qa"],
  ]) {
    const step = steps.find((step) => step.name === name);
    assert.equal(step.run, run);
    assert.equal(step.if, undefined);
  }
});

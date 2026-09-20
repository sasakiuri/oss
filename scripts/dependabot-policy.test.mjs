// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import yaml from "js-yaml";

const workflow = yaml.load(
  readFileSync(
    new URL("../.github/workflows/dependabot-auto-merge.yml", import.meta.url),
    "utf8",
  ),
);
const policy = workflow.jobs.dependabot.steps.find(
  (step) => step.id === "policy",
).run;

test("auto-merge accepts only supported ecosystems, groups and compatible updates", () => {
  const directory = mkdtempSync(join(tmpdir(), "oss-dependabot-"));
  try {
    // fetch-metadata calls the npm ecosystem npm_and_yarn, unlike dependabot.yml.
    const eligible = new Set([
      "npm_and_yarn:npm-development",
      "npm_and_yarn:security-dev-safe",
      "github_actions:actions-compatible",
    ]);
    for (const ecosystem of [
      "npm_and_yarn",
      "github_actions",
      "npm",
      "docker",
      "",
    ]) {
      for (const group of [
        "npm-development",
        "security-dev-safe",
        "npm-production",
        "security-prod-safe",
        "major-updates",
        "actions-compatible",
        "",
      ]) {
        for (const update of [
          "semver-patch",
          "semver-minor",
          "semver-major",
          "",
        ]) {
          const output = join(directory, "output");
          rmSync(output, { force: true });
          const result = spawnSync("bash", ["-euo", "pipefail", "-c", policy], {
            env: {
              ...process.env,
              GROUP: group,
              ECOSYSTEM: ecosystem,
              UPDATE_TYPE: update ? `version-update:${update}` : "",
              GITHUB_OUTPUT: output,
            },
            encoding: "utf8",
          });
          assert.equal(result.status, 0, result.stderr);
          const expected =
            eligible.has(`${ecosystem}:${group}`) &&
            ["semver-minor", "semver-patch"].includes(update);
          assert.equal(
            readFileSync(output, "utf8").trim(),
            `auto-merge=${expected}`,
            `${ecosystem}/${group}/${update}`,
          );
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the npm lockfile has one update policy and eligible groups exclude production and majors", () => {
  const configuration = yaml.load(
    readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"),
  );
  const npm = configuration.updates.filter(
    (update) => update["package-ecosystem"] === "npm",
  );
  assert.equal(npm.length, 1);
  assert.equal(npm[0].directory, "/");
  for (const name of ["npm-development", "security-dev-safe"]) {
    assert.equal(npm[0].groups[name]["dependency-type"], "development");
    assert.deepEqual([...npm[0].groups[name]["update-types"]].sort(), [
      "minor",
      "patch",
    ]);
  }
  assert.equal(
    npm[0].groups["security-dev-safe"]["applies-to"],
    "security-updates",
  );
  for (const update of configuration.updates)
    assert.equal(update.cooldown["default-days"], 7);
});

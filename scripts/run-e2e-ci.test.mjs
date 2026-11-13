// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";

import {
  platformRunners,
  readGitWorkspaces,
  selectCiPackages,
} from "./select-ci-packages.mjs";

const runner = new URL("./run-e2e-ci.sh", import.meta.url).pathname;
const ci = yaml.load(
  readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
);

test("the workflow runs every selected suite and uploads each original report identity", () => {
  const job = ci.jobs.e2e;
  assert.equal(job["timeout-minutes"], "${{ matrix.timeoutMinutes }}");
  assert.deepEqual(job.env, {
    CI_E2E_SUITES_JSON: "${{ toJSON(matrix.suites) }}",
  });
  assert.equal(job.strategy["fail-fast"], false);
  assert.equal(
    job.steps.filter((step) => step.uses === "./.github/actions/setup-node")
      .length,
    1,
  );
  assert.equal(
    job.steps.filter((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    ).length,
    1,
  );
  const runs = job.steps.filter((step) => step.name?.startsWith("E2E tests"));
  assert.deepEqual(
    runs.map((step) => [step.if, step.run]),
    [
      ["runner.os == 'Linux'", "xvfb-run -a bash scripts/run-e2e-ci.sh"],
      ["runner.os != 'Linux'", "bash scripts/run-e2e-ci.sh"],
    ],
  );
  const uploads = job.steps.filter((step) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  const plan = selectCiPackages(["package.json"], readGitWorkspaces("HEAD"));
  assert.equal(
    plan.e2eMatrix.filter((row) => row.electron).length,
    platformRunners.length,
  );
  for (const row of plan.e2eMatrix) {
    assert.ok(row.suites.length <= uploads.length);
    row.suites.forEach((_, index) => {
      const upload = uploads[index];
      assert.equal(
        upload.if,
        `always() && matrix.suites[${index}].package != ''`,
      );
      assert.equal(
        upload.with.name,
        `playwright-\${{ matrix.suites[${index}].suite }}-\${{ matrix.os }}`,
      );
      assert.equal(
        upload.with.path,
        `\${{ matrix.suites[${index}].directory }}/playwright-report/\n\${{ matrix.suites[${index}].directory }}/test-results/\n`,
      );
    });
  }
  assert.equal(
    ci.jobs.report.steps.find((step) => step.name === "Playwright test report")
      .with.name,
    "Playwright ($2, suite $1)",
  );
});

test("the actual Bash runner continues after failures and reports all failed packages", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "e2e-ci-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    path.join(cwd, "npm"),
    `#!/usr/bin/env bash
set -eu
printf '%s %s\\n' "$CI_PACKAGES_JSON" "$*" >> "$CALLS_FILE"
[[ $CI_PACKAGES_JSON != *fail* ]]
`,
    { mode: 0o755 },
  );
  const run = (packages) => {
    writeFileSync(path.join(cwd, "calls"), "");
    writeFileSync(path.join(cwd, "summary"), "");
    return spawnSync("bash", ["-e", "-o", "pipefail", runner], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${cwd}:${process.env.PATH}`,
        CALLS_FILE: path.join(cwd, "calls"),
        GITHUB_STEP_SUMMARY: path.join(cwd, "summary"),
        CI_E2E_SUITES_JSON: JSON.stringify(
          packages.map((pkg, index) => ({
            package: pkg,
            shard: index + 1,
            shards: 3,
          })),
        ),
      },
    });
  };
  const failed = run(["fail-first", "pass-middle", "fail-last"]);
  assert.equal(failed.status, 1, failed.stderr);
  assert.deepEqual(
    readFileSync(path.join(cwd, "calls"), "utf8").trim().split("\n"),
    [
      '["fail-first"] run ci:packages -- test:e2e --shard 1/3',
      '["pass-middle"] run ci:packages -- test:e2e --shard 2/3',
      '["fail-last"] run ci:packages -- test:e2e --shard 3/3',
    ],
  );
  assert.match(failed.stderr, /E2E failed: fail-first \(1\/3\)/);
  assert.match(failed.stderr, /E2E failed: fail-last \(3\/3\)/);
  assert.equal(
    readFileSync(path.join(cwd, "summary"), "utf8"),
    "- E2E failed: fail-first (1/3)\n- E2E failed: fail-last (3/3)\n",
  );
  assert.equal(run(["pass-first", "pass-second"]).status, 0);
  assert.notEqual(run([]).status, 0);
  assert.equal(readFileSync(path.join(cwd, "calls"), "utf8"), "");
});

function crlfFixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "e2e-crlf-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const jq = spawnSync("bash", ["-c", "command -v jq"], { encoding: "utf8" });
  assert.equal(jq.status, 0, jq.stderr);
  writeFileSync(
    path.join(cwd, "jq"),
    `#!/usr/bin/env bash
set -euo pipefail
"$REAL_JQ" "$@" | while IFS= read -r line; do printf '%s\\r\\n' "$line"; done
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(cwd, "npm"),
    `#!/usr/bin/env bash
exec "$TEST_NODE" "$VALIDATOR_FILE" "$@"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(cwd, "validate.mjs"),
    `import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { packageCommands } from ${JSON.stringify(new URL("./run-package-ci.mjs", import.meta.url).href)};
const commands = packageCommands("test:e2e", JSON.parse(process.env.CI_PACKAGES_JSON), [
  { name: "@sasakiuri/saika-lane", scripts: { "test:e2e": "playwright test" } },
], { shard: process.argv.at(-1) });
assert.doesNotMatch(process.env.CI_PACKAGES_JSON, /\\r/);
appendFileSync(process.env.VALIDATED_FILE, JSON.stringify(commands) + "\\n");
`,
  );
  const validated = path.join(cwd, "validated");
  return {
    validated,
    run(plan) {
      writeFileSync(validated, "");
      return spawnSync("bash", [runner], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${cwd}:${process.env.PATH}`,
          REAL_JQ: jq.stdout.trim(),
          TEST_NODE: process.execPath,
          VALIDATOR_FILE: path.join(cwd, "validate.mjs"),
          VALIDATED_FILE: validated,
          GITHUB_STEP_SUMMARY: path.join(cwd, "summary"),
          CI_E2E_SUITES_JSON: plan,
        },
      });
    },
  };
}

test("CRLF jq output reaches the real packageCommands shard validation without CR", (t) => {
  const fixture = crlfFixture(t);
  const result = fixture.run(
    JSON.stringify([
      { package: "@sasakiuri/saika-lane", shard: 1, shards: 2 },
      { package: "@sasakiuri/saika-lane", shard: 2, shards: 2 },
    ]),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\r/);
  assert.deepEqual(
    readFileSync(fixture.validated, "utf8").trim().split("\n").map(JSON.parse),
    [
      [
        [
          "run",
          "test:e2e",
          "--workspace=@sasakiuri/saika-lane",
          "--",
          "--shard=1/2",
        ],
      ],
      [
        [
          "run",
          "test:e2e",
          "--workspace=@sasakiuri/saika-lane",
          "--",
          "--shard=2/2",
        ],
      ],
    ],
  );
});

test("invalid plans cannot pass even when jq emits CRLF", (t) => {
  const fixture = crlfFixture(t);
  for (const [label, plan, error] of [
    ["missing package", '[{"shard":1,"shards":1}]'],
    [
      "invalid shard",
      '[{"package":"@sasakiuri/saika-lane","shard":2,"shards":1}]',
      /valid shard/,
    ],
    [
      "missing shard",
      '[{"package":"@sasakiuri/saika-lane","shards":1}]',
      /valid shard/,
    ],
    ["invalid JSON", '[{"package":'],
  ]) {
    const result = fixture.run(plan);
    assert.notEqual(result.status, 0, label);
    assert.equal(readFileSync(fixture.validated, "utf8"), "", label);
    if (error) assert.match(result.stderr, error, label);
  }
});

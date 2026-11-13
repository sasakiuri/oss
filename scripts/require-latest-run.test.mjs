// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { requireLatestRun } from "./require-latest-run.mjs";

const createdAt = "2026-11-13T00:00:00Z";
const environment = {
  GH_TOKEN: "test-token",
  LATEST_RUN_REPOSITORY: "sasakiuri/oss",
  LATEST_RUN_WORKFLOW_REF:
    "sasakiuri/oss/.github/workflows/news-deployment.yml@refs/heads/1.x",
  LATEST_RUN_BRANCH: "1.x",
  LATEST_RUN_NUMBER: "10",
  LATEST_RUN_ID: "1000",
};
const run = (run_number, conclusion = null) => ({
  id: run_number * 100,
  run_number,
  conclusion,
  created_at: createdAt,
});
const currentRun = (env = environment) => ({
  ...run(Number(env.LATEST_RUN_NUMBER)),
  id: Number(env.LATEST_RUN_ID),
  head_branch: env.LATEST_RUN_BRANCH,
});
function api(pages, current = currentRun()) {
  const calls = [];
  return {
    calls,
    execute(command, args, options) {
      calls.push({ command, args, options });
      const url = new URL(args.at(-1), "https://api.github.com/");
      const isCurrent = /\/actions\/runs\/\d+$/.test(url.pathname);
      const page = Number(url.searchParams.get("page"));
      const response = isCurrent ? current : pages[page - 1];
      if (response instanceof Error) throw response;
      assert.notEqual(response, undefined, `Unexpected API request ${url}`);
      if (typeof response === "string") return response;
      return JSON.stringify(
        !isCurrent && Array.isArray(response)
          ? {
              total_count: pages.reduce(
                (count, runs) =>
                  count + (Array.isArray(runs) ? runs.length : 1),
                0,
              ),
              workflow_runs: response,
            }
          : response,
      );
    },
  };
}
const check = (pages, env = environment) =>
  requireLatestRun({ env, execute: api(pages, currentRun(env)).execute });

test("no newer run permits the body, including a retry of the current run", () => {
  assert.equal(check([[run(10), run(9, "success")]]), true);
  assert.equal(check([[{ ...run(10), run_attempt: 4 }, run(9)]]), true);
});

test("every newer run prevents changes regardless of status or conclusion", () => {
  for (const [status, conclusion] of [
    ["waiting", null],
    ["in_progress", null],
    ["queued", null],
    ["completed", "success"],
    ["completed", "failure"],
    ["completed", "timed_out"],
    ["completed", "cancelled"],
    ["completed", "skipped"],
  ])
    assert.throws(
      () => check([[{ ...run(11, conclusion), status }, run(10)]]),
      /newer run #11.*rerun the newer run.*start a new run/i,
      `${status}/${conclusion}`,
    );
});

test("an older retry cannot replace a newer deployment later marked cancelled", () => {
  const appliedThenCancelled = { ...run(11, "cancelled"), status: "completed" };
  for (const attempt of [2, 4])
    assert.throws(
      () =>
        check([[appliedThenCancelled, { ...run(10), run_attempt: attempt }]]),
      /newer run #11/i,
    );
});

test("same-second runs with older numbers are ignored", () => {
  assert.equal(check([[run(9, "cancelled"), run(10)]]), true);
});

test("all pages are read even when the current run is on the first page", () => {
  const env = {
    ...environment,
    LATEST_RUN_NUMBER: "200",
    LATEST_RUN_ID: "20000",
  };
  const first = [
    run(200),
    ...Array.from({ length: 99 }, (_, index) => run(index + 1)),
  ];
  assert.throws(
    () => check([first, [run(201, "cancelled")]], env),
    /newer run #201/i,
  );
  assert.equal(check([first, [run(100)]], env), true);
});

test("API errors in current-run lookup or either list page fail closed", () => {
  const failure = new Error("token and response details must stay private");
  assert.throws(
    () =>
      requireLatestRun({ env: environment, execute: api([], failure).execute }),
    {
      message:
        "Unable to verify the latest workflow run: GitHub API request failed.",
    },
  );
  const env = {
    ...environment,
    LATEST_RUN_NUMBER: "200",
    LATEST_RUN_ID: "20000",
  };
  for (const pages of [
    [failure],
    [Array.from({ length: 100 }, (_, index) => run(index + 1)), failure],
  ])
    assert.throws(() => check(pages, env), {
      message:
        "Unable to verify the latest workflow run: GitHub API request failed.",
    });
});

test("invalid current identity, creation time or JSON cannot authorize changes", () => {
  for (const current of [
    "invalid JSON",
    null,
    {},
    { ...currentRun(), id: 900 },
    { ...currentRun(), run_number: 9 },
    { ...currentRun(), head_branch: "other" },
    { ...currentRun(), created_at: undefined },
    { ...currentRun(), created_at: "not-a-date" },
    { ...currentRun(), created_at: "2026-02-30T00:00:00Z" },
  ])
    assert.throws(() =>
      requireLatestRun({
        env: environment,
        execute: api([[run(10)]], current).execute,
      }),
    );
});

test("malformed, incomplete and missing-current list responses fail closed", () => {
  for (const runs of [
    [],
    [run(9)],
    [{ ...run(10), id: null }],
    [{ ...run(10), run_number: "10" }],
    [{ ...run(10), conclusion: undefined }],
    [{ ...run(10), conclusion: 42 }],
    [{ ...run(10), id: 999 }],
  ])
    assert.throws(() => check([runs]));
  for (const response of [
    "invalid JSON",
    "null",
    "{}",
    '{"workflow_runs":null}',
    { total_count: 2, workflow_runs: [run(10)] },
    { total_count: "1", workflow_runs: [run(10)] },
  ])
    assert.throws(() => check([response]));
});

test("unreadable filtered histories are rejected within a bounded search", () => {
  assert.throws(
    () => check([{ total_count: 1001, workflow_runs: [run(10)] }]),
    /search limit/i,
  );
  const env = {
    ...environment,
    LATEST_RUN_NUMBER: "200",
    LATEST_RUN_ID: "20000",
  };
  assert.throws(
    () =>
      check(
        [
          {
            total_count: 101,
            workflow_runs: Array.from({ length: 100 }, (_, index) =>
              run(index + 1),
            ),
          },
          { total_count: 101, workflow_runs: [] },
        ],
        env,
      ),
    /complete filtered workflow run history/i,
  );
});

test("changing totals and duplicate rows cannot disguise incomplete pagination", () => {
  const env = {
    ...environment,
    LATEST_RUN_NUMBER: "200",
    LATEST_RUN_ID: "20000",
  };
  const first = [
    run(200),
    ...Array.from({ length: 99 }, (_, index) => run(index + 1)),
  ];
  assert.throws(
    () =>
      check(
        [
          { total_count: 101, workflow_runs: first },
          { total_count: 100, workflow_runs: [run(100)] },
        ],
        env,
      ),
    /changed during verification/i,
  );
  assert.throws(
    () => check([first, [run(200)]], env),
    /duplicate workflow runs/i,
  );
});

test("GET requests scope creation time, branch and workflow independently of old history", () => {
  const env = {
    ...environment,
    LATEST_RUN_NUMBER: "5000",
    LATEST_RUN_ID: "500000",
    LATEST_RUN_BRANCH: "release/1.x&event=push",
  };
  const mock = api([[run(5000)]], {
    ...currentRun(env),
    run_started_at: "2026-11-14T00:00:00Z",
  });
  assert.equal(requireLatestRun({ env, execute: mock.execute }), true);
  assert.equal(mock.calls.length, 2);
  assert.equal(
    mock.calls[0].args.at(-1),
    "repos/sasakiuri/oss/actions/runs/500000",
  );
  for (const { command, args, options } of mock.calls) {
    assert.equal(command, "gh");
    assert.deepEqual(args.slice(0, -1), ["api", "--method", "GET"]);
    assert.equal(options.env.GH_TOKEN, environment.GH_TOKEN);
    assert.equal(options.shell, false);
  }
  const url = new URL(mock.calls[1].args.at(-1), "https://api.github.com/");
  assert.equal(
    url.pathname,
    "/repos/sasakiuri/oss/actions/workflows/news-deployment.yml/runs",
  );
  assert.equal(url.searchParams.get("branch"), env.LATEST_RUN_BRANCH);
  assert.equal(url.searchParams.get("created"), `>=${createdAt}`);
  assert.equal(url.searchParams.get("event"), null);
  assert.equal(url.searchParams.get("per_page"), "100");
});

test("missing or invalid environment cannot authorize a deployment", () => {
  for (const key of Object.keys(environment))
    for (const value of [undefined, ""])
      assert.throws(
        () => check([[run(10)]], { ...environment, [key]: value }),
        key,
      );
  for (const key of ["LATEST_RUN_NUMBER", "LATEST_RUN_ID"])
    for (const value of ["0", "-1", "1e2", "1.5", "9007199254740992"])
      assert.throws(() => check([[run(10)]], { ...environment, [key]: value }));
  assert.throws(() =>
    check([[run(10)]], {
      ...environment,
      LATEST_RUN_WORKFLOW_REF:
        "other/repo/.github/workflows/version.yml@refs/heads/1.x",
    }),
  );
});

test(
  "the Node CLI exits before changes on newer runs and API errors",
  { skip: process.platform === "win32" },
  (t) => {
    const directory = mkdtempSync(join(tmpdir(), "latest-run-cli-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const command = join(directory, "gh");
    writeFileSync(
      command,
      '#!/bin/sh\nif [ "$LATEST_RUN_TEST_FAILURE" = true ]; then echo "private failure details" >&2; exit 1; fi\ncase "$4" in */actions/runs/*) printf "%s" "$LATEST_RUN_TEST_CURRENT" ;; *) printf "%s" "$LATEST_RUN_TEST_RESPONSE" ;; esac\n',
    );
    chmodSync(command, 0o700);
    for (const [runs, apiFailure, expected] of [
      [[run(10)], false, 0],
      [[run(11, "cancelled"), run(10)], false, 1],
      [[run(10)], true, 1],
    ]) {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./require-latest-run.mjs", import.meta.url))],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            ...environment,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
            LATEST_RUN_TEST_CURRENT: JSON.stringify(currentRun()),
            LATEST_RUN_TEST_RESPONSE: JSON.stringify({
              total_count: runs.length,
              workflow_runs: runs,
            }),
            LATEST_RUN_TEST_FAILURE: String(apiFailure),
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, expected, result.stderr);
      if (expected === 0) assert.match(result.stdout, /latest eligible run/);
      else
        assert.match(
          result.stderr,
          apiFailure
            ? /GitHub API request failed/
            : /newer run #11.*rerun the newer run/i,
        );
      assert.doesNotMatch(result.stderr, /private failure details|test-token/);
    }
  },
);

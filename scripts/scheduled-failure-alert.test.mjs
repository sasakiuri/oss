// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import yaml from "js-yaml";

import {
  actionForConclusion,
  createIssueClient,
  updateScheduledFailure,
} from "./scheduled-failure-alert.mjs";

const run = {
  event: "schedule",
  name: "CI",
  conclusion: "failure",
  url: "https://github.com/example/repo/actions/runs/42",
};
const label = "Cat: CI/CD ⚙️";
const title = "Scheduled workflow failing: CI";

function fakeClient(issues = []) {
  const calls = [];
  return {
    calls,
    client: {
      listOpenIssues: async (...args) => {
        calls.push(["list", ...args]);
        return issues;
      },
      create: async (...args) => {
        calls.push(["create", ...args]);
      },
      comment: async (...args) => {
        calls.push(["comment", ...args]);
      },
      close: async (...args) => {
        calls.push(["close", ...args]);
      },
    },
  };
}

test("conclusions map to alert, recovery, or no action", () => {
  for (const conclusion of ["failure", "timed_out", "startup_failure"])
    assert.equal(actionForConclusion(conclusion), "alert");
  assert.equal(actionForConclusion("success"), "recover");
  for (const conclusion of [
    "cancelled",
    "skipped",
    "neutral",
    "action_required",
    "stale",
    null,
    undefined,
    "unknown",
  ])
    assert.equal(actionForConclusion(conclusion), "ignore");
});

test("each failing conclusion creates a labeled issue with the run URL", async () => {
  for (const conclusion of ["failure", "timed_out", "startup_failure"]) {
    const { client, calls } = fakeClient();
    await updateScheduledFailure({ ...run, conclusion }, client);
    assert.deepEqual(calls, [
      ["list", label],
      [
        "create",
        {
          title,
          body: `Scheduled run concluded with ${conclusion}: ${run.url}`,
          labels: [label],
        },
      ],
    ]);
  }
});

test("an exact issue title is reused while prefixes and pull requests are excluded", async () => {
  const { client, calls } = fakeClient([
    { title: `${title} extended`, number: 1 },
    { title, number: 2, pull_request: {} },
    { title: "Scheduled workflow failing: C", number: 3 },
    { title, number: 4 },
  ]);
  await updateScheduledFailure(run, client);
  assert.deepEqual(calls, [
    ["list", label],
    ["comment", 4, `Scheduled run concluded with failure: ${run.url}`],
  ]);
});

test("a prefix match alone does not prevent issue creation", async () => {
  const { client, calls } = fakeClient([
    { title: `${title} extended`, number: 1 },
  ]);
  await updateScheduledFailure(run, client);
  assert.equal(calls[1][0], "create");
});

test("success comments before closing an open issue and otherwise does nothing", async () => {
  const { client, calls } = fakeClient([{ title, number: 4 }]);
  await updateScheduledFailure({ ...run, conclusion: "success" }, client);
  assert.deepEqual(calls, [
    ["list", label],
    ["comment", 4, `Scheduled run succeeded: ${run.url}`],
    ["close", 4],
  ]);
  const absent = fakeClient();
  await updateScheduledFailure(
    { ...run, conclusion: "success" },
    absent.client,
  );
  assert.deepEqual(absent.calls, [["list", label]]);
});

test("other conclusions and non-scheduled events make no client calls", async () => {
  for (const changes of [
    ...["cancelled", "skipped", "neutral", "action_required"].map(
      (conclusion) => ({ conclusion }),
    ),
    ...["push", "pull_request", "workflow_dispatch"].map((event) => ({
      event,
    })),
  ]) {
    const { client, calls } = fakeClient();
    await updateScheduledFailure({ ...run, ...changes }, client);
    assert.deepEqual(calls, []);
  }
});

test("the REST client paginates labeled open issues and sends create, comment, and close requests", async () => {
  const calls = [];
  const client = createIssueClient({
    repository: "example/repo",
    token: "test-token",
    request: async (url, options) => {
      calls.push({ url, ...options });
      return {
        ok: true,
        json: async () =>
          options.method === "GET"
            ? url.endsWith("page=1")
              ? Array.from({ length: 100 }, (_, number) => ({ number }))
              : [{ number: 101 }]
            : {},
      };
    },
  });
  assert.equal((await client.listOpenIssues(label)).length, 101);
  await client.create({ title, body: run.url, labels: [label] });
  await client.comment(101, run.url);
  await client.close(101);
  assert.deepEqual(
    calls.map(({ url, method, body }) => [
      url,
      method,
      body && JSON.parse(body),
    ]),
    [
      [
        `https://api.github.com/repos/example/repo/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100&page=1`,
        "GET",
        undefined,
      ],
      [
        `https://api.github.com/repos/example/repo/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100&page=2`,
        "GET",
        undefined,
      ],
      [
        "https://api.github.com/repos/example/repo/issues",
        "POST",
        { title, body: run.url, labels: [label] },
      ],
      [
        "https://api.github.com/repos/example/repo/issues/101/comments",
        "POST",
        { body: run.url },
      ],
      [
        "https://api.github.com/repos/example/repo/issues/101",
        "PATCH",
        { state: "closed" },
      ],
    ],
  );
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
});

test("REST failures are surfaced", async () => {
  const client = createIssueClient({
    repository: "example/repo",
    token: "test-token",
    request: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(client.close(1), /GitHub PATCH .* failed \(403\)/);
});

const directory = new URL("../.github/workflows/", import.meta.url);
const workflow = yaml.load(
  readFileSync(new URL("scheduled-failure-alert.yml", directory), "utf8"),
);

test("the alert workflow watches exactly all workflows declaring schedule triggers", () => {
  const scheduled = readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => yaml.load(readFileSync(new URL(file, directory), "utf8")))
    .filter((entry) => Object.hasOwn(entry.on ?? {}, "schedule"))
    .map((entry) => entry.name);
  assert.deepEqual(
    [...workflow.on.workflow_run.workflows].sort(),
    [...new Set(scheduled)].sort(),
  );
});

test("the privileged workflow only executes trusted branch code and passes run data through env", () => {
  assert.deepEqual(workflow.on.workflow_run.branches, ["1.x"]);
  assert.deepEqual(workflow.on.workflow_run.types, ["completed"]);
  assert.deepEqual(workflow.permissions, {});
  assert.equal(
    workflow.jobs.alert.if,
    "github.event.workflow_run.event == 'schedule'",
  );
  assert.deepEqual(workflow.jobs.alert.permissions, {
    contents: "read",
    issues: "write",
  });
  const steps = workflow.jobs.alert.steps;
  assert.equal(steps[0].with.ref, "1.x");
  assert.equal(steps[0].with["persist-credentials"], false);
  for (const step of steps) {
    if (step.uses)
      assert.match(step.uses, /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
    if (step.run) assert.doesNotMatch(step.run, /\$\{\{/);
  }
  assert.equal(
    steps.at(-1).env.RUN_NAME,
    "${{ github.event.workflow_run.name }}",
  );
  const labels = JSON.parse(
    readFileSync(new URL("../.github/labels.json", import.meta.url), "utf8"),
  );
  assert.ok(labels.some((entry) => entry.name === label));
});

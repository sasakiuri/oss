// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

import yaml from "js-yaml";

const directory = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(directory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({
    file,
    ...yaml.load(readFileSync(new URL(file, directory), "utf8")),
  }));
const dependencies = (job) => [job.needs ?? []].flat();
// Any explicit status function replaces the implicit success() condition.
const statusFunction = /\b(?:always|failure|cancelled|success)\s*\(/i;
const aggregateJobs = [
  "ci.yml/ci-required",
  "ci.yml/knowledge-required",
  "ci.yml/about-required",
];
const inheritedWorkloads = {
  "docs.yml": ["validate"],
  "sync-labels.yml": ["preview", "sync"],
  "knowledge-links.yml": ["links"],
  "docs-deep-quality.yml": ["deterministic"],
  "stale.yml": ["stale"],
  "lock-threads.yml": ["lock"],
};
const inheritedCondition =
  "${{ !cancelled() && (needs.approval.result == 'success' || (inputs.approval-inherited && needs.approval.result == 'skipped')) }}";
const deploymentCondition =
  "github.event_name == 'workflow_dispatch' || (github.event.client_payload.project.id == 'prj_yiyI5AfNEtF7WiQdwjTDnQil9zY3' &&\n github.event.client_payload.environment == 'production')";
const conditions = {
  "knowledge-deployment.yml/approval": deploymentCondition,
  "ci.yml/report":
    "${{ !cancelled() && needs.approval.result == 'success' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}",
};
for (const [file, jobs] of Object.entries(inheritedWorkloads)) {
  conditions[`${file}/approval`] = "${{ !inputs.approval-inherited }}";
  for (const id of jobs) conditions[`${file}/${id}`] = inheritedCondition;
}
conditions["sync-labels.yml/preview"] =
  "${{ !cancelled() && (needs.approval.result == 'success' || (inputs.approval-inherited && needs.approval.result == 'skipped')) && (github.event_name == 'pull_request') }}";
conditions["sync-labels.yml/sync"] =
  "${{ !cancelled() && (needs.approval.result == 'success' || (inputs.approval-inherited && needs.approval.result == 'skipped')) && (github.event_name != 'pull_request') }}";

function workflowEvents(workflow) {
  const triggers = workflow.on ?? workflow.true;
  const events =
    typeof triggers === "string"
      ? [triggers]
      : Array.isArray(triggers)
        ? [...triggers]
        : triggers && typeof triggers === "object"
          ? Object.keys(triggers)
          : [];
  assert.ok(
    events.length > 0 &&
      events.every((event) => typeof event === "string" && event.length > 0),
    "workflow must declare events",
  );
  return events;
}
function eventConfig(workflow, event) {
  assert.ok(
    workflowEvents(workflow).includes(event),
    `${workflow.file}/${event}`,
  );
  const triggers = workflow.on ?? workflow.true;
  return typeof triggers === "object" && !Array.isArray(triggers)
    ? triggers[event]
    : undefined;
}
function assertAllowedEvents(workflow) {
  const events = workflowEvents(workflow);
  for (const event of ["schedule", "pull_request_target", "workflow_run"])
    assert.ok(!events.includes(event), event);
  if (events.includes("repository_dispatch"))
    assert.equal(workflow.file, "knowledge-deployment.yml");
}

test("trigger policy rejects forbidden events in every YAML form", () => {
  for (const event of ["schedule", "pull_request_target", "workflow_run"])
    for (const key of ["on", "true"])
      for (const value of [
        event,
        ["workflow_dispatch", event],
        { [event]: null },
      ])
        assert.throws(
          () => assertAllowedEvents({ file: "scorecard.yml", [key]: value }),
          new RegExp(event),
        );
});

test("normalized events preserve called-only and dispatch restrictions", () => {
  for (const key of ["on", "true"])
    for (const value of [
      "workflow_call",
      ["workflow_call"],
      { workflow_call: {} },
    ])
      assert.deepEqual(workflowEvents({ [key]: value }), ["workflow_call"]);
  for (const value of [
    "repository_dispatch",
    ["repository_dispatch"],
    { repository_dispatch: {} },
  ]) {
    assert.throws(() =>
      assertAllowedEvents({ file: "scorecard.yml", on: value }),
    );
    assert.doesNotThrow(() =>
      assertAllowedEvents({ file: "knowledge-deployment.yml", true: value }),
    );
  }
  for (const source of [
    "on: workflow_run",
    "on: [workflow_dispatch, workflow_run]",
    "on: {workflow_run: null}",
    "true: [workflow_dispatch, workflow_run]",
  ])
    assert.throws(
      () =>
        assertAllowedEvents({ file: "scorecard.yml", ...yaml.load(source) }),
      /workflow_run/,
    );
});

for (const workflow of workflows) {
  test(`${workflow.file} has no schedule and gates every direct entry point`, () => {
    assertAllowedEvents(workflow);
    // This also covers local and external reusable workflow calls.
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const key = `${workflow.file}/${id}`;
      const environment =
        typeof job.environment === "object"
          ? job.environment.name
          : job.environment;
      if (environment === "ci-approval") assert.equal(id, "approval", key);
      if (aggregateJobs.includes(key))
        assert.equal(job.if, "${{ always() }}", key);
      else if (Object.hasOwn(conditions, key))
        assert.equal(job.if, conditions[key], key);
      else assert.doesNotMatch(String(job.if ?? ""), statusFunction, key);
    }
    const calledOnly = workflowEvents(workflow).every(
      (event) => event === "workflow_call",
    );
    if (calledOnly) {
      assert.ok(!Object.values(workflow.jobs).some((job) => job.environment));
      return;
    }
    assert.equal(Object.keys(workflow.jobs)[0], "approval");
    const gate = workflow.jobs.approval;
    if (Object.hasOwn(conditions, `${workflow.file}/approval`))
      assert.equal(gate.if, conditions[`${workflow.file}/approval`]);
    else
      assert.ok(!Object.hasOwn(gate, "if"), "approval must not be conditional");
    assert.equal(gate.environment, "ci-approval");
    assert.ok(!gate["continue-on-error"]);
    assert.deepEqual(gate.permissions, {});
    assert.deepEqual(dependencies(gate), []);
    assert.match(gate["runs-on"], /^ubuntu-/);
    assert.deepEqual(gate.steps, [{ name: "Confirm approval", run: "true" }]);
    assert.equal(
      Object.values(workflow.jobs).filter(
        (job) => job.environment === "ci-approval",
      ).length,
      1,
    );
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (id !== "approval")
        assert.ok(dependencies(job).includes("approval"), id);
    }
  });
}

for (const key of aggregateJobs) {
  test(`${key} rejects unapproved runs before checkout or repository code`, () => {
    const [file, id] = key.split("/");
    const job = workflows.find((workflow) => workflow.file === file).jobs[id];
    assert.equal(job.if, "${{ always() }}");
    assert.ok(!job["continue-on-error"]);
    const guard = job.steps[0];
    assert.deepEqual(guard, {
      name: "Require owner approval",
      env: { APPROVAL_RESULT: "${{ needs.approval.result }}" },
      shell: "bash",
      run: 'test "$APPROVAL_RESULT" = success',
    });
    // Later steps must retain the implicit success() check after the guard.
    for (const step of job.steps.slice(1))
      assert.doesNotMatch(String(step.if ?? ""), statusFunction);
    for (const result of ["success", "failure", "cancelled", "skipped", ""]) {
      const run = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", "-c", guard.run],
        {
          env: { APPROVAL_RESULT: result },
          encoding: "utf8",
        },
      );
      assert.ifError(run.error);
      assert.equal(run.status, result === "success" ? 0 : 1, result);
    }
  });
}

for (const [file, jobs] of Object.entries(inheritedWorkloads)) {
  test(`${file} inherits approval without a manual bypass input`, () => {
    const workflow = workflows.find((item) => item.file === file);
    assert.deepEqual(
      eventConfig(workflow, "workflow_call").inputs["approval-inherited"],
      {
        description: "The caller gates this run with ci-approval.",
        type: "boolean",
        default: true,
      },
    );
    assert.deepEqual(
      eventConfig(workflow, "workflow_dispatch")?.inputs,
      file === "sync-labels.yml"
        ? {
            prune: {
              description:
                "Delete retired managed labels and their issue assignments",
              type: "boolean",
              default: false,
            },
          }
        : undefined,
    );
    assert.deepEqual(workflowEvents(workflow).sort(), [
      "workflow_call",
      "workflow_dispatch",
    ]);
    assert.equal(
      workflow.jobs.approval.if,
      "${{ !inputs.approval-inherited }}",
    );
    for (const id of jobs)
      assert.equal(workflow.jobs[id].if, conditions[`${file}/${id}`]);
  });
}

const ci = workflows.find(({ file }) => file === "ci.yml");
test("CI preserves required check names and exact event conditions", () => {
  assert.deepEqual(ci.permissions, {});
  assert.deepEqual(eventConfig(ci, "pull_request"), { branches: ["1.x"] });
  assert.deepEqual(ci.concurrency, {
    group: "ci-${{ github.ref }}",
    "cancel-in-progress": true,
  });
  for (const [id, name, condition] of [
    ["analyze", "Analyze (${{ matrix.language }})", undefined],
    ["gitleaks", "gitleaks", undefined],
    [
      "dependency-review",
      "dependency-review",
      "github.event_name == 'pull_request'",
    ],
    ["validate", "validate", "github.event_name == 'pull_request'"],
  ]) {
    assert.ok(ci.jobs[id], id);
    assert.equal(ci.jobs[id].name ?? id, name);
    assert.equal(ci.jobs[id].if, condition);
    if (condition === undefined) assert.ok(!Object.hasOwn(ci.jobs[id], "if"));
    assert.ok(dependencies(ci.jobs[id]).includes("approval"));
    assert.ok(dependencies(ci.jobs["ci-required"]).includes(id));
    assert.ok(!ci.jobs[id]["continue-on-error"]);
  }
  assert.deepEqual(ci.jobs.analyze.strategy.matrix.language, [
    "javascript-typescript",
  ]);
  assert.equal(ci.jobs["ci-required"].name, "CI Required");
  const titleCheckout = ci.jobs.validate.steps[0];
  assert.equal(titleCheckout.with.ref, "${{ github.base_ref }}");
});

test("test reports wait for every producer and retain report identities", () => {
  const report = ci.jobs.report;
  assert.equal(report.if, conditions["ci.yml/report"]);
  assert.deepEqual(report.permissions, {
    contents: "read",
    checks: "write",
    actions: "read",
  });
  for (const id of ["approval", "unit", "e2e", "knowledge", "about"])
    assert.ok(dependencies(report).includes(id));
  assert.deepEqual(
    report.steps.map((step) => step.with.name),
    ["Vitest ($1)", "Playwright ($2, suite $1)"],
  );
});

test("fork write jobs keep exact conditions and only their pinned actions", () => {
  assert.equal(
    ci.jobs.label.if,
    "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository",
  );
  assert.equal(ci.jobs.report.if, conditions["ci.yml/report"]);
  for (const [id, count, action] of [
    ["label", 1, "actions/labeler@8558fd74291d67161a8a78ce36a881fa63b766a9"],
    [
      "report",
      2,
      "dorny/test-reporter@df6247429542221bc30d46a036ee47af1102c451",
    ],
  ]) {
    assert.equal(ci.jobs[id].steps.length, count);
    for (const step of ci.jobs[id].steps) {
      assert.equal(step.uses, action);
      assert.equal(step.run, undefined);
    }
  }
});

test(
  "title validation fetches the latest API title and closes on API errors",
  { skip: process.platform === "win32" },
  (t) => {
    const job = ci.jobs.validate;
    const step = job.steps.at(-1);
    assert.deepEqual(job.permissions, {
      contents: "read",
      "pull-requests": "read",
    });
    assert.equal(step.shell, "bash");
    assert.deepEqual(step.env, {
      GH_TOKEN: "${{ github.token }}",
      GH_REPO: "${{ github.repository }}",
      PR_NUMBER: "${{ github.event.pull_request.number }}",
    });
    assert.doesNotMatch(step.run, /\$\{\{|pull_request\.title/);
    const directory = mkdtempSync(join(tmpdir(), "api-title-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const capture = join(directory, "capture.json");
    const request = join(directory, "request.json");
    for (const [command, code] of [
      [
        "gh",
        'import fs from "node:fs"; fs.writeFileSync(process.env.TITLE_REQUEST, JSON.stringify(process.argv.slice(2))); process.stdout.write(process.env.TITLE_RESPONSE); process.exit(Number(process.env.TITLE_API_STATUS));',
      ],
      [
        "npm",
        'import fs from "node:fs"; fs.writeFileSync(process.env.TITLE_CAPTURE, JSON.stringify({args: process.argv.slice(2), input: fs.readFileSync(0, "utf8")}));',
      ],
    ]) {
      const path = join(directory, command);
      writeFileSync(path, "#!/usr/bin/env node\n" + code + "\n");
      chmodSync(path, 0o700);
    }
    const sentinel = join(directory, "should-not-exist");
    const title = `fix(repo): keep $(touch ${sentinel}) \`touch ${sentinel}\`; literal text`;
    for (const status of ["0", "1"]) {
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
            GH_TOKEN: "test-token",
            GH_REPO: "sasakiuri/oss",
            PR_NUMBER: "123",
            PR_TITLE: "stale event title",
            TITLE_RESPONSE: title + "\n",
            TITLE_API_STATUS: status,
            TITLE_CAPTURE: capture,
            TITLE_REQUEST: request,
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, Number(status), result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(request, "utf8")), [
        "api",
        "--method",
        "GET",
        "repos/sasakiuri/oss/pulls/123",
        "--jq",
        ".title",
      ]);
      assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), {
        args: ["exec", "--no", "--", "commitlint", "--verbose"],
        input: title + "\n",
      });
      assert.equal(existsSync(sentinel), false);
    }
  },
);

test("irrelevant Vercel dispatches skip approval and the workload together", () => {
  const workflow = workflows.find(
    ({ file }) => file === "knowledge-deployment.yml",
  );
  assert.equal(workflow.jobs.approval.if, deploymentCondition);
  assert.equal(workflow.jobs.smoke.if, deploymentCondition);
});

test("periodic scans use one approval and reuse the CodeQL steps", () => {
  const periodic = workflows.find(({ file }) => file === "periodic.yml");
  assert.deepEqual(workflowEvents(periodic), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(periodic.jobs), [
    "approval",
    "analyze",
    "osv-scan-push",
    "knowledge-links",
    "docs-deep-quality",
    "stale",
    "lock-threads",
  ]);
  const ciAnalysis = ci.jobs.analyze.steps.at(-1);
  const periodicAnalysis = periodic.jobs.analyze.steps.at(-1);
  assert.equal(ciAnalysis.uses, "./.github/actions/codeql");
  assert.equal(periodicAnalysis.uses, ciAnalysis.uses);
  assert.equal(ciAnalysis.with.category, "/language:${{ matrix.language }}");
  assert.equal(
    periodicAnalysis.with.category,
    "/periodic/language:${{ matrix.language }}",
  );
});

test("deployment and version locks separate approval from mutations", () => {
  for (const [file, id, group] of [
    ["news-deployment.yml", "deploy", "nilay-news-production"],
    ["version.yml", "version", "version-${{ github.ref }}"],
  ]) {
    const workflow = workflows.find((item) => item.file === file);
    assert.equal(workflow.concurrency, undefined);
    assert.deepEqual(workflow.jobs.approval.concurrency, {
      group: `${group}-approval`,
      "cancel-in-progress": true,
    });
    assert.deepEqual(workflow.jobs[id].concurrency, {
      group,
      "cancel-in-progress": false,
    });
  }
});

test("mutation jobs require the latest run immediately after checkout", () => {
  for (const [file, id, firstMutation] of [
    [
      "news-deployment.yml",
      "deploy",
      "Write the production Worker configuration",
    ],
    ["version.yml", "version", "Create release PR or version bump"],
  ]) {
    const job = workflows.find((item) => item.file === file).jobs[id];
    assert.match(job.steps[0].uses, /^actions\/checkout@/);
    assert.deepEqual(job.steps[1], {
      name: "Require latest workflow run",
      uses: "./.github/actions/require-latest-run",
    });
    assert.ok(job.steps.findIndex((step) => step.name === firstMutation) > 1);
    assert.deepEqual(
      job.permissions,
      file === "news-deployment.yml"
        ? { actions: "read", contents: "read" }
        : { actions: "read", contents: "write", "pull-requests": "write" },
    );
  }
  const action = yaml.load(
    readFileSync(
      new URL(
        "../.github/actions/require-latest-run/action.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(action.runs.using, "composite");
  assert.equal(action.runs.steps.length, 1);
  const step = action.runs.steps[0];
  assert.equal(step["working-directory"], "${{ github.workspace }}");
  assert.equal(step.run, "node scripts/require-latest-run.mjs");
  assert.deepEqual(step.env, {
    GH_TOKEN: "${{ github.token }}",
    LATEST_RUN_REPOSITORY: "${{ github.repository }}",
    LATEST_RUN_WORKFLOW_REF: "${{ github.workflow_ref }}",
    LATEST_RUN_BRANCH: "${{ github.ref_name }}",
    LATEST_RUN_NUMBER: "${{ github.run_number }}",
    LATEST_RUN_ID: "${{ github.run_id }}",
  });
  assert.ok(
    ci.jobs.repository.steps.some((item) =>
      item.run?.includes("scripts/require-latest-run.test.mjs"),
    ),
  );
});

test("cache cleanup is manual and passes its PR input through the environment", () => {
  const workflow = workflows.find(({ file }) => file === "cache-cleanup.yml");
  assert.deepEqual(workflowEvents(workflow), ["workflow_dispatch"]);
  assert.equal(
    eventConfig(workflow, "workflow_dispatch").inputs["pr-number"].required,
    true,
  );
  const cleanup = workflow.jobs.cleanup.steps[0];
  assert.equal(cleanup.env.PR_NUMBER, "${{ inputs.pr-number }}");
  assert.doesNotMatch(cleanup.run, /\$\{\{/);
});

test("Scorecard keeps publication permissions and steps isolated from approval", () => {
  const workflow = workflows.find(({ file }) => file === "scorecard.yml");
  assert.ok(!workflow.env && !workflow.defaults);
  assert.ok(!Object.values(workflow.permissions).includes("write"));
  const job = workflow.jobs.scorecard;
  assert.equal(job.environment, undefined);
  assert.equal(job.permissions["id-token"], "write");
  assert.ok(!job.env && !job.defaults && !job.container && !job.services);
  for (const step of job.steps) {
    assert.ok(!step.run);
    assert.match(
      step.uses,
      /^(actions\/(checkout|upload-artifact)|github\/codeql-action\/upload-sarif|ossf\/scorecard-action)@[a-f0-9]{40}$/,
    );
  }
  assert.equal(
    job.steps.find((step) => step.uses.startsWith("ossf/scorecard-action@"))
      .with.publish_results,
    true,
  );
});

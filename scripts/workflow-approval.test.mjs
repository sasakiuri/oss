// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
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
const docsConditions = {
  "docs.yml/approval": "${{ !inputs.approval-inherited }}",
  "docs.yml/validate":
    "${{ !cancelled() && (needs.approval.result == 'success' || (inputs.approval-inherited && needs.approval.result == 'skipped')) }}",
};

for (const workflow of workflows) {
  test(`${workflow.file} has no schedule and gates every direct entry point`, () => {
    assert.ok(!Object.hasOwn(workflow.on, "schedule"));
    // This also covers local and external reusable workflow calls.
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const key = `${workflow.file}/${id}`;
      if (aggregateJobs.includes(key))
        assert.equal(job.if, "${{ always() }}", key);
      else if (Object.hasOwn(docsConditions, key))
        assert.equal(job.if, docsConditions[key], key);
      else assert.doesNotMatch(String(job.if ?? ""), statusFunction, key);
    }
    const calledOnly = Object.keys(workflow.on).every(
      (event) => event === "workflow_call",
    );
    if (calledOnly) {
      assert.ok(!Object.values(workflow.jobs).some((job) => job.environment));
      return;
    }
    assert.equal(Object.keys(workflow.jobs)[0], "approval");
    const gate = workflow.jobs.approval;
    if (workflow.file !== "docs.yml")
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

test("Docs inherits caller approval without a manual bypass input", () => {
  const docs = workflows.find(({ file }) => file === "docs.yml");
  assert.deepEqual(docs.on.workflow_call.inputs["approval-inherited"], {
    description: "The caller gates this run with ci-approval.",
    type: "boolean",
    default: true,
  });
  assert.equal(docs.on.workflow_dispatch?.inputs, undefined);
  assert.equal(docs.jobs.approval.if, "${{ !inputs.approval-inherited }}");
  assert.equal(
    docs.jobs.validate.if,
    "${{ !cancelled() && (needs.approval.result == 'success' || (inputs.approval-inherited && needs.approval.result == 'skipped')) }}",
  );
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

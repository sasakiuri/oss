// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { requiredChecksPass } from "./check-required-ci.mjs";
test("Docs-only changes must run and pass Docs", () => {
  const needs = {
    changes: { result: "success", outputs: { ci: "false", docs: "true" } },
    text: { result: "success" },
    lint: { result: "skipped" },
    "build-and-test": { result: "skipped" },
    docs: { result: "success" },
  };
  assert.equal(requiredChecksPass(needs), true);
  for (const result of ["failure", "cancelled", "skipped"])
    assert.equal(requiredChecksPass({ ...needs, docs: { result } }), false);
});
test("Only an intentional irrelevant-change skip can pass", () => {
  const needs = {
    changes: { result: "success", outputs: { ci: "false", docs: "false" } },
    text: { result: "success" },
    lint: { result: "skipped" },
    "build-and-test": { result: "skipped" },
    docs: { result: "skipped" },
  };
  assert.equal(requiredChecksPass(needs), true);
  assert.equal(
    requiredChecksPass({ ...needs, changes: { result: "cancelled" } }),
    false,
  );
});
test("Repository text lint is required even when workspace checks are skipped", () => {
  const needs = {
    changes: { result: "success", outputs: { ci: "false", docs: "false" } },
    text: { result: "success" },
    lint: { result: "skipped" },
    "build-and-test": { result: "skipped" },
    docs: { result: "skipped" },
  };
  assert.equal(requiredChecksPass(needs), true);
  for (const result of ["failure", "cancelled", "skipped", undefined])
    assert.equal(requiredChecksPass({ ...needs, text: { result } }), false);
});

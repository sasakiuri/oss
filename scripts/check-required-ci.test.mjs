// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { requiredChecksPass } from "./check-required-ci.mjs";

function needsFor({
  text = false,
  infrastructure = false,
  ci = false,
  build = false,
  docs = false,
  electron = false,
} = {}) {
  return {
    changes: {
      result: "success",
      outputs: {
        text: String(text),
        infrastructure: String(infrastructure),
        ci: String(ci),
        build: String(build),
        docs: String(docs),
        electron: String(electron),
        packages: JSON.stringify(ci ? ["@sasakiuri/example"] : []),
        os: JSON.stringify(
          electron
            ? ["ubuntu-latest", "windows-latest", "macos-latest"]
            : ["ubuntu-latest"],
        ),
      },
    },
    text: { result: text ? "success" : "skipped" },
    infrastructure: { result: infrastructure ? "success" : "skipped" },
    lint: { result: ci ? "success" : "skipped" },
    "build-and-test": { result: build ? "success" : "skipped" },
    docs: { result: docs ? "success" : "skipped" },
  };
}

test("all applicable checks must succeed for every supported plan", () => {
  const packagePlans = [
    {},
    { docs: true },
    { ci: true },
    { ci: true, build: true },
    { ci: true, build: true, electron: true },
    { ci: true, build: true, docs: true, electron: true },
  ];
  const plans = packagePlans.flatMap((plan) =>
    [false, true].flatMap((text) =>
      [false, true].map((infrastructure) => ({
        ...plan,
        text,
        infrastructure,
      })),
    ),
  );
  for (const plan of plans) {
    const needs = needsFor(plan);
    assert.equal(requiredChecksPass(needs), true);
    for (const name of [
      "changes",
      "text",
      "infrastructure",
      "lint",
      "build-and-test",
      "docs",
    ]) {
      for (const result of ["failure", "cancelled", undefined])
        assert.equal(
          requiredChecksPass({ ...needs, [name]: { ...needs[name], result } }),
          false,
        );
      const opposite = needs[name].result === "success" ? "skipped" : "success";
      assert.equal(
        requiredChecksPass({
          ...needs,
          [name]: { ...needs[name], result: opposite },
        }),
        false,
      );
    }
  }
});

test("missing and malformed decisions cannot silently skip checks", () => {
  for (const key of [
    "text",
    "infrastructure",
    "ci",
    "build",
    "docs",
    "electron",
  ]) {
    for (const value of [undefined, "", "True", true, false, null]) {
      const needs = needsFor();
      needs.changes.outputs[key] = value;
      assert.equal(requiredChecksPass(needs), false);
    }
  }
  const needs = needsFor();
  delete needs.changes.outputs;
  assert.equal(requiredChecksPass(needs), false);
  assert.equal(requiredChecksPass(null), false);
});

test("inconsistent package and runner plans fail closed", () => {
  for (const [key, value] of [
    ["build", "true"],
    ["electron", "true"],
    ["packages", '["unexpected"]'],
    ["packages", '"invalid"'],
    ["packages", "null"],
    ["os", "[]"],
    ["os", '["unknown"]'],
    ["os", "null"],
    ["os", "invalid"],
  ]) {
    const needs = needsFor();
    needs.changes.outputs[key] = value;
    assert.equal(requiredChecksPass(needs), false);
  }
  const needs = needsFor({ ci: true });
  needs.changes.outputs.packages = '["duplicate","duplicate"]';
  assert.equal(requiredChecksPass(needs), false);
});

test("the gate CLI rejects absent or malformed results", () => {
  for (const value of [undefined, "", "invalid", "null", "{}"]) {
    const env = { ...process.env };
    if (value === undefined) delete env.NEEDS_JSON;
    else env.NEEDS_JSON = value;
    const result = spawnSync(
      process.execPath,
      ["scripts/check-required-ci.mjs"],
      { env },
    );
    assert.equal(result.status, 1);
  }
  const result = spawnSync(
    process.execPath,
    ["scripts/check-required-ci.mjs"],
    {
      env: { ...process.env, NEEDS_JSON: JSON.stringify(needsFor()) },
    },
  );
  assert.equal(result.status, 0);
});

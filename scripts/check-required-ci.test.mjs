// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { requiredChecksPass as check } from "./check-required-ci.mjs";
import {
  e2eMatrix,
  platformRunners,
  readGitWorkspaces,
  selectCiPackages,
} from "./select-ci-packages.mjs";

const workspaces = [
  {
    name: "@sasakiuri/config",
    directory: "packages/config",
    scripts: { lint: "lint" },
  },
  {
    name: "@sasakiuri/desktop",
    directory: "packages/desktop",
    scripts: { test: "test" },
    devDependencies: { electron: "*" },
  },
  {
    name: "@sasakiuri/example",
    directory: "packages/example",
    scripts: { test: "test" },
  },
  {
    name: "@sasakiuri/browser",
    directory: "packages/browser",
    scripts: { "test:e2e": "playwright test" },
  },
  {
    name: "@sasakiuri/nilay-knowledge",
    directory: "packages/nilay-knowledge",
    scripts: {
      "test:e2e": "playwright test",
      "test:install": "playwright install",
    },
  },
];
const requiredChecksPass = (needs) => check(needs, workspaces);

test("workflow output names and aggregate dependencies carry real plans to the gate", () => {
  // These tests run before npm ci, so inspect the small output wiring without a YAML dependency.
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const bindings = [
    ...workflow.matchAll(
      /^      (\w+): \$\{\{ steps\.plan\.outputs\.(\w+) \}\}$/gm,
    ),
  ];
  const dependencies = workflow
    .match(/  ci-required:[\s\S]*?needs:\s*\[([^\]]+)\]/)[1]
    .split(",")
    .map((name) => name.trim());
  const packages = readGitWorkspaces("HEAD");
  for (const file of [
    "README.md",
    "package.json",
    "packages/nilay-knowledge/package.json",
    "packages/saika-docs/content/page.md",
  ]) {
    const plan = selectCiPackages([file], packages);
    const outputs = Object.fromEntries(
      bindings.map(([, name, source]) => [name, JSON.stringify(plan[source])]),
    );
    const applicable = {
      changes: true,
      text: plan.text,
      infrastructure: plan.infrastructure,
      lint: plan.ci,
      build: plan.build,
      unit: plan.build,
      e2e: plan.e2e,
      lighthouse: plan.knowledge,
      docs: plan.docs,
    };
    const needs = Object.fromEntries(
      dependencies.map((name) => [
        name,
        { result: applicable[name] ? "success" : "skipped" },
      ]),
    );
    needs.changes.outputs = outputs;
    assert.equal(check(needs, packages), true, file);
    const matrixOutput = workflow.match(
      /include: \$\{\{ fromJSON\(needs\.changes\.outputs\.(\w+)\) \}\}/,
    )[1];
    assert.deepEqual(JSON.parse(outputs[matrixOutput]), plan.e2eMatrix);
  }
});

function needsFor({
  text = false,
  infrastructure = false,
  ci = false,
  build = false,
  docs = false,
  electron = false,
  knowledge = false,
  e2e = false,
} = {}) {
  const packages = !ci
    ? []
    : [
        knowledge
          ? "@sasakiuri/nilay-knowledge"
          : electron
            ? "@sasakiuri/desktop"
            : e2e
              ? "@sasakiuri/browser"
              : build
                ? "@sasakiuri/example"
                : "@sasakiuri/config",
      ];
  const os = electron || knowledge ? platformRunners : ["ubuntu-latest"];
  const matrix = e2eMatrix(
    workspaces.filter((pkg) => packages.includes(pkg.name)),
    os,
  );
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
        knowledge: String(knowledge),
        e2e: String(matrix.length > 0),
        e2eMatrix: JSON.stringify(matrix),
        packages: JSON.stringify(packages),
        os: JSON.stringify(os),
      },
    },
    text: { result: text ? "success" : "skipped" },
    infrastructure: { result: infrastructure ? "success" : "skipped" },
    lint: { result: ci ? "success" : "skipped" },
    build: { result: build ? "success" : "skipped" },
    unit: { result: build ? "success" : "skipped" },
    e2e: { result: matrix.length ? "success" : "skipped" },
    lighthouse: { result: knowledge ? "success" : "skipped" },
    docs: { result: docs ? "success" : "skipped" },
  };
}

test("all applicable checks must succeed for every supported plan", () => {
  const packagePlans = [
    {},
    { docs: true },
    { ci: true },
    { ci: true, build: true },
    { ci: true, build: true, e2e: true },
    { ci: true, build: true, knowledge: true },
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
      "build",
      "unit",
      "e2e",
      "lighthouse",
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
    "knowledge",
    "e2e",
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

test("missing, duplicate, skipped and altered E2E shards fail closed", () => {
  for (const mutate of [
    (matrix) => matrix.slice(1),
    (matrix) => [...matrix, matrix[0]],
    (matrix) => matrix.map((row) => ({ ...row, shard: 1 })),
    (matrix) => matrix.map((row) => ({ ...row, shards: 1 })),
    (matrix) => matrix.filter((row) => row.os === "ubuntu-latest"),
    (matrix) => matrix.map((row) => ({ ...row, package: "@sasakiuri/other" })),
  ]) {
    const needs = needsFor({ ci: true, build: true, knowledge: true });
    needs.changes.outputs.e2eMatrix = JSON.stringify(
      mutate(JSON.parse(needs.changes.outputs.e2eMatrix)),
    );
    assert.equal(requiredChecksPass(needs), false);
  }
  const needs = needsFor({ ci: true, build: true, knowledge: true });
  needs.changes.outputs.e2e = "false";
  needs.e2e.result = "skipped";
  assert.equal(requiredChecksPass(needs), false);
});

test("package manifests prevent false decisions from silently dropping platform or unit checks", () => {
  const desktop = needsFor({ ci: true, build: true, electron: true });
  desktop.changes.outputs.electron = "false";
  desktop.changes.outputs.os = '["ubuntu-latest"]';
  assert.equal(requiredChecksPass(desktop), false);
  const unit = needsFor({ ci: true, build: true });
  unit.changes.outputs.build = "false";
  unit.build.result = "skipped";
  unit.unit.result = "skipped";
  assert.equal(requiredChecksPass(unit), false);
});

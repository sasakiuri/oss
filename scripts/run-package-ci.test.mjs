// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { packageCommands, runCommands } from "./run-package-ci.mjs";

const packages = [
  {
    name: "app",
    directory: "packages/app",
    scripts: {
      build: "build",
      test: "test",
      "test:coverage": "coverage",
      "test:e2e": "e2e",
    },
  },
  {
    name: "library",
    directory: "packages/library",
    scripts: { build: "build", test: "test", "test:mutation": "mutation" },
  },
  { name: "config", directory: "packages/config", scripts: { lint: "lint" } },
];

test("Turbo uses explicit filters and never runs on empty selections", () => {
  assert.deepEqual(packageCommands("build", ["app"], packages), [
    ["exec", "--", "turbo", "build", "--filter=app"],
  ]);
  assert.deepEqual(packageCommands("build", [], packages), []);
  assert.deepEqual(packageCommands("build", ["config"], packages), []);
  assert.deepEqual(packageCommands("knip", [], packages), []);
});

test("tests prefer coverage and include libraries without coverage scripts", () => {
  assert.deepEqual(
    packageCommands("test", ["app", "library", "config"], packages),
    [
      ["run", "test:coverage", "--workspace=app"],
      ["run", "test", "--workspace=library"],
    ],
  );
  assert.deepEqual(packageCommands("test:e2e", ["app", "library"], packages), [
    ["run", "test:e2e", "--workspace=app"],
  ]);
  assert.deepEqual(
    packageCommands("test:mutation", ["app", "library", "config"], packages),
    [["run", "test:mutation", "--workspace=library"]],
  );
});

test("invalid and dedicated Docs selections fail closed", () => {
  for (const selected of [
    ["unknown"],
    ["app", "app"],
    "app",
    ["@sasakiuri/saika-docs"],
  ])
    assert.throws(() => packageCommands("test", selected, packages));
  assert.throws(() => packageCommands("unsupported", ["app"], packages));
});

test("npm runs through Node with separate arguments on every operating system", () => {
  const calls = [];
  const execute = (...args) => {
    calls.push(args);
    return { status: 0 };
  };
  const npmCli =
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  assert.equal(
    runCommands([["run", "test", "--workspace=app"]], npmCli, execute),
    0,
  );
  assert.deepEqual(calls, [
    [
      process.execPath,
      [npmCli, "run", "test", "--workspace=app"],
      { stdio: "inherit" },
    ],
  ]);
  assert.equal(runCommands([], npmCli, execute), 0);
  assert.equal(calls.length, 1);
});

test("failures stop subsequent commands and preserve the failure status", () => {
  let calls = 0;
  assert.equal(
    runCommands([["first"], ["second"]], "/npm.js", () => {
      calls++;
      return { status: 7 };
    }),
    7,
  );
  assert.equal(calls, 1);
  assert.equal(
    runCommands([["first"]], "/npm.js", () => ({ status: null })),
    1,
  );
  assert.throws(
    () =>
      runCommands([["first"]], "/npm.js", () => ({
        error: new Error("spawn failed"),
      })),
    /spawn failed/,
  );
  assert.throws(() => runCommands([], undefined), /npm run/);
});

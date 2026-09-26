// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { installCiDependencies } from "./install-ci-dependencies.mjs";

function setup(overrides = {}) {
  const calls = [];
  const children = [];
  const logs = [];
  const promise = installCiDependencies({
    platform: "win32",
    npmCli: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    execute(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      children.push(child);
      return child;
    },
    log: (message) => logs.push(message),
    ...overrides,
  });
  return { promise, calls, children, logs };
}

test("starts both installers immediately and succeeds only after both close", async () => {
  const run = setup();
  assert.equal(run.calls.length, 2);
  let complete = false;
  const completion = run.promise.then(() => {
    complete = true;
  });
  run.children[1].emit("close", 0, null);
  await setImmediate();
  assert.equal(complete, false);
  run.children[0].emit("close", 0, null);
  await completion;
  assert.equal(complete, true);
  assert.equal(
    run.logs.filter((line) => line.startsWith("Completed ")).length,
    2,
  );
});

test("uses Node and argument arrays for npm and PowerShell, preserving attached process tracking", async () => {
  const run = setup();
  assert.equal(run.calls[0].command, process.execPath);
  assert.deepEqual(run.calls[0].args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "ci",
  ]);
  assert.equal(run.calls[1].command, "powershell.exe");
  assert.deepEqual(run.calls[1].args, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    fileURLToPath(
      new URL("./install-windows-browser-deps.ps1", import.meta.url),
    ),
  ]);
  for (const { options } of run.calls) {
    assert.equal(options.cwd, fileURLToPath(new URL("../", import.meta.url)));
    assert.equal(options.shell, false);
    assert.equal(options.stdio, "inherit");
    assert.equal(options.detached, undefined);
    assert.equal(options.env, undefined);
  }
  for (const child of run.children) child.emit("close", 0, null);
  await run.promise;
});

for (const failing of [0, 1]) {
  test(`installer ${failing} failure still waits for its running sibling`, async () => {
    const run = setup();
    let finished = false;
    const completion = run.promise.then(
      () => {
        throw new Error("Expected failure");
      },
      (error) => {
        finished = true;
        return error;
      },
    );
    run.children[failing].emit("close", 7, null);
    await setImmediate();
    assert.equal(finished, false);
    run.children[1 - failing].emit("close", 0, null);
    const error = await completion;
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    assert.match(error.message, /exit 7/);
    assert.match(
      error.message,
      failing === 0 ? /npm ci/ : /Windows browser dependencies/,
    );
  });
}

test("reports both installer failures", async () => {
  const run = setup();
  const completion = assert.rejects(run.promise, (error) => {
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.message, /npm ci/);
    assert.match(error.message, /Windows browser dependencies/);
    return true;
  });
  run.children[0].emit("close", 1, null);
  run.children[1].emit("close", 2, null);
  await completion;
});

test("a spawn error cannot become success even when close reports zero", async () => {
  const run = setup();
  const completion = assert.rejects(
    run.promise,
    /Windows browser dependencies.*not found/,
  );
  run.children[1].emit("error", new Error("not found"));
  run.children[1].emit("close", 0, null);
  run.children[0].emit("close", 0, null);
  await completion;
  assert.equal(
    run.logs.filter((line) => line.startsWith("Completed ")).length,
    1,
  );
});

test("signal termination fails setup", async () => {
  const run = setup();
  const completion = assert.rejects(run.promise, /npm ci.*signal SIGTERM/);
  run.children[0].emit("close", null, "SIGTERM");
  run.children[1].emit("close", 0, null);
  await completion;
});

test("a synchronous spawn exception still starts and joins the other installer", async () => {
  const child = new EventEmitter();
  let starts = 0;
  const run = setup({
    execute() {
      if (++starts === 1) throw new Error("cannot spawn");
      return child;
    },
  });
  assert.equal(starts, 2);
  const completion = assert.rejects(
    run.promise,
    /npm ci could not start: cannot spawn/,
  );
  child.emit("close", 0, null);
  await completion;
});

test("invalid platform and missing npm CLI fail before starting any process", async () => {
  for (const [overrides, expected] of [
    [{ platform: "linux" }, /requires Windows/],
    [{ platform: "darwin" }, /requires Windows/],
    [{ npmCli: "" }, /npm run ci:install/],
  ]) {
    const run = setup(overrides);
    await assert.rejects(run.promise, expected);
    assert.equal(run.calls.length, 0);
  }
});

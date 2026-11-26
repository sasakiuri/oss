// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { resolveConsumerPackage, upstreamRoot } from "../runtime.mjs";

function writePackage(directory, manifest) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "package.json"), JSON.stringify(manifest));
  return directory;
}

test("packages resolve when their exports hide the manifest and CommonJS entry", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "repository-tooling-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = writePackage(resolve(root, "packages/app"), { name: "app" });
  const esmOnly = writePackage(resolve(root, "node_modules/@scope/esm-only"), {
    name: "@scope/esm-only",
    exports: { ".": { import: "./index.mjs" } },
  });
  const builtinName = writePackage(resolve(root, "node_modules/events"), {
    name: "events",
  });
  const linked = writePackage(resolve(root, "packages/linked"), {
    name: "linked",
  });
  symlinkSync(
    "../packages/linked",
    resolve(root, "node_modules/linked"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const require = createRequire(resolve(app, "package.json"));
  for (const request of ["@scope/esm-only/package.json", "@scope/esm-only"])
    assert.throws(() => require.resolve(request), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  assert.equal(
    resolveConsumerPackage("@scope/esm-only", app),
    realpathSync(esmOnly),
  );
  assert.equal(
    resolveConsumerPackage("events", app),
    realpathSync(builtinName),
  );
  assert.equal(resolveConsumerPackage("linked", app), realpathSync(linked));
  assert.throws(
    () => resolveConsumerPackage("missing", app),
    /Cannot locate package: missing/,
  );
});

test("depcruise runs the installed dependency-cruiser", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"),
      "run",
      "depcruise",
      "--version",
    ],
    { cwd: upstreamRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    JSON.parse(
      readFileSync(
        resolve(upstreamRoot, "node_modules/dependency-cruiser/package.json"),
      ),
    ).version,
  );
});

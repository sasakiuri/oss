// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

import {
  changedFiles,
  coverageScope,
  hasChangedRuntime,
  main,
  measureChangedCoverage,
} from "./coverage-diff-check.mjs";

const require = createRequire(
  new URL("../packages/saika-rules/package.json", import.meta.url),
);
const ts = require("typescript");

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "oss-diff-coverage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = resolve(root, "packages/example");
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, "src/code.ts");
  const report = resolve(directory, "coverage-final.json");
  const scope = {
    directory,
    report,
    typescript: ts,
    includes: (path) => path.startsWith(`${directory}/src/`),
  };
  const source =
    "export const first = 1; const sameLine = 2;\nexport const second = 3;\n";
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  const changed = new Map([["packages/example/src/code.ts", new Set([1, 2])]]);
  const entry = {
    path: file,
    statementMap: {
      0: { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } },
      1: { start: { line: 1, column: 24 }, end: { line: 1, column: 43 } },
      2: { start: { line: 2, column: 0 }, end: { line: 2, column: 24 } },
    },
    s: { 0: 1, 1: 0, 2: 0 },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  };
  const save = (value = { [file]: entry }) =>
    writeFileSync(report, JSON.stringify(value));
  return { root, directory, file, report, scope, changed, entry, save };
}

test("uses Istanbul line semantics, counting multiple statements on a line once", (t) => {
  const f = fixture(t);
  f.save();
  assert.deepEqual(measureChangedCoverage(f), {
    covered: 1,
    total: 2,
    missed: ["packages/example/src/code.ts:2"],
    files: 1,
  });
});

test("missing, empty, malformed and foreign coverage cannot pass changed runtime files", (t) => {
  const f = fixture(t);
  assert.throws(() => measureChangedCoverage(f), /ENOENT/u);
  for (const invalid of [
    {},
    { [f.file]: { ...f.entry, s: {}, statementMap: {} } },
  ]) {
    f.save(invalid);
    assert.throws(
      () => measureChangedCoverage(f),
      /missing coverage measurements/u,
    );
  }
  writeFileSync(f.report, "not JSON");
  assert.throws(() => measureChangedCoverage(f), SyntaxError);
  for (const invalid of [
    null,
    [],
    { [f.file]: {} },
    { "/other/checkout/code.ts": f.entry },
  ]) {
    f.save(invalid);
    assert.throws(() => measureChangedCoverage(f));
  }
});

test("a partly populated report fails when a newly added runtime file is absent", (t) => {
  const f = fixture(t);
  f.save();
  const added = resolve(f.directory, "src/added.ts");
  writeFileSync(added, "export const untested = () => 1;\n");
  f.changed.set("packages/example/src/added.ts", new Set([1]));
  assert.throws(
    () => measureChangedCoverage(f),
    /added.ts: changed runtime file is missing/u,
  );
});

test("invalid counters and statement locations fail instead of losing executable lines", (t) => {
  const f = fixture(t);
  for (const count of [-1, "1", null]) {
    f.save({ [f.file]: { ...f.entry, s: { ...f.entry.s, 0: count } } });
    assert.throws(
      () => measureChangedCoverage(f),
      /invalid statement counters/u,
    );
  }
  f.save({ [f.file]: { ...f.entry, s: { 3: 1, 4: 1, 5: 1 } } });
  assert.throws(() => measureChangedCoverage(f), /invalid statement counters/u);
  f.save({
    [f.file]: {
      ...f.entry,
      statementMap: {
        ...f.entry.statementMap,
        0: { start: { line: 0 }, end: { line: 1 } },
      },
    },
  });
  assert.throws(() => measureChangedCoverage(f), /invalid statement counters/u);
});

test("coverage exclusions and partial scope do not require unrelated reports", (t) => {
  const f = fixture(t);
  f.scope.includes = () => false;
  assert.deepEqual(measureChangedCoverage(f), {
    covered: 0,
    total: 0,
    missed: [],
    files: 0,
  });
  f.scope.includes = () => true;
  f.changed.clear();
  assert.deepEqual(measureChangedCoverage(f), {
    covered: 0,
    total: 0,
    missed: [],
    files: 0,
  });
});

test("erased types, re-export barrels and comment-only changes do not require measurements", (t) => {
  const f = fixture(t);
  for (const source of [
    "export interface Example { value: number }\nexport type Count = number;\n",
    "// A module reserved for a later implementation.\n",
    "import type { Example } from './example';\nexport type Other = Example;\n",
    "export { value } from './example';\n",
  ]) {
    writeFileSync(f.file, source);
    assert.deepEqual(measureChangedCoverage(f), {
      covered: 0,
      total: 0,
      missed: [],
      files: 0,
    });
  }
  writeFileSync(
    f.file,
    "// Documentation change\n\nexport const runtime = 1;\n",
  );
  assert.deepEqual(measureChangedCoverage(f), {
    covered: 0,
    total: 0,
    missed: [],
    files: 0,
  });
  assert.equal(
    hasChangedRuntime(
      "export const url = 'https://example.test';",
      f.file,
      new Set([1]),
      ts,
    ),
    true,
  );
  assert.equal(
    hasChangedRuntime(
      "export const view = <div>Text</div>;",
      "view.tsx",
      new Set([1]),
      ts,
    ),
    true,
  );
});

test("unchanged executable lines are not counted toward the patch threshold", (t) => {
  const f = fixture(t);
  f.save();
  f.changed.set("packages/example/src/code.ts", new Set([2]));
  assert.deepEqual(measureChangedCoverage(f), {
    covered: 0,
    total: 1,
    missed: ["packages/example/src/code.ts:2"],
    files: 1,
  });
});

test("reads rename destinations and unusual paths while ignoring pure deletions and renames", (t) => {
  const f = fixture(t);
  const git = (...args) =>
    execFileSync("git", args, { cwd: f.root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Coverage test");
  git("config", "user.email", "coverage@example.test");
  git("config", "core.autocrlf", "false");
  git("config", "commit.gpgsign", "false");
  const original = "packages/example/src/old.ts";
  writeFileSync(
    resolve(f.root, original),
    Array.from(
      { length: 20 },
      (_, i) => `export const value${i} = ${i};\n`,
    ).join(""),
  );
  writeFileSync(
    resolve(f.directory, "src/deleted.ts"),
    "export const removed = 1;\n",
  );
  writeFileSync(
    resolve(f.directory, "src/rename-only.ts"),
    "export const untouched = 2;\n",
  );
  git("add", ".");
  git("commit", "-qm", "Base");
  const base = git("rev-parse", "HEAD");
  const destination = 'packages/example/src/renamed space " \u96ea\n.ts';
  renameSync(resolve(f.root, original), resolve(f.root, destination));
  writeFileSync(
    resolve(f.root, destination),
    Array.from(
      { length: 20 },
      (_, i) => `export const value${i} = ${i === 10 ? 99 : i};\n`,
    ).join(""),
  );
  rmSync(resolve(f.directory, "src/deleted.ts"));
  renameSync(
    resolve(f.directory, "src/rename-only.ts"),
    resolve(f.directory, "src/renamed-only.ts"),
  );
  writeFileSync(
    resolve(f.directory, "src/new.ts"),
    "export const added = 1;\n",
  );
  git("add", ".");
  git("commit", "-qm", "Changes");
  assert.deepEqual(
    changedFiles(f.root, base),
    new Map([
      ["packages/example/src/new.ts", new Set([1])],
      [destination, new Set([11])],
    ]),
  );
  // Changes made only on the base branch are outside this PR's merge-base diff.
  const head = git("rev-parse", "HEAD");
  git("checkout", "-qb", "base-moved", base);
  writeFileSync(
    resolve(f.directory, "src/base-only.ts"),
    "export const baseOnly = 1;\n",
  );
  git("add", ".");
  git("commit", "-qm", "Base advanced");
  assert.deepEqual(
    changedFiles(f.root, "HEAD", head),
    changedFiles(f.root, base, head),
  );
});

test("uses each workspace's resolved Vitest scope, including Docs' deliberate partial coverage", async () => {
  const root = resolve(import.meta.dirname, "..");
  const docs = resolve(root, "packages/saika-docs");
  const scope = await coverageScope(docs);
  assert.equal(scope.includes(resolve(docs, "src/shared/api/auth.ts")), true);
  assert.equal(
    scope.includes(resolve(docs, "src/entities/document/parse.ts")),
    true,
  );
  assert.equal(
    scope.includes(resolve(docs, "src/features/search/search-index.ts")),
    true,
  );
  assert.equal(
    scope.includes(resolve(docs, "src/shared/telemetry/redact.ts")),
    true,
  );
  assert.equal(scope.includes(resolve(docs, "src/app/page.tsx")), false);
  assert.equal(
    scope.includes(resolve(docs, "tests/unit/auth-contract.test.ts")),
    false,
  );
  assert.equal(
    scope.includes(
      resolve(root, "packages/saika-rules/src/ShotResultProjection.ts"),
    ),
    false,
  );
  assert.equal(scope.report, resolve(docs, "coverage/coverage-final.json"));
  const rules = await coverageScope(resolve(root, "packages/saika-rules"));
  assert.equal(
    rules.includes(
      resolve(root, "packages/saika-rules/src/ShotResultProjection.ts"),
    ),
    true,
  );
  assert.equal(
    rules.includes(resolve(root, "packages/saika-rules/src/types.d.ts")),
    false,
  );
  for (const [name, source, excluded] of [
    ["saika-protocol", "src/QualificationRecovery.ts", "src/types.d.ts"],
    ["saika-lane", "src/main/index.ts", "src/types.ts"],
    ["saika-director", "src/main/index.ts", "src/types.ts"],
    ["nilay-about", "lib/utils.ts", "lib/utils.test.ts"],
    ["nilay-knowledge", "lib/utils.ts", "lib/utils.test.ts"],
  ]) {
    const directory = resolve(root, "packages", name);
    const workspaceScope = await coverageScope(directory);
    assert.equal(
      workspaceScope.includes(resolve(directory, source)),
      true,
      name,
    );
    assert.equal(
      workspaceScope.includes(resolve(directory, excluded)),
      false,
      name,
    );
  }
});

test("requires a base and a valid threshold instead of silently disabling the gate", async () => {
  await assert.rejects(main([]), /Usage/u);
  for (const minimum of ["", "NaN", "-1", "101"]) {
    await assert.rejects(
      main(["--base", "HEAD", `--minimum=${minimum}`]),
      /--minimum must/u,
    );
  }
});

test("the CLI enforces the threshold and missing reports for a committed workspace change", (t) => {
  const f = fixture(t);
  const repository = resolve(import.meta.dirname, "..");
  symlinkSync(
    resolve(repository, "node_modules"),
    resolve(f.root, "node_modules"),
    "junction",
  );
  writeFileSync(
    resolve(f.root, ".gitignore"),
    "node_modules/\ncoverage-final.json\n",
  );
  writeFileSync(
    resolve(f.directory, "package.json"),
    JSON.stringify({
      name: "@coverage/example",
      type: "module",
      scripts: { "test:coverage": "vitest run --coverage" },
    }),
  );
  writeFileSync(
    resolve(f.directory, "vitest.config.mjs"),
    'export default { test: { coverage: { include: ["src/**/*.ts"], reporter: ["json"], reportsDirectory: "." } } };\n',
  );
  mkdirSync(resolve(f.root, "packages/reserved"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: f.root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Coverage test");
  git("config", "user.email", "coverage@example.test");
  git("config", "core.autocrlf", "false");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-qm", "Base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(
    f.file,
    "export const first = 10; const sameLine = 20;\nexport const second = 30;\n",
  );
  git("add", ".");
  git("commit", "-qm", "Changed source");
  const run = (...extra) =>
    spawnSync(
      process.execPath,
      [
        resolve(repository, "scripts/coverage-diff-check.mjs"),
        "--base",
        base,
        "--packages",
        '["@coverage/example"]',
        ...extra,
      ],
      { cwd: f.root, encoding: "utf8" },
    );
  let result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /ENOENT/u);
  f.save();
  result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /50.00% \(1\/2\); required 80%/u);
  assert.match(result.stderr, /Uncovered: packages\/example\/src\/code.ts:2/u);
  result = run("--minimum", "50");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  f.save({ [f.file]: { ...f.entry, s: { 0: 1, 1: 0, 2: 1 } } });
  result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /100.00%/u);
});

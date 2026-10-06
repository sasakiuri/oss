// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { createGitHubTemplates, createLabels, syncLabels } from "../github.mjs";
import { upstreamRoot } from "../runtime.mjs";

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "repository-github-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = resolve(directory, "consumer");
  mkdirSync(resolve(root, "packages/private.app"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  writeFileSync(
    resolve(root, "packages/private.app/package.json"),
    JSON.stringify({ name: "private-app", private: true }),
  );
  mkdirSync(resolve(root, "packages/infra"));
  writeFileSync(resolve(root, "packages/infra/main.tf"), "");
  return root;
}

const prepare = (root) =>
  spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "prepare"],
    {
      cwd: root,
      env: { ...process.env, CI: "", HUSKY: "0" },
      encoding: "utf8",
    },
  );

test("upstream templates already match their derived form", () => {
  for (const [filename, contents] of createGitHubTemplates(upstreamRoot))
    assert.equal(
      readFileSync(resolve(upstreamRoot, filename), "utf8"),
      contents,
      filename,
    );
});

test("consumer templates list commit scopes and omit public-only content", (t) => {
  const root = fixture(t);
  const templates = createGitHubTemplates(root);
  for (const name of ["2_feature_request.yml", "3_bug_report.yml"])
    assert.match(
      templates.get(`.github/ISSUE_TEMPLATE/${name}`),
      /\n {6}options:\n {8}- infra\n {8}- private-app\n {8}- Repository \/ CI \/ development environment\n {8}- Multiple packages \/ unsure\n {4}validations:\n/,
    );
  assert.equal(
    templates.get(".github/ISSUE_TEMPLATE/config.yml"),
    "blank_issues_enabled: false\n",
  );
  assert.doesNotMatch(
    templates.get(".github/PULL_REQUEST_TEMPLATE.md"),
    /changeset/,
  );
  mkdirSync(resolve(root, ".changeset"));
  writeFileSync(resolve(root, ".changeset/config.json"), "{}");
  assert.equal(
    createGitHubTemplates(root).get(".github/PULL_REQUEST_TEMPLATE.md"),
    readFileSync(
      resolve(upstreamRoot, ".github/PULL_REQUEST_TEMPLATE.md"),
      "utf8",
    ),
  );
});

test("prepare writes shared templates and rejects unmanaged issue templates", (t) => {
  const root = fixture(t);
  const result = prepare(root);
  assert.equal(result.status, 0, result.stderr);
  for (const [filename, contents] of createGitHubTemplates(root))
    assert.equal(readFileSync(resolve(root, filename), "utf8"), contents);
  writeFileSync(
    resolve(root, ".github/ISSUE_TEMPLATE/4_local.yml"),
    "name: x\n",
  );
  const rejected = prepare(root);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Remove or upstream: .*4_local\.yml/);
});

test("labels combine shared definitions with one label per commit scope", (t) => {
  const root = fixture(t);
  const shared = [
    { name: "Cat: Bug 🐛", color: "d73a4a", description: "Bug reports" },
  ];
  assert.deepEqual(createLabels(root, shared), [
    ...shared,
    {
      name: "Package: infra 📦",
      color: "c5def5",
      description: "infra package",
    },
    {
      name: "Package: private-app 📦",
      color: "c5def5",
      description: "private-app package",
    },
  ]);
  assert.throws(
    () =>
      createLabels(root, [
        { name: "Package: shop 📦", color: "ffffff", description: "" },
      ]),
    /Package labels derive from packages/,
  );
  assert.throws(
    () =>
      createLabels(root, [...shared, { ...shared[0], name: "cat: bug 🐛" }]),
    /Duplicate label/,
  );
  const upstream = createLabels(upstreamRoot).map((label) => label.name);
  assert.ok(upstream.includes("Package: repo-tooling 📦"));
  assert.ok(upstream.includes("Status: Needs Triage 💡"));
});

test("label sync changes only managed labels and supports dry runs", (t) => {
  const root = fixture(t);
  const desired = createLabels(root);
  const [first, second] = desired;
  const current = [
    { ...first, color: first.color.toUpperCase() },
    { ...second, description: "Outdated" },
    { name: "Cat: Enhancement 💪", color: "ffffff", description: "" },
    { name: "Package: Shop 📦", color: "ffffff", description: "" },
    { name: "dependencies", color: "0366d6", description: "Dependabot" },
  ];
  const run = (dryRun) => {
    const calls = [];
    const gh = (cwd, arguments_) => {
      assert.equal(cwd, root);
      calls.push(arguments_);
      return arguments_[1] === "list" ? JSON.stringify(current) : "";
    };
    t.mock.method(console, "log", () => {});
    const operations = syncLabels(root, { dryRun, gh });
    return { calls: calls.slice(1), operations };
  };
  const applied = run(false);
  assert.deepEqual(applied.operations, [
    ["update", second.name],
    ...desired.slice(2).map((label) => ["create", label.name]),
    ["delete", "Cat: Enhancement 💪"],
    ["delete", "Package: Shop 📦"],
  ]);
  assert.deepEqual(applied.calls[0], [
    "label",
    "edit",
    second.name,
    "--color",
    second.color,
    "--description",
    second.description,
  ]);
  assert.deepEqual(applied.calls.at(-1), [
    "label",
    "delete",
    "Package: Shop 📦",
    "--yes",
  ]);
  assert.equal(applied.calls.length, applied.operations.length);
  const planned = run(true);
  assert.deepEqual(planned.operations, applied.operations);
  assert.deepEqual(planned.calls, []);
});

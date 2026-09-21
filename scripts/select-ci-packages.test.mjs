// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  planForRevision,
  readGitWorkspaces,
  selectCiPackages,
} from "./select-ci-packages.mjs";

const current = readGitWorkspaces("HEAD");
const name = (short) => `@sasakiuri/${short}`;
const select = (files, packages = current, previous = packages) =>
  selectCiPackages(files, packages, previous);
const names = (plan) =>
  plan.packages.map((item) => item.replace("@sasakiuri/", "")).sort();

test("an application change selects only that application", () => {
  const plan = select(["packages/saika-lane/src/main.ts"]);
  assert.deepEqual(names(plan), ["saika-lane"]);
  assert.equal(plan.docs, false);
  assert.equal(plan.build, true);
  assert.equal(plan.electron, true);
  assert.equal(plan.text, false);
  assert.equal(plan.infrastructure, false);
  assert.deepEqual(plan.os, [
    "ubuntu-latest",
    "windows-latest",
    "macos-latest",
  ]);
});

test("shared libraries select their transitive consumers", () => {
  assert.deepEqual(names(select(["packages/saika-protocol/src/index.ts"])), [
    "saika-director",
    "saika-lane",
    "saika-protocol",
    "saika-vista",
  ]);
  assert.deepEqual(names(select(["packages/saika-rules/src/index.ts"])), [
    "saika-director",
    "saika-lane",
    "saika-rules",
  ]);
});

test("Electron unit tests retain all runners without an E2E script", () => {
  const packages = [
    {
      name: "desktop",
      directory: "packages/desktop",
      scripts: { test: "test" },
      devDependencies: { electron: "*" },
    },
  ];
  const plan = select(["packages/desktop/test.ts"], packages);
  assert.equal(plan.electron, true);
  assert.equal(plan.build, true);
  assert.deepEqual(plan.os, [
    "ubuntu-latest",
    "windows-latest",
    "macos-latest",
  ]);
});

test("development configuration dependencies include their consumers", () => {
  const plan = select(["packages/typescript-config/base.json"]);
  assert.equal(plan.docs, true);
  for (const pkg of [
    "saika-director",
    "saika-lane",
    "saika-vista",
    "saika-protocol",
  ])
    assert.ok(plan.packages.includes(name(pkg)));
  const lighthouseConfig = select(["packages/lighthouse-config/index.mjs"]);
  assert.deepEqual(names(lighthouseConfig), [
    "lighthouse-config",
    "nilay-knowledge",
  ]);
  assert.equal(lighthouseConfig.docs, true);
  assert.equal(lighthouseConfig.build, true);
  assert.equal(lighthouseConfig.electron, false);
  assert.deepEqual(lighthouseConfig.os, ["ubuntu-latest"]);
});

test("new website Markdown and assets get Linux-only build and tests", () => {
  const packages = [
    ...current.filter((pkg) => pkg.name !== name("nilay-knowledge")),
    {
      name: name("nilay-knowledge"),
      directory: "packages/nilay-knowledge",
      scripts: {
        build: "next build",
        test: "vitest run",
        typecheck: "tsc",
        lint: "eslint .",
      },
      devDependencies: { [name("typescript-config")]: "*" },
    },
  ];
  for (const file of ["content/articles/hello.md", "public/example.png"]) {
    const plan = select([`packages/nilay-knowledge/${file}`], packages);
    assert.deepEqual(names(plan), ["nilay-knowledge"]);
    assert.equal(plan.ci, true);
    assert.equal(plan.build, true);
    assert.equal(plan.docs, false);
    assert.equal(plan.electron, false);
    assert.deepEqual(plan.os, ["ubuntu-latest"]);
  }
});

test("Docs changes use the dedicated workflow without application jobs", () => {
  for (const file of [
    "packages/saika-docs/content/page.md",
    ".github/workflows/docs.yml",
    "docker/pdf/Dockerfile",
  ]) {
    const plan = select([file]);
    assert.deepEqual(plan.packages, []);
    assert.equal(plan.docs, true);
    assert.equal(plan.ci, false);
    assert.equal(plan.build, false);
  }
});

test("shared inputs and unknown workspace paths select all packages", () => {
  const expected = current
    .filter((pkg) => pkg.name !== name("saika-docs"))
    .map((pkg) => pkg.name)
    .sort();
  for (const file of [
    "package-lock.json",
    "package.json",
    "turbo.json",
    "eslint.config.mjs",
    ".editorconfig",
    ".github/workflows/ci.yml",
    ".github/actions/setup-node/action.yml",
    "scripts/run-package-ci.mjs",
    "packages/unknown/src/index.ts",
  ]) {
    const plan = select([file]);
    assert.deepEqual([...plan.packages].sort(), expected, file);
    assert.equal(plan.docs, true, file);
  }
});

test("repository documentation and unrelated workflows skip package jobs", () => {
  const plan = select([
    "README.md",
    "docs/adr/example.md",
    ".github/settings.yml",
    ".github/workflows/security.yml",
    ".github/workflows/dependabot-auto-merge.yml",
  ]);
  assert.deepEqual(plan.packages, []);
  assert.equal(plan.ci, false);
  assert.equal(plan.build, false);
  assert.equal(plan.docs, false);
  assert.equal(plan.text, true);
  assert.equal(plan.infrastructure, true);
});

test("text and policy tooling changes do not rebuild applications", () => {
  for (const file of [
    "README.md",
    "scripts/lint-text.mjs",
    "scripts/lint-text.test.mjs",
    "scripts/pre-release-check.sh",
    "scripts/pre-release-check.test.mjs",
    "scripts/dependabot-policy.test.mjs",
    ".github/dependabot.yml",
    ".github/workflows/dependabot-auto-merge.yml",
    ".textlintignore",
  ]) {
    const plan = select([file]);
    assert.equal(plan.text, true, file);
    assert.equal(plan.ci, false, file);
    assert.equal(plan.build, false, file);
    assert.equal(plan.docs, false, file);
  }
  assert.equal(select(["README.md"]).infrastructure, false);
  assert.equal(select(["scripts/lint-text.test.mjs"]).infrastructure, false);
  assert.equal(select(["scripts/pre-release-check.sh"]).infrastructure, true);
});

test("infrastructure checks follow workflows, tools, shell and Docker inputs", () => {
  for (const file of [
    ".github/workflows/codeql.yml",
    ".github/actions/setup-node/action.yml",
    ".github/actionlint.yaml",
    ".husky/pre-commit",
    "scripts/pre-release-check.sh",
    "scripts/lint-infra.mjs",
    "docker/pdf/Dockerfile",
    "Dockerfile.test",
    ".shellcheckrc",
    ".hadolint.yaml",
    "zizmor.yml",
    ".gitignore",
    ".gitattributes",
  ])
    assert.equal(select([file]).infrastructure, true, file);
  const plan = select(["scripts/lint-infra.mjs"]);
  assert.equal(plan.text, false);
  assert.equal(plan.ci, false);
  assert.equal(plan.docs, false);
  assert.equal(select([".github/workflows/codeql.yml"]).text, false);
});

test("text checks include configuration and dependency changes", () => {
  for (const file of [
    ".textlintrc.json",
    "packages/saika-docs/.textlintrc.cjs",
    "package.json",
    "package-lock.json",
    "packages/saika-docs/package.json",
    "scripts/check-english-only.mjs",
    ".github/workflows/ci.yml",
    ".github/actions/setup-node/action.yml",
  ])
    assert.equal(select([file]).text, true, file);
  assert.equal(select([".textlintrc.json"]).docs, true);
});

test("narrow tooling changes preserve application and unknown-input coverage", () => {
  const plan = select([
    "scripts/lint-text.test.mjs",
    "packages/saika-lane/src/main.ts",
  ]);
  assert.deepEqual(names(plan), ["saika-lane"]);
  assert.equal(plan.text, true);
  assert.equal(plan.build, true);
  assert.equal(plan.electron, true);
  const unknown = select(["scripts/new-shared-tool.mjs"]);
  assert.deepEqual(unknown.packages, select(["package.json"]).packages);
  assert.equal(unknown.docs, true);
});

test("deleted and renamed packages retain consumers from the previous graph", () => {
  const previous = [
    { name: "old", directory: "packages/old" },
    {
      name: "middle",
      directory: "packages/middle",
      optionalDependencies: { old: "*" },
    },
    {
      name: "app",
      directory: "packages/app",
      peerDependencies: { middle: "*" },
      scripts: { test: "test" },
    },
  ];
  const next = [
    { name: "new", directory: "packages/new" },
    {
      name: "middle",
      directory: "packages/middle",
      optionalDependencies: { new: "*" },
    },
    previous[2],
  ];
  assert.deepEqual(
    select(
      ["packages/old/package.json", "packages/new/package.json"],
      next,
      previous,
    ).packages,
    ["app", "middle", "new"],
  );
  assert.deepEqual(
    select(["packages/old/package.json"], next.slice(1), previous).packages,
    ["app", "middle"],
  );
});

test("Git selection covers multi-commit pushes, renames, new refs, and missing bases", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "ci-selection-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const put = (file, value) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), value);
  };
  git("init", "-q");
  git("config", "user.email", "ci@example.test");
  git("config", "user.name", "CI Test");
  put("package.json", JSON.stringify({ workspaces: ["packages/*"] }));
  for (const pkg of ["one", "two", "three"])
    put(
      `packages/${pkg}/package.json`,
      JSON.stringify({ name: pkg, scripts: { test: "test" } }),
    );
  put("packages/one/content.md", "original");
  git("add", ".");
  git("commit", "-qm", "initial");
  const base = git("rev-parse", "HEAD");
  put("packages/one/content.md", "changed");
  git("add", ".");
  git("commit", "-qm", "first");
  put("packages/two/new.md", "another");
  git("add", ".");
  git("commit", "-qm", "second");
  const head = git("rev-parse", "HEAD");
  assert.deepEqual(planForRevision(base, head, cwd).packages, ["one", "two"]);
  git("mv", "packages/one/content.md", "packages/three/content.md");
  git("commit", "-qm", "rename");
  const renamed = git("rev-parse", "HEAD");
  assert.deepEqual(planForRevision(head, renamed, cwd).packages, [
    "one",
    "three",
  ]);
  assert.deepEqual(planForRevision("0".repeat(40), renamed, cwd).packages, [
    "one",
    "three",
    "two",
  ]);
  assert.equal(planForRevision("0".repeat(40), renamed, cwd).text, true);
  assert.equal(
    planForRevision("0".repeat(40), renamed, cwd).infrastructure,
    true,
  );
  assert.throws(
    () => planForRevision(undefined, renamed, cwd),
    /explicit base/,
  );
  assert.throws(() => planForRevision("f".repeat(40), renamed, cwd));
  put("package.json", JSON.stringify({ workspaces: ["apps/*"] }));
  git("add", ".");
  git("commit", "-qm", "unsupported layout");
  assert.throws(
    () => readGitWorkspaces(git("rev-parse", "HEAD"), cwd),
    /workspace patterns/,
  );
});

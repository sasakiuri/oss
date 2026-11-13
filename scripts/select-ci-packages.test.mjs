// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  affectedByLockfile,
  e2eMatrix,
  platformRunners,
  planForRevision,
  planForEvent,
  readGitWorkspaces,
  selectCiPackages,
} from "./select-ci-packages.mjs";

const current = readGitWorkspaces("HEAD");
const name = (short) => `@sasakiuri/${short}`;
const select = (files, packages = current, previous = packages) =>
  selectCiPackages(files, packages, previous);
const names = (plan) =>
  plan.packages.map((item) => item.replace("@sasakiuri/", "")).sort();

test("label and Knowledge link calls retain their previous path filters", () => {
  for (const file of [
    ".github/labels.json",
    ".github/workflows/sync-labels.yml",
    "packages/new/file.ts",
  ])
    assert.equal(select([file]).syncLabels, true, file);
  for (const file of [
    "packages/nilay-knowledge/content/article.md",
    "packages/nilay-knowledge/public/icon.svg",
    "packages/nilay-knowledge/app/page.tsx",
    "packages/nilay-knowledge/lib/content/index.ts",
    "packages/nilay-knowledge/lib/config.ts",
    "packages/nilay-knowledge/scripts/check-links.ts",
    "packages/nilay-knowledge/scripts/link-check.ts",
    "packages/nilay-knowledge/__tests__/scripts/link-check.test.ts",
    "packages/nilay-knowledge/lychee.toml",
    "packages/nilay-knowledge/package.json",
    "package-lock.json",
    ".github/actions/setup-node/action.yml",
    ".github/workflows/knowledge-links.yml",
  ])
    assert.equal(select([file]).knowledgeLinks, true, file);
  for (const file of [
    "README.md",
    "packages/nilay-knowledge/lib/other.ts",
    "packages/nilay-knowledge/scripts/nested/links.ts",
  ])
    assert.equal(select([file]).knowledgeLinks, false, file);
  for (const file of [
    "package-lock.json",
    "README.md",
    ".github/workflows/ci.yml",
  ])
    assert.equal(select([file]).syncLabels, false, file);
});

test("manual and scheduled checks cover every workspace even after cancelled runs", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  for (const event of ["workflow_dispatch", "schedule"]) {
    const plan = planForEvent(event, { before: head }, head);
    assert.equal(plan.docs, true);
    assert.equal(plan.knowledge, true);
    assert.equal(plan.about, true);
    assert.equal(plan.infrastructure, true);
    assert.equal(plan.knip, true);
    assert.equal(plan.text, true);
    assert.ok(plan.packages.includes(name("saika-lane")));
    assert.ok(plan.packages.includes(name("saika-director")));
  }
  assert.equal(
    planForEvent(
      "pull_request",
      { pull_request: { base: { sha: head } } },
      head,
    ).ci,
    false,
  );
  assert.throws(
    () => planForEvent("unknown", {}, head),
    /Unsupported CI event/,
  );
});

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

test("a zero-before push enables every full-verification scope", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const plan = planForEvent("push", { before: "0".repeat(40) }, head);
  const dedicated = ["saika-docs", "nilay-knowledge", "nilay-about"].map(name);
  assert.deepEqual(
    plan.packages,
    current
      .filter((pkg) => !dedicated.includes(pkg.name))
      .map((pkg) => pkg.name)
      .sort(),
  );
  for (const flag of [
    "text",
    "infrastructure",
    "knip",
    "ci",
    "build",
    "docs",
    "electron",
    "knowledge",
    "about",
    "e2e",
  ])
    assert.equal(plan[flag], true, flag);
  assert.deepEqual(plan.os, [
    "ubuntu-latest",
    "windows-latest",
    "macos-latest",
  ]);
  assert.equal(plan.e2eMatrix.length, 4);
  assert.equal(plan.e2eMatrix.flatMap((job) => job.suites).length, 10);
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
  assert.deepEqual(names(lighthouseConfig), ["lighthouse-config"]);
  assert.equal(lighthouseConfig.knowledge, true);
  assert.equal(lighthouseConfig.docs, true);
  assert.equal(lighthouseConfig.build, false);
  assert.equal(lighthouseConfig.electron, false);
  assert.deepEqual(lighthouseConfig.os, ["ubuntu-latest"]);
});

test("site changes use their dedicated workflow without duplicate application jobs", () => {
  for (const site of ["knowledge", "about"]) {
    for (const file of [
      "content/articles/hello.md",
      "public/example.png",
      "package.json",
    ]) {
      const plan = select([`packages/nilay-${site}/${file}`]);
      assert.deepEqual(plan.packages, []);
      assert.equal(plan[site], true);
      assert.equal(plan[site === "knowledge" ? "about" : "knowledge"], false);
      assert.equal(plan.ci, false);
      assert.equal(plan.build, false);
      assert.equal(plan.docs, false);
      assert.equal(plan.electron, false);
      assert.deepEqual(plan.e2eMatrix, []);
    }
  }
  const workflow = select([".github/workflows/web-ci.yml"]);
  assert.equal(workflow.knowledge, true);
  assert.equal(workflow.about, true);
  assert.deepEqual(workflow.packages, []);
  assert.equal(workflow.infrastructure, true);
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
    .filter(
      (pkg) =>
        !["saika-docs", "nilay-knowledge", "nilay-about"]
          .map(name)
          .includes(pkg.name),
    )
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
    assert.equal(plan.knowledge, true, file);
    assert.equal(plan.about, true, file);
  }
});

test("repository documentation and unrelated workflows skip package jobs", () => {
  const plan = select([
    "README.md",
    "docs/adr/example.md",
    ".github/settings.yml",
    ".github/workflows/scorecard.yml",
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

test("unused-code configuration runs its own check without rebuilding applications", () => {
  const plan = select(["knip.config.ts"]);
  assert.equal(plan.knip, true);
  assert.deepEqual(plan.packages, []);
  for (const job of ["ci", "build", "docs", "e2e", "knowledge", "text"])
    assert.equal(plan[job], false, job);
  const mixed = select([
    "knip.config.ts",
    "packages/nilay-news/src/application.ts",
  ]);
  assert.equal(mixed.knip, true);
  assert.deepEqual(names(mixed), ["nilay-news"]);
  assert.equal(mixed.build, true);
  assert.equal(mixed.docs, false);
  assert.equal(mixed.e2e, true);
  assert.deepEqual(mixed.os, ["ubuntu-latest"]);
  assert.equal(select(["packages/nilay-news/src/application.ts"]).knip, false);
});

test("News builds and tests remain on Linux", () => {
  for (const app of ["nilay-news"]) {
    const plan = select([`packages/${app}/package.json`]);
    assert.deepEqual(names(plan), [app]);
    assert.deepEqual(plan.packageMatrix, [
      { os: "ubuntu-latest", packages: [name(app)] },
    ]);
    assert.equal(plan.build, true);
    assert.deepEqual(plan.e2eMatrix, [
      {
        os: "ubuntu-latest",
        electron: false,
        timeoutMinutes: 30,
        suites: [
          {
            os: "ubuntu-latest",
            suite: 0,
            package: name(app),
            directory: `packages/${app}`,
            shard: 1,
            shards: 1,
            electron: false,
            installBrowsers: true,
          },
        ],
      },
    ]);
    assert.ok(plan.e2eMatrix.every((row) => row.os === "ubuntu-latest"));
  }
});

test("infrastructure checks follow workflows, tools, shell and Docker inputs", () => {
  for (const file of [
    ".github/workflows/periodic.yml",
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
  assert.equal(select([".github/workflows/periodic.yml"]).text, false);
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
  const push = planForEvent("push", { before: base }, head, cwd);
  assert.equal(push.syncLabels, true);
  assert.equal(push.knowledgeLinks, false);
  assert.deepEqual(push, planForRevision(base, head, cwd));
  assert.deepEqual(push.packages, ["one", "two"]);
  assert.equal(push.infrastructure, false);
  assert.equal(push.knip, false);
  const unchanged = planForEvent("push", { before: head }, head, cwd);
  assert.deepEqual(unchanged, planForRevision(head, head, cwd));
  assert.equal(unchanged.ci, false);
  assert.equal(unchanged.syncLabels, false);
  assert.equal(unchanged.knowledgeLinks, false);
  put(".github/workflows/knowledge-links.yml", "name: links");
  git("add", ".");
  git("commit", "-qm", "link input");
  const linkHead = git("rev-parse", "HEAD");
  assert.equal(
    planForEvent("push", { before: head }, linkHead, cwd).knowledgeLinks,
    true,
  );
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
  assert.equal(planForRevision("0".repeat(40), renamed, cwd).syncLabels, true);
  assert.equal(
    planForRevision("0".repeat(40), renamed, cwd).infrastructure,
    true,
  );
  assert.throws(
    () => planForRevision(undefined, renamed, cwd),
    /explicit base/,
  );
  assert.throws(() => planForRevision("f".repeat(40), renamed, cwd));
  const initialPush = planForEvent(
    "push",
    { before: "0".repeat(40) },
    renamed,
    cwd,
  );
  assert.deepEqual(initialPush.packages, ["one", "three", "two"]);
  assert.equal(initialPush.infrastructure, true);
  assert.equal(initialPush.knip, true);
  assert.equal(initialPush.e2e, false); // These fixture packages have no E2E script.
  for (const before of [undefined, "f".repeat(40)])
    assert.throws(() => planForEvent("push", { before }, renamed, cwd));
  put("package.json", JSON.stringify({ workspaces: ["apps/*"] }));
  git("add", ".");
  git("commit", "-qm", "unsupported layout");
  assert.throws(
    () => readGitWorkspaces(git("rev-parse", "HEAD"), cwd),
    /workspace patterns/,
  );
});

const lockWorkspaces = [
  { name: "web", directory: "packages/web", scripts: { test: "test" } },
  { name: "desktop", directory: "packages/desktop", scripts: { test: "test" } },
];
const lockFixture = () => ({
  name: "repo",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": { devDependencies: { tool: "1" } },
    "packages/web": { dependencies: { parser: "1" } },
    "packages/desktop": { dependencies: { parser: "2" } },
    "node_modules/web": { resolved: "packages/web", link: true },
    "node_modules/desktop": { resolved: "packages/desktop", link: true },
    "node_modules/parser": { version: "1", dependencies: { leaf: "1" } },
    "node_modules/leaf": { version: "1", integrity: "old" },
    "packages/desktop/node_modules/parser": { version: "2" },
    "node_modules/tool": { version: "1" },
  },
});

test("lockfile updates follow resolved transitive versions without selecting unrelated consumers", () => {
  const before = lockFixture();
  const after = structuredClone(before);
  after.packages["node_modules/leaf"].integrity = "new";
  const impact = affectedByLockfile(before, after, lockWorkspaces);
  assert.equal(impact.all, false);
  assert.deepEqual(impact.packages, ["web"]);
  assert.deepEqual(
    selectCiPackages(
      ["package-lock.json"],
      lockWorkspaces,
      lockWorkspaces,
      impact,
    ).packages,
    ["web"],
  );
  after.packages["packages/desktop/node_modules/parser"].version = "3";
  assert.deepEqual(affectedByLockfile(before, after, lockWorkspaces).packages, [
    "desktop",
    "web",
  ]);
});

test("removed dependencies and moved hoisted versions retain old and new consumers", () => {
  const before = lockFixture();
  const after = structuredClone(before);
  delete after.packages["packages/web"].dependencies;
  delete after.packages["node_modules/parser"];
  delete after.packages["node_modules/leaf"];
  assert.deepEqual(affectedByLockfile(before, after, lockWorkspaces).packages, [
    "web",
  ]);
  const moved = structuredClone(before);
  moved.packages["node_modules/parser"] = { version: "2" };
  moved.packages["packages/web/node_modules/parser"] =
    before.packages["node_modules/parser"];
  delete moved.packages["packages/desktop/node_modules/parser"];
  assert.deepEqual(affectedByLockfile(before, moved, lockWorkspaces).packages, [
    "desktop",
    "web",
  ]);
});

test("workspace links, optional dependencies and peer dependencies propagate lockfile impact", () => {
  const before = lockFixture();
  before.packages["packages/desktop"].dependencies = { web: "*" };
  before.packages["node_modules/parser"] = {
    version: "1",
    optionalDependencies: { absent: "1" },
    peerDependencies: { leaf: "1", absent: "1" },
    peerDependenciesMeta: { absent: { optional: true } },
  };
  const after = structuredClone(before);
  after.packages["node_modules/leaf"].version = "2";
  const impact = affectedByLockfile(before, after, lockWorkspaces);
  assert.equal(impact.all, false);
  assert.deepEqual(impact.packages, ["desktop", "web"]);
});

test("shared root dependencies and uncertain lockfile inputs conservatively select everyone with a reason", () => {
  for (const mutate of [
    (lock) => {
      lock.packages["node_modules/tool"].version = "2";
    },
    (lock) => {
      lock.packages[""].devDependencies.tool = "2";
    },
    (lock) => {
      lock.lockfileVersion = 2;
    },
    (lock) => {
      lock.packages[".."] = { dependencies: { bad: "1" } };
    },
    (lock) => {
      delete lock.packages["node_modules/parser"];
    },
    (lock) => {
      lock.packages["node_modules/unknown"] = { version: "1" };
    },
    (lock) => {
      lock.packages["node_modules/web"].resolved = "missing";
    },
  ]) {
    const before = lockFixture();
    const after = structuredClone(before);
    mutate(after);
    const impact = affectedByLockfile(before, after, lockWorkspaces);
    assert.equal(impact.all, true);
    assert.ok(impact.reason);
    assert.deepEqual(
      selectCiPackages(
        ["package-lock.json"],
        lockWorkspaces,
        lockWorkspaces,
        impact,
      ).packages,
      ["desktop", "web"],
    );
  }
});

test("unchanged resolved lockfile data does not rebuild workspaces", () => {
  const lock = lockFixture();
  const impact = affectedByLockfile(
    lock,
    structuredClone(lock),
    lockWorkspaces,
  );
  const plan = selectCiPackages(
    ["package-lock.json"],
    lockWorkspaces,
    lockWorkspaces,
    impact,
  );
  assert.deepEqual(plan.packages, []);
  assert.equal(plan.text, true);
  assert.equal(plan.build, false);
});

test("shared CI keeps web apps on Linux while retaining other platform checks", () => {
  const plan = select(["package.json"]);
  assert.deepEqual(plan.os, platformRunners);
  const webApps = ["nilay-knowledge", "nilay-about", "nilay-news"].map(name);
  for (const row of plan.packageMatrix) {
    assert.deepEqual(
      row.packages,
      plan.packages.filter(
        (pkg) => row.os === "ubuntu-latest" || !webApps.includes(pkg),
      ),
    );
  }
  const suites = plan.e2eMatrix.flatMap((row) => row.suites);
  const knowledge = suites.filter(
    (row) => row.package === name("nilay-knowledge"),
  );
  assert.equal(knowledge.length, 0);
  const about = suites.filter((row) => row.package === name("nilay-about"));
  assert.equal(about.length, 0);
  for (const os of platformRunners) {
    const lane = suites.filter(
      (row) => row.package === name("saika-lane") && row.os === os,
    );
    assert.equal(lane.length, 1);
    assert.equal(lane[0].shards, 1);
    assert.equal(lane[0].electron, true);
  }
  assert.equal(plan.e2e, true);
  assert.equal(plan.knowledge, true);
  assert.equal(plan.about, true);
});

test("Electron E2E shares setup per OS and preserves every suite and artifact index", () => {
  const packages = current
    .filter((pkg) =>
      ["nilay-news", "saika-director", "saika-lane", "saika-vista"]
        .map(name)
        .includes(pkg.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const jobs = e2eMatrix(packages, platformRunners);
  assert.equal(jobs.length, 4);
  const suites = jobs
    .flatMap((job) => job.suites)
    .sort((a, b) => a.suite - b.suite);
  assert.deepEqual(
    suites.map(({ package: pkg, os, shard, shards, suite }) => [
      pkg,
      os,
      shard,
      shards,
      suite,
    ]),
    packages.flatMap((pkg, index) =>
      (index === 0 ? ["ubuntu-latest"] : platformRunners).map(
        (os, runnerIndex) => [
          pkg.name,
          os,
          1,
          1,
          index === 0 ? 0 : 1 + (index - 1) * 3 + runnerIndex,
        ],
      ),
    ),
  );
  for (const os of platformRunners) {
    const job = jobs.find((row) => row.os === os && row.electron);
    assert.equal(job.suites.length, 3);
    assert.equal(job.timeoutMinutes, 90);
  }
  const news = jobs.find((row) => !row.electron);
  assert.equal(news.os, "ubuntu-latest");
  assert.equal(news.suites.length, 1);
  assert.equal(news.suites[0].installBrowsers, true);
  assert.equal(news.timeoutMinutes, 30);
  assert.equal(
    e2eMatrix(
      packages.filter((pkg) => pkg.name === name("saika-lane")),
      platformRunners,
    ).length,
    3,
  );
  assert.deepEqual(e2eMatrix([], ["ubuntu-latest"]), []);
});

test("browser shard jobs remain separate", () => {
  const jobs = e2eMatrix(
    current.filter((pkg) =>
      ["nilay-knowledge", "nilay-about"].map(name).includes(pkg.name),
    ),
    platformRunners,
  );
  assert.equal(jobs.length, 4);
  for (const job of jobs) {
    assert.equal(job.suites.length, 1);
    assert.equal(job.os, "ubuntu-latest");
    assert.equal(job.suites[0].shards, 2);
  }
});

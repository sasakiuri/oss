// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  packageCommands,
  readWorkingWorkspaces,
  runCommands,
} from "./run-package-ci.mjs";

test("the workflow archive preserves build runtime files and modes without caches or checkout assets", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ci-build-archive-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, "input");
  const output = join(root, "output");
  mkdirSync(input);
  mkdirSync(output);
  const put = (file, mode = 0o644) => {
    const path = join(input, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "fixture", { mode });
  };
  const retained = [
    "packages/desktop/dist/main.js",
    "packages/web/.next/BUILD_ID",
    "packages/web/.next/server/index.js",
    "packages/web/.next/static/chunk.js",
    "packages/web/lib/generated/prisma/client.ts",
    "packages/nilay-knowledge/public/feed.xml",
    "packages/nilay-knowledge/public/sitemap.xml",
    "packages/nilay-knowledge/public/content-styles/style.css",
  ];
  for (const file of retained) put(file);
  put("packages/desktop/dist/executable", 0o755);
  symlinkSync("main.js", join(input, "packages/desktop/dist/link.js"));
  const excluded = [
    "packages/web/.next/cache/data",
    "packages/web/.next/standalone/server.js",
    "packages/web/.next/dev/server.js",
    "packages/nilay-knowledge/public/unchanged.pdf",
  ];
  for (const file of excluded) put(file);
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const script = workflow.match(
    /name: Archive build outputs[\s\S]*?run: \|\n((?:          .*\n)+)/,
  )[1];
  execFileSync("bash", ["-e", "-c", script], { cwd: input });
  execFileSync("tar", ["-xf", join(input, "build-output.tar")], {
    cwd: output,
  });
  for (const file of retained)
    assert.equal(readFileSync(join(output, file), "utf8"), "fixture");
  for (const file of excluded)
    assert.equal(existsSync(join(output, file)), false, file);
  assert.equal(
    statSync(join(output, "packages/desktop/dist/executable")).mode & 0o777,
    0o755,
  );
  assert.equal(
    readlinkSync(join(output, "packages/desktop/dist/link.js")),
    "main.js",
  );
  const empty = join(root, "empty");
  mkdirSync(empty);
  execFileSync("bash", ["-e", "-c", script], { cwd: empty });
  assert.equal(
    execFileSync("tar", ["-tf", "build-output.tar"], {
      cwd: empty,
      encoding: "utf8",
    }),
    "",
  );
});

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

test("local all-workspace checks use edited manifests and include Docs and non-coverage tests", (t) => {
  const root = mkdtempSync(join(tmpdir(), "oss-package-checks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ workspaces: ["packages/*"] }),
  );
  const local = [
    ...packages,
    {
      name: "@sasakiuri/saika-docs",
      directory: "packages/saika-docs",
      scripts: { "test:coverage": "coverage" },
    },
  ];
  for (const pkg of local) {
    mkdirSync(join(root, pkg.directory), { recursive: true });
    writeFileSync(
      join(root, pkg.directory, "package.json"),
      JSON.stringify(pkg),
    );
  }
  mkdirSync(join(root, "packages/not-a-workspace"));
  const readCommands = () => {
    const workspaces = readWorkingWorkspaces(root);
    return packageCommands(
      "test",
      workspaces.map((pkg) => pkg.name),
      workspaces,
      { includeDocs: true },
    );
  };
  assert.deepEqual(readCommands(), [
    ["run", "test:coverage", "--workspace=app"],
    ["run", "test", "--workspace=library"],
    ["run", "test:coverage", "--workspace=@sasakiuri/saika-docs"],
  ]);
  writeFileSync(
    join(root, "packages/library/package.json"),
    JSON.stringify({
      name: "library",
      scripts: { test: "test", "test:coverage": "coverage" },
    }),
  );
  assert.deepEqual(readCommands()[1], [
    "run",
    "test:coverage",
    "--workspace=library",
  ]);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ workspaces: ["apps/*"] }),
  );
  assert.throws(() => readWorkingWorkspaces(root), /workspace patterns/);
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

test("platform unit jobs run normal tests while Linux and local defaults retain coverage", () => {
  assert.deepEqual(
    packageCommands("test", ["app", "library"], packages, { coverage: false }),
    [
      ["run", "test", "--workspace=app"],
      ["run", "test", "--workspace=library"],
    ],
  );
  assert.deepEqual(packageCommands("test", ["app"], packages), [
    ["run", "test:coverage", "--workspace=app"],
  ]);
  assert.throws(
    () =>
      packageCommands(
        "test",
        ["coverage-only"],
        [
          {
            name: "coverage-only",
            scripts: { "test:coverage": "vitest run --coverage" },
          },
        ],
        { coverage: false },
      ),
    /normal unit test script/,
  );
});

test("E2E shards are forwarded exactly once to a single selected suite", () => {
  assert.deepEqual(
    packageCommands("test:e2e", ["app"], packages, { shard: "2/2" }),
    [["run", "test:e2e", "--workspace=app", "--", "--shard=2/2"]],
  );
  for (const shard of ["0/2", "3/2", "1/0", "1", "1/2 --project=chromium"])
    assert.throws(
      () => packageCommands("test:e2e", ["app"], packages, { shard }),
      /valid shard/,
    );
  assert.throws(
    () =>
      packageCommands("test:e2e", ["app", "library"], packages, {
        shard: "1/2",
      }),
    /one E2E/,
  );
  assert.throws(
    () => packageCommands("test", ["app"], packages, { shard: "1/2" }),
    /one E2E/,
  );
  assert.throws(
    () => packageCommands("test:e2e", ["library"], packages, { shard: "1/2" }),
    /one E2E/,
  );
});

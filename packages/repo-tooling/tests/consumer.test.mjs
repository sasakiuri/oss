// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, isAbsolute, dirname, parse } from "node:path";
import { test } from "node:test";
import lintStaged from "lint-staged";
import { checkBoundaries } from "../boundaries.mjs";
import {
  createCommitlintConfig,
  createLintStagedConfig,
  consumerMetadata,
  createSyncpackConfig,
  createKnipConfig,
} from "../config.mjs";
import {
  upstreamRoot,
  resolveBinary,
  resolvePackage,
  toolingWorkspaceRoot,
  isInside,
} from "../runtime.mjs";

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "repository-tooling-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = resolve(directory, "consumer");
  const source = resolve(directory, "public");
  for (const checkout of [root, source]) {
    mkdirSync(checkout);
    execFileSync("git", ["init", "-q"], { cwd: checkout });
    writeFileSync(
      resolve(checkout, "package.json"),
      JSON.stringify({ private: true, workspaces: ["packages/*"] }),
    );
    mkdirSync(resolve(checkout, "packages"));
  }
  const app = resolve(root, "packages/private.app");
  mkdirSync(app);
  writeFileSync(
    resolve(app, "package.json"),
    JSON.stringify({
      name: "private-app",
      private: true,
      scripts: { lint: "echo lint" },
    }),
  );
  return { root, source, app };
}

test("bundler root includes both checkout trees without changing the public root", (t) => {
  const { root } = fixture(t);
  if (parse(root).root !== parse(upstreamRoot).root) {
    assert.throws(() => toolingWorkspaceRoot(root), /share a filesystem root/);
    return;
  }
  const common = toolingWorkspaceRoot(root);
  assert.equal(isInside(common, root), true);
  assert.equal(isInside(common, upstreamRoot), true);
  assert.equal(isInside(dirname(common), common), true);
  assert.equal(toolingWorkspaceRoot(upstreamRoot), upstreamRoot);
});

test("shared Knip configuration loads through the native ESM loader on every platform", async (t) => {
  const { root } = fixture(t);
  const configuration = await createKnipConfig(root);
  assert.deepEqual(Object.keys(configuration.workspaces).sort(), [
    ".",
    "packages/private.app",
  ]);
  assert.deepEqual(configuration.ignoreIssues, {});
});

test("consumer Turbo cache bypass preserves forwarded application arguments", (t) => {
  const { root, app } = fixture(t);
  const manifest = readFileSync(resolve(root, "package.json"), "utf8");
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ ...JSON.parse(manifest), ...consumerMetadata() }),
  );
  writeFileSync(
    resolve(root, "turbo.json"),
    JSON.stringify({ tasks: { test: {} } }),
  );
  const workspace = JSON.parse(
    readFileSync(resolve(app, "package.json"), "utf8"),
  );
  workspace.scripts.test = "echo test";
  writeFileSync(resolve(app, "package.json"), JSON.stringify(workspace));
  const result = spawnSync(
    process.execPath,
    [
      resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"),
      "run",
      "turbo",
      "test",
      "--dry=json",
      "--",
      "--maxWorkers=2",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).tasks[0].cliArguments, [
    "--maxWorkers=2",
  ]);
});

test("dependency direction accepts the consumer and rejects a public reverse link", (t) => {
  const { root, source } = fixture(t);
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { public: "file:../public" },
    }),
  );
  assert.deepEqual(checkBoundaries(root, [source]), []);
  writeFileSync(
    resolve(source, "package.json"),
    JSON.stringify({ dependencies: { companion: "file:../consumer" } }),
  );
  assert.deepEqual(checkBoundaries(source), ["package.json: ../consumer"]);
  assert.deepEqual(checkBoundaries(root), ["package.json: ../public"]);
});

test("boundary validation covers source imports, lockfiles and symlinks", (t) => {
  const { root, source } = fixture(t);
  writeFileSync(
    resolve(source, "entry.mjs"),
    'export { value } from "../consumer/value.mjs";',
  );
  writeFileSync(
    resolve(source, "package-lock.json"),
    JSON.stringify({
      packages: {
        "node_modules/companion": { resolved: "../consumer", link: true },
      },
    }),
  );
  symlinkSync("../consumer/package.json", resolve(source, "linked.json"));
  assert.equal(checkBoundaries(source).length, 3);
  assert.deepEqual(checkBoundaries(source, [root]), []);
});

test("boundary validation checks TypeScript references and broken policy links", (t) => {
  const { root, source } = fixture(t);
  writeFileSync(
    resolve(source, "tsconfig.json"),
    '// JSONC\n{"extends":"../consumer/tsconfig.json","references":[{"path":"../consumer"}]}',
  );
  symlinkSync("./missing-policy.json", resolve(source, "policy.json"));
  assert.equal(checkBoundaries(source).length, 3);
  assert.equal(checkBoundaries(source, [root]).length, 1);
});

test("actual commitlint enforces upstream policy for normalized consumer scopes", (t) => {
  const { root } = fixture(t);
  mkdirSync(resolve(root, "packages/ignored-cache"));
  writeFileSync(resolve(root, "packages/ignored-cache/cache.txt"), "cache");
  writeFileSync(resolve(root, ".gitignore"), "packages/ignored-cache/\n");
  const config = createCommitlintConfig(root);
  const filename = resolve(root, "commitlint.config.cjs");
  writeFileSync(filename, `module.exports = ${JSON.stringify(config)};`);
  const check = (message) =>
    spawnSync(
      process.execPath,
      [resolveBinary("commitlint", upstreamRoot), "--config", filename],
      { cwd: root, input: message, encoding: "utf8" },
    );
  for (const message of [
    "fix(private-app): 修正",
    "chore(monorepo): update tooling",
    "fix(private-app,root): update tooling",
  ]) {
    const result = check(message);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  for (const message of [
    "[*] chore: old format",
    "fix(private.app): dotted scope",
    "fix(unknown): unknown",
    "fix(ignored-cache): ignored directory",
    "fix: missing scope",
    "release(root): disallowed type",
  ])
    assert.notEqual(check(message).status, 0, message);
});

test("workspace staged checks exclude the same files from generic formatting", (t) => {
  const { root, app } = fixture(t);
  const config = createLintStagedConfig(root);
  const generic = config["*.{js,mjs,cjs,ts,json,md,yml,yaml}"];
  const staged = resolve(app, "name with spaces.ts");
  writeFileSync(staged, "export {};\n");
  assert.deepEqual(generic([staged]), []);
  assert.deepEqual(
    config[
      "packages/private.app/**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,scss,yml,yaml}"
    ](),
    [
      'npm run lint --workspace "private-app"',
      'repo-tooling run --cwd "packages/private.app" prettier --check .',
    ],
  );
  const configFile = resolve(root, "config with spaces.mjs");
  writeFileSync(configFile, "export {};\n");
  symlinkSync(configFile, resolve(root, "upstream-policy.mjs"));
  assert.deepEqual(generic([resolve(root, "upstream-policy.mjs")]), []);
  assert.match(generic([configFile])[0], /"[^"\n]*config with spaces\.mjs"/);
});

test("actual lint-staged parses workspace options and runs every configured check", async (t) => {
  const { root, app } = fixture(t);
  const manifest = JSON.parse(
    readFileSync(resolve(app, "package.json"), "utf8"),
  );
  manifest.scripts = {
    lint: "node -e 'process.exit(0)'",
    "lint:prettier": "node -e 'process.exit(0)'",
    typecheck: "node -e 'process.exit(0)'",
  };
  writeFileSync(resolve(app, "package.json"), JSON.stringify(manifest));
  writeFileSync(resolve(app, "staged.ts"), "export {};\n");
  execFileSync("git", ["add", "packages/private.app/staged.ts"], { cwd: root });
  assert.equal(
    await lintStaged({
      cwd: root,
      config: createLintStagedConfig(root),
      quiet: true,
      stash: false,
    }),
    true,
  );
});

test("install preparation refreshes runtime policy without installing consumer dependencies", (t) => {
  const { root } = fixture(t);
  const result = spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "prepare"],
    {
      cwd: root,
      env: { ...process.env, CI: "", HUSKY: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json")));
  for (const [key, value] of Object.entries(consumerMetadata()))
    assert.deepEqual(manifest[key], value);
  assert.equal(
    readFileSync(resolve(root, ".gitattributes"), "utf8"),
    readFileSync(resolve(upstreamRoot, ".gitattributes"), "utf8"),
  );
  assert.equal(createSyncpackConfig(root).versionGroups[0].isIgnored, true);
});

test("CI bootstrap rejects derived metadata drift without changing tracked inputs", (t) => {
  const { root } = fixture(t);
  const manifestPath = resolve(root, "package.json");
  const attributesPath = resolve(root, ".gitattributes");
  const lockPath = resolve(root, "package-lock.json");
  const templatePath = resolve(root, ".github/PULL_REQUEST_TEMPLATE.md");
  const files = [manifestPath, attributesPath, lockPath, templatePath];
  writeFileSync(attributesPath, "stale attributes\n");
  mkdirSync(dirname(templatePath));
  writeFileSync(templatePath, "stale template\n");
  writeFileSync(
    lockPath,
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { engines: { node: "20.x" } } },
    }),
  );
  const before = files.map((filename) => readFileSync(filename, "utf8"));
  const result = spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "install", "--ci"],
    {
      cwd: root,
      env: { ...process.env, CI: "", HUSKY: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Derived upstream metadata is outdated/);
  assert.deepEqual(
    files.map((filename) => readFileSync(filename, "utf8")),
    before,
  );
});

test("prepare repairs stale module links and derives local peer-dependent tool versions", (t) => {
  const { root, app } = fixture(t);
  const manifest = {
    name: "private-app",
    private: true,
    repoTooling: {
      upstreamPackage: "nilay-knowledge",
      linkedDependencies: ["typescript"],
      installedDependencies: ["@testing-library/react"],
    },
  };
  writeFileSync(resolve(app, "package.json"), JSON.stringify(manifest));
  mkdirSync(resolve(app, "node_modules"));
  const peerModule = resolve(app, "node_modules/@testing-library/react");
  mkdirSync(peerModule, { recursive: true });
  writeFileSync(
    resolve(peerModule, "package.json"),
    readFileSync(
      resolve(resolvePackage("@testing-library/react", app), "package.json"),
    ),
  );
  symlinkSync(
    "../../missing-old-installation",
    resolve(app, "node_modules/typescript"),
  );
  const result = spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "prepare"],
    {
      cwd: root,
      env: { ...process.env, CI: "", HUSKY: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const moduleLink = resolve(app, "node_modules/typescript");
  if (process.platform === "win32")
    assert.equal(realpathSync(moduleLink), resolvePackage("typescript", app));
  else assert.equal(isAbsolute(readlinkSync(moduleLink)), false);
  const linkModificationTime = lstatSync(moduleLink).mtimeMs;
  const repeated = spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "prepare"],
    {
      cwd: root,
      env: { ...process.env, CI: "true", HUSKY: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(lstatSync(moduleLink).mtimeMs, linkModificationTime);
  const updated = JSON.parse(readFileSync(resolve(app, "package.json")));
  const source = JSON.parse(
    readFileSync(
      resolve(resolvePackage("@testing-library/react", app), "package.json"),
    ),
  );
  assert.equal(
    updated.devDependencies["@testing-library/react"],
    source.version,
  );
  assert.equal(
    JSON.parse(
      readFileSync(resolve(app, "node_modules/typescript/package.json")),
    ).version,
    JSON.parse(
      readFileSync(resolve(resolvePackage("typescript", app), "package.json")),
    ).version,
  );
  const stale = { ...source, version: "0.0.0" };
  writeFileSync(resolve(peerModule, "package.json"), JSON.stringify(stale));
  const rejected = spawnSync(
    process.execPath,
    [resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"), "prepare"],
    {
      cwd: root,
      env: { ...process.env, CI: "true", HUSKY: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Consumer installation is out of sync/);
});

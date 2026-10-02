#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  realpathSync,
  symlinkSync,
  rmSync,
  readlinkSync,
} from "node:fs";
import { resolve, dirname, delimiter, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  upstreamRoot,
  upstreamManifest,
  readJson,
  repositoryRoot,
  runTool,
  resolvePackage,
  resolveConsumerPackage,
  isInside,
} from "./runtime.mjs";
import {
  workspaceDirectories,
  consumerMetadata,
  createSyncpackConfig,
} from "./config.mjs";
import { checkBoundaries } from "./boundaries.mjs";

const root = repositoryRoot();
const [command = "help", ...args] = process.argv.slice(2);

function npm(arguments_) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    arguments_,
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${resolve(root, "node_modules/.bin")}${delimiter}${resolve(upstreamRoot, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
      },
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function refreshMetadata({ checkOnly = false } = {}) {
  if (root === upstreamRoot) return;
  const manifest = readJson(resolve(root, "package.json"));
  if (!manifest.private)
    throw new Error("Companion repository must be private");
  const changes = [];
  const stageJson = (filename, value) => {
    if (!isDeepStrictEqual(readJson(filename), value))
      changes.push([filename, `${JSON.stringify(value, null, 2)}\n`]);
  };
  Object.assign(manifest, consumerMetadata());
  const attributesPath = resolve(root, ".gitattributes");
  const attributes = readFileSync(
    resolve(upstreamRoot, ".gitattributes"),
    "utf8",
  );
  if (
    !existsSync(attributesPath) ||
    readFileSync(attributesPath, "utf8") !== attributes
  )
    changes.push([attributesPath, attributes]);
  for (const directory of [".", ...workspaceDirectories(root)]) {
    const cwd = resolve(root, directory);
    const filename = resolve(cwd, "package.json");
    const consumer = directory === "." ? manifest : readJson(filename);
    for (const name of consumer.repoTooling?.installedDependencies ?? []) {
      consumer.devDependencies ??= {};
      consumer.devDependencies[name] = readJson(
        resolve(resolvePackage(name, cwd), "package.json"),
      ).version;
    }
    stageJson(filename, consumer);
  }
  const lockPath = resolve(root, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath);
    if (lock.packages?.[""]) lock.packages[""].engines = manifest.engines;
    stageJson(lockPath, lock);
  }
  if (checkOnly && changes.length)
    throw new Error(
      `Derived upstream metadata is outdated: ${changes.map(([filename]) => filename).join(", ")}. Run repo-tooling install and commit the generated dependency metadata.`,
    );
  for (const [filename, contents] of changes) writeFileSync(filename, contents);
}

function linkToolDependencies() {
  if (root === upstreamRoot) return;
  for (const directory of [".", ...workspaceDirectories(root)]) {
    const cwd = resolve(root, directory);
    const manifest = readJson(resolve(cwd, "package.json"));
    if (!manifest.private)
      throw new Error(`Companion workspace must be private: ${directory}`);
    for (const name of manifest.repoTooling?.linkedDependencies ?? []) {
      const target = resolvePackage(name, cwd);
      const link = resolve(cwd, "node_modules", name);
      const relativeTarget = relative(dirname(link), target);
      mkdirSync(dirname(link), { recursive: true });
      let stat;
      try {
        stat = lstatSync(link);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (stat) {
        if (stat.isSymbolicLink()) {
          try {
            if (
              realpathSync(link) === target &&
              readlinkSync(link) === relativeTarget
            )
              continue;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
        rmSync(link, { recursive: true, force: true });
      }
      symlinkSync(
        relativeTarget,
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  }
}

function validateInstalledDependencies() {
  if (root === upstreamRoot) return;
  for (const directory of [".", ...workspaceDirectories(root)]) {
    const cwd = resolve(root, directory);
    const manifest = readJson(resolve(cwd, "package.json"));
    for (const name of manifest.repoTooling?.installedDependencies ?? []) {
      const installed = resolveConsumerPackage(name, cwd);
      const version = readJson(resolve(installed, "package.json")).version;
      const expected = readJson(
        resolve(resolvePackage(name, cwd), "package.json"),
      ).version;
      if (!isInside(root, installed) || version !== expected)
        throw new Error(
          `Consumer installation is out of sync: ${directory}/${name} is ${version}, expected local ${expected}. Regenerate the lockfile with repo-tooling install.`,
        );
    }
  }
}

async function execute(script, arguments_) {
  if (script === "docker") {
    const manifest = readJson(resolve(root, "package.json"));
    const filename = manifest.repoTooling?.dockerCompose;
    if (!filename || !isInside(root, resolve(root, filename)))
      throw new Error(
        "repoTooling.dockerCompose must name a file inside this checkout",
      );
    const source = upstreamManifest();
    const result = spawnSync(
      "docker",
      ["compose", "--file", resolve(root, filename), ...arguments_],
      {
        cwd: dirname(resolve(root, filename)),
        stdio: "inherit",
        env: {
          ...process.env,
          CONSUMER_ROOT: root,
          UPSTREAM_ROOT: upstreamRoot,
          TOOLING_NODE_VERSION: source.volta.node,
          TOOLING_NPM_VERSION: source.volta.npm,
        },
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  if (
    script === "check" ||
    script === "qa" ||
    script === "lint" ||
    script === "fix"
  ) {
    validateInstalledDependencies();
    return await sourceScriptAsync(script);
  }
  if (script === "boundaries") {
    const violations = checkBoundaries(
      root,
      root === upstreamRoot ? [] : [upstreamRoot],
    );
    if (violations.length) console.error(violations.join("\n"));
    return violations.length ? 1 : 0;
  }
  if (script === "run") {
    let cwd = process.cwd();
    if (arguments_[0] === "--cwd") {
      cwd = resolve(root, arguments_[1]);
      if (!isInside(root, cwd))
        throw new Error(
          "Tool working directory must stay inside consumer checkout",
        );
      arguments_ = arguments_.slice(2);
    }
    const [binary, ...binaryArgs] = arguments_;
    if (binary === "licensee" && root !== upstreamRoot) {
      if (binaryArgs.some((argument) => argument !== "--errors-only"))
        throw new Error("Consumer license check supports --errors-only only");
      const { checkLicenses } = await import("./license-check.mjs");
      return checkLicenses(root);
    }
    if (binary === "syncpack" && root !== upstreamRoot) {
      const configDirectory = resolve(root, ".local/tooling");
      mkdirSync(configDirectory, { recursive: true });
      const configPath = resolve(configDirectory, "syncpack.json");
      writeFileSync(
        configPath,
        JSON.stringify(createSyncpackConfig(root), null, 2),
      );
      return runTool(binary, binaryArgs, {
        cwd: root,
      });
    }
    return runTool(binary, binaryArgs, { cwd });
  }
  if (["lint:text", "fix:text"].includes(script)) {
    const { lintText } = await import(
      pathToFileURL(resolve(upstreamRoot, "scripts/lint-text.mjs"))
    );
    return (await lintText({ root, fix: script === "fix:text" })) ? 1 : 0;
  }
  if (script === "lint:infra") {
    const { lintInfrastructure } = await import(
      pathToFileURL(resolve(upstreamRoot, "scripts/lint-infra.mjs"))
    );
    return lintInfrastructure({ root });
  }
  if (["license-report", "license-report:check"].includes(script)) {
    const { generateLicenseReport } = await import(
      pathToFileURL(
        resolve(upstreamRoot, "scripts/generate-third-party-licenses.mjs"),
      )
    );
    const appDirectories = workspaceDirectories(root).filter(
      (directory) =>
        Object.keys(
          readJson(resolve(root, directory, "package.json")).dependencies ?? {},
        ).length,
    );
    return generateLicenseReport({
      repositoryRoot: root,
      appDirectories,
      checkOnly: script.endsWith(":check"),
      selectedWorkspace: arguments_[0],
    });
  }
  if (script === "contracts:check") {
    for (const task of ["api:check", "env:check"]) {
      const status = npm(["run", task, "--workspaces", "--if-present"]);
      if (status) return status;
    }
    return 0;
  }
  if (script === "test:coverage")
    return npm(["run", "test:coverage", "--workspaces", "--if-present"]);
  if (script === "test:tooling") {
    const directory = resolve(root, "scripts");
    const tests = existsSync(directory)
      ? readdirSync(directory)
          .filter((name) => name.endsWith(".test.mjs"))
          .map((name) => resolve(directory, name))
      : [];
    tests.push(
      ...readdirSync(resolve(upstreamRoot, "packages/repo-tooling/tests"))
        .filter((name) => name.endsWith(".test.mjs"))
        .map((name) =>
          resolve(upstreamRoot, "packages/repo-tooling/tests", name),
        ),
    );
    const result = spawnSync(process.execPath, ["--test", ...tests], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  if (script === "coverage:diff") {
    const result = spawnSync(
      process.execPath,
      [resolve(upstreamRoot, "scripts/coverage-diff-check.mjs"), ...arguments_],
      { cwd: root, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  if (script === "prepare" || script === "install") {
    refreshMetadata({
      checkOnly: arguments_.includes("--ci") || Boolean(process.env.CI),
    });
    if (script === "install")
      return npm([
        arguments_.includes("--ci") ? "ci" : "install",
        ...arguments_.filter((arg) => arg !== "--ci"),
      ]);
    linkToolDependencies();
    validateInstalledDependencies();
    const syncpackDirectory = resolve(root, ".local/tooling");
    mkdirSync(syncpackDirectory, { recursive: true });
    writeFileSync(
      resolve(syncpackDirectory, "syncpack.json"),
      JSON.stringify(createSyncpackConfig(root), null, 2),
    );
    if (
      process.env.CI ||
      process.env.NODE_ENV === "production" ||
      process.env.HUSKY === "0"
    )
      return 0;
    return runTool("husky", [], { cwd: root });
  }
  if (
    ["dev", "build", "typecheck", "depcruise", "size-limit", "test"].includes(
      script,
    )
  )
    return runTool("turbo", [script, ...arguments_], { cwd: root });
  if (script === "cspell") return runTool("cspell", arguments_, { cwd: root });
  if (script === "knip") return runTool("knip", arguments_, { cwd: root });
  if (script === "syncpack")
    return execute("run", ["syncpack", "lint", ...arguments_]);
  if (script === "license-check")
    return execute("run", ["licensee", "--errors-only", ...arguments_]);
  if (script === "help") {
    console.log(
      "repo-tooling install [--ci] | prepare | run <binary> [args] | check | qa | boundaries",
    );
    return 0;
  }
  throw new Error(`Unknown command: ${script}`);
}

async function sourceScriptAsync(script) {
  const source = upstreamManifest().scripts[script];
  if (!source) throw new Error(`Upstream script missing: ${script}`);
  for (const step of source.split(/\s*&&\s*/)) {
    const task = step.match(/^npm run ([\w:-]+)$/)?.[1];
    const status = task ? await execute(task, []) : sourceScriptStep(step);
    if (status !== 0) return status;
  }
  return 0;
}

function sourceScriptStep(step) {
  const turboTask = step.match(/^turbo (?:run )?([\w:-]+)$/)?.[1];
  if (turboTask) return runTool("turbo", [turboTask], { cwd: root });
  const rebuild = step.match(/^npm rebuild ([\w-]+)$/)?.[1];
  if (rebuild) {
    const manifests = [
      readJson(resolve(root, "package.json")),
      ...workspaceDirectories(root).map((directory) =>
        readJson(resolve(root, directory, "package.json")),
      ),
    ];
    return manifests.some(
      (manifest) =>
        manifest.dependencies?.[rebuild] || manifest.devDependencies?.[rebuild],
    )
      ? npm(["rebuild", rebuild])
      : 0;
  }
  if (step === "npm audit --audit-level=high")
    return npm(["audit", "--audit-level=high"]);
  throw new Error(`Unsupported upstream QA step: ${step}`);
}

try {
  process.exitCode = await execute(command, args);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

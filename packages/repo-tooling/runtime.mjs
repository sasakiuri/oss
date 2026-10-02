// SPDX-License-Identifier: MIT
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative, isAbsolute, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const upstreamRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const readJson = (filename) =>
  JSON.parse(readFileSync(filename, "utf8"));
export const upstreamManifest = () =>
  readJson(resolve(upstreamRoot, "package.json"));

export function repositoryRoot(cwd = process.cwd()) {
  let root = resolve(cwd);
  while (!existsSync(resolve(root, ".git"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error(`Not a Git checkout: ${cwd}`);
    root = parent;
  }
  return root;
}

export function isInside(root, filename) {
  const diff = relative(root, filename);
  return (
    diff === "" ||
    (!diff.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      diff !== ".." &&
      !isAbsolute(diff))
  );
}

export function toolingWorkspaceRoot(cwd = process.cwd()) {
  let common = repositoryRoot(cwd);
  while (!isInside(common, upstreamRoot)) common = dirname(common);
  return common;
}

export function toolRequire(cwd = process.cwd(), { defaultProfile } = {}) {
  let directory = resolve(cwd);
  const root = repositoryRoot(cwd);
  while (isInside(root, directory)) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      const profile = readJson(manifestPath).repoTooling?.upstreamPackage;
      if (profile) {
        const profilePath = resolve(
          upstreamRoot,
          "packages",
          profile,
          "package.json",
        );
        if (!isInside(resolve(upstreamRoot, "packages"), profilePath))
          throw new Error("Invalid upstream package profile");
        return createRequire(profilePath);
      }
    }
    if (directory === root) break;
    directory = dirname(directory);
  }
  return createRequire(
    defaultProfile
      ? resolve(upstreamRoot, "packages", defaultProfile, "package.json")
      : resolve(upstreamRoot, "package.json"),
  );
}

const binaryPackages = {
  commitlint: "@commitlint/cli",
  tsc: "typescript",
  lhci: "@lhci/cli",
  changeset: "@changesets/cli",
  "size-limit": "size-limit",
};

export function resolvePackage(packageName, cwd = process.cwd()) {
  return findPackage(packageName, toolRequire(cwd));
}

export function resolveConsumerPackage(packageName, cwd = process.cwd()) {
  return findPackage(packageName, createRequire(resolve(cwd, "package.json")));
}

function findPackage(packageName, require) {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(packageName))
    throw new Error(`Invalid package: ${packageName}`);
  let entry;
  try {
    entry = require.resolve(`${packageName}/package.json`);
  } catch {
    entry = require.resolve(packageName);
  }
  let directory = dirname(realpathSync(entry));
  while (true) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      if (manifest.name === packageName) {
        return directory;
      }
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error(`Cannot locate package: ${packageName}`);
    directory = parent;
  }
}

export function resolveBinary(binary, cwd = process.cwd()) {
  if (!/^[a-z][a-z0-9-]*$/.test(binary))
    throw new Error(`Invalid binary: ${binary}`);
  const packageName = binaryPackages[binary] ?? binary;
  if (binary === "syncpack") {
    const platform =
      process.platform === "win32" ? "windows" : process.platform;
    const require = toolRequire(cwd);
    return require.resolve(
      `syncpack-${platform}-${process.arch}/bin/syncpack${process.platform === "win32" ? ".exe" : ""}`,
    );
  }
  const directory = resolvePackage(packageName, cwd);
  const manifest = readJson(resolve(directory, "package.json"));
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binary];
  if (!bin) throw new Error(`${packageName} does not export ${binary}`);
  return resolve(directory, bin);
}

export function runTool(binary, args = [], { cwd = process.cwd() } = {}) {
  // External checkout files are not part of the consumer's Turbo cache key.
  if (binary === "turbo" && repositoryRoot(cwd) !== upstreamRoot) {
    const separator = args.indexOf("--");
    const boundary = separator < 0 ? args.length : separator;
    if (!args.slice(0, boundary).includes("--force"))
      args = [...args.slice(0, boundary), "--force", ...args.slice(boundary)];
  }
  const executable = resolveBinary(binary, cwd);
  const nodeScript = /^#!.*\bnode\b/.test(
    readFileSync(executable, "utf8").slice(0, 200),
  );
  const result = spawnSync(
    nodeScript ? process.execPath : executable,
    nodeScript ? [executable, ...args] : args,
    {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${resolve(repositoryRoot(cwd), "node_modules/.bin")}${delimiter}${resolve(upstreamRoot, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
      },
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

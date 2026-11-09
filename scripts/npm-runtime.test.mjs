// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const runtime = "packages/repo-tooling/npm-runtime/";
const readJson = (file) =>
  JSON.parse(readFileSync(new URL(file, root), "utf8"));

test("the isolated npm runtime matches both root package manager declarations", () => {
  const manifest = readJson("package.json");
  const version = manifest.volta.npm;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.packageManager, `npm@${version}`);

  const bootstrap = readJson(`${runtime}package.json`);
  const lock = readJson(`${runtime}package-lock.json`);
  assert.equal(bootstrap.private, true);
  assert.equal(bootstrap.scripts, undefined);
  assert.deepEqual(bootstrap.dependencies, { npm: version });
  assert.deepEqual(lock.packages[""].dependencies, { npm: version });
  assert.equal(lock.packages["node_modules/npm"].version, version);
  assert.match(lock.packages["node_modules/npm"].integrity, /^sha512-\S+$/);
  assert.equal(
    readJson("package-lock.json").packages[runtime.slice(0, -1)],
    undefined,
  );
});

const globalInstall =
  /\bnpm\s+(?:install|i)\s+[^\n;&|]*?(?:--global\b|-[a-zA-Z]*g\b)/;

test("the bootstrap guard recognizes global installation spellings", () => {
  for (const command of [
    "npm install --global npm@11.20.0",
    "npm i -g npm@11.20.0",
    "npm install npm@11.20.0 --global",
    "npm install -g npm@11.20.0",
    "npm i --global npm@11.20.0",
  ])
    assert.match(command, globalInstall);
  assert.doesNotMatch("npm ci --ignore-scripts", globalInstall);
});

test("workflows, composite actions, and Dockerfiles use locked npm bootstrapping", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (file) =>
        (/^\.github\/(?:workflows|actions)\/.*\.ya?ml$/.test(file) ||
          /(?:^|\/)Dockerfile(?:\.[^/]+)?$/.test(file)) &&
        file !== "packages/repo-tooling/Dockerfile" &&
        existsSync(new URL(file, root)),
    );
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(new URL(file, root), "utf8").replace(
      /\\\r?\n/g,
      " ",
    );
    assert.doesNotMatch(source, globalInstall, file);
  }
});

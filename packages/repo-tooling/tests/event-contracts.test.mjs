// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { upstreamRoot } from "../runtime.mjs";

function fixture(t, format = "sha1") {
  const root = mkdtempSync(resolve(tmpdir(), "event-contracts-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", `--object-format=${format}`);
  git("config", "core.autocrlf", "false");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  const write = (file, contents) =>
    writeFileSync(resolve(root, file), contents);
  mkdirSync(resolve(root, "contracts/events"), { recursive: true });
  mkdirSync(resolve(root, "other"));
  write(
    "package.json",
    JSON.stringify({
      private: true,
      repoTooling: { eventContractDirectories: ["contracts/events"] },
    }),
  );
  write("contracts/events/accepted.v1.json", '{"version":1}\n');
  write("contracts/events/readme.txt", "notes");
  write("other/ignored.json", "{}");
  git("add", ".");
  git("commit", "-qm", "fixture");
  const base = git("rev-parse", "HEAD");
  const run = (args = ["--base", base], env = {}) =>
    spawnSync(
      process.execPath,
      [
        resolve(upstreamRoot, "packages/repo-tooling/cli.mjs"),
        "contracts:events",
        ...args,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, BASE_SHA: "", ...env },
      },
    );
  return { root, git, write, base, run };
}

for (const format of ["sha1", "sha256"]) {
  test(`unchanged contracts pass with a full ${format} commit`, (t) => {
    const { run } = fixture(t, format);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 existing event contracts are unchanged/);
  });
}

for (const change of ["modified", "deleted", "renamed", "symlink"]) {
  test(`${change} existing contract fails`, (t) => {
    const { root, write, run } = fixture(t);
    const file = resolve(root, "contracts/events/accepted.v1.json");
    if (change === "modified")
      write("contracts/events/accepted.v1.json", '{"version":2}\n');
    if (change === "deleted") rmSync(file);
    if (change === "renamed")
      renameSync(file, resolve(root, "contracts/events/accepted.v2.json"));
    if (change === "symlink") {
      renameSync(file, resolve(root, "other/same.json"));
      symlinkSync("../../other/same.json", file);
    }
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Add a new version instead/);
    assert.match(result.stderr, /contracts\/events\/accepted.v1.json/);
  });
}

test("comparison is byte exact even for malformed UTF-8", (t) => {
  const { write, git, run } = fixture(t);
  write("contracts/events/accepted.v1.json", Buffer.from([0x80]));
  git("add", ".");
  git("commit", "-qm", "bytes");
  const base = git("rev-parse", "HEAD");
  write("contracts/events/accepted.v1.json", Buffer.from([0x81]));
  assert.equal(run(["--base", base]).status, 1);
});

test("new files, non-JSON files and paths outside configured directories are ignored", (t) => {
  const { write, run } = fixture(t);
  write("contracts/events/new.v2.json", "{}");
  write("contracts/events/readme.txt", "changed");
  write("other/ignored.json", "changed");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 existing/);
});

for (const change of ["deleted", "renamed"]) {
  test(`base directories remain protected when configuration moves: ${change}`, (t) => {
    const { root, write, run } = fixture(t);
    write(
      "package.json",
      JSON.stringify({ repoTooling: { eventContractDirectories: ["other"] } }),
    );
    const file = resolve(root, "contracts/events/accepted.v1.json");
    if (change === "deleted") rmSync(file);
    else renameSync(file, resolve(root, "other/accepted.v1.json"));
    const result = run();
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /contracts\/events\/accepted.v1.json/);
  });
}

test("both base and current directories are checked", (t) => {
  const { write, run } = fixture(t);
  write(
    "package.json",
    JSON.stringify({ repoTooling: { eventContractDirectories: ["other"] } }),
  );
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 existing/);
});

for (const missing of ["manifest", "configuration"]) {
  test(`a base without ${missing} allows introducing the check`, (t) => {
    const { root, write, git, run } = fixture(t);
    if (missing === "manifest") rmSync(resolve(root, "package.json"));
    else write("package.json", "{}");
    git("add", ".");
    git("commit", "-qm", "before configuration");
    const base = git("rev-parse", "HEAD");
    write(
      "package.json",
      JSON.stringify({
        repoTooling: { eventContractDirectories: ["contracts/events"] },
      }),
    );
    assert.equal(run(["--base", base]).status, 0);
    write("contracts/events/accepted.v1.json", "changed");
    assert.equal(run(["--base", base]).status, 1);
  });
}

test(
  "invalid UTF-8 Git paths cannot be masked by a replacement-character filename",
  {
    skip: process.platform === "win32",
  },
  (t) => {
    const { root, write, git, run } = fixture(t);
    const file = Buffer.concat([
      Buffer.from(`${root}/contracts/events/`),
      Buffer.from([0x80]),
      Buffer.from(".json"),
    ]);
    writeFileSync(file, "{}");
    git("add", ".");
    git("commit", "-qm", "invalid path bytes");
    const base = git("rev-parse", "HEAD");
    rmSync(file);
    write("contracts/events/\uFFFD.json", "{}");
    const result = run(["--base", base]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid UTF-8 paths/);
  },
);

test(
  "backslash traversal in a base contract is rejected before filesystem lookup",
  {
    skip: process.platform === "win32",
  },
  (t) => {
    const { write, git, run } = fixture(t);
    write("contracts/events/..\\..\\..\\outside.json", "{}");
    git("add", ".");
    git("commit", "-qm", "ambiguous path");
    const result = run(["--base", git("rev-parse", "HEAD")]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsafe repository path/);
  },
);

test("invalid base configuration is rejected even when current configuration is valid", (t) => {
  const { write, git, run } = fixture(t);
  write(
    "package.json",
    JSON.stringify({
      repoTooling: { eventContractDirectories: ["../outside"] },
    }),
  );
  git("add", ".");
  git("commit", "-qm", "invalid base configuration");
  const base = git("rev-parse", "HEAD");
  write(
    "package.json",
    JSON.stringify({
      repoTooling: { eventContractDirectories: ["contracts/events"] },
    }),
  );
  const result = run(["--base", base]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /eventContractDirectories/);
});

test("multiple configured directories and unusual filenames are checked", (t) => {
  const { write, git, run } = fixture(t);
  write(
    "package.json",
    JSON.stringify({
      repoTooling: { eventContractDirectories: ["contracts/events", "other"] },
    }),
  );
  write("other/odd \n:name.json", "{}");
  git("add", ".");
  git("commit", "-qm", "extra contracts");
  const base = git("rev-parse", "HEAD");
  write("other/odd \n:name.json", "changed");
  const result = run(["--base", base]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /:name.json/);
});

test("BASE_SHA is accepted and an explicit argument takes precedence", (t) => {
  const { run, base } = fixture(t);
  assert.equal(run([], { BASE_SHA: base }).status, 0);
  assert.equal(run(["--base", base], { BASE_SHA: "invalid" }).status, 0);
});

for (const base of [
  undefined,
  "HEAD",
  "abc123",
  "0".repeat(40),
  "A".repeat(40),
  "a".repeat(41),
  "--help",
  "a".repeat(40) + "\n",
]) {
  test(`missing or invalid base is rejected: ${JSON.stringify(base)}`, (t) => {
    const { run } = fixture(t);
    const result = run(base === undefined ? [] : ["--base", base]);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /base commit hash|Base commit is unavailable|argument is ambiguous/,
    );
  });
}

test("a full blob hash cannot be used as the base", (t) => {
  const { run, git } = fixture(t);
  assert.equal(
    run(["--base", git("rev-parse", "HEAD:package.json")]).status,
    1,
  );
});

test("a SHA-256 commit abbreviated to 40 characters is rejected", (t) => {
  const { run, base } = fixture(t, "sha256");
  assert.equal(run(["--base", base.slice(0, 40)]).status, 1);
});

for (const directories of [
  undefined,
  [],
  ["../outside"],
  ["/absolute"],
  ["contracts/../other"],
  ["contracts\\events"],
  ["C:contracts/events"],
  ["C:/contracts/events"],
  ["//server/contracts"],
  ["contracts/./events"],
  ["."],
]) {
  test(`invalid directory configuration is rejected: ${JSON.stringify(directories)}`, (t) => {
    const { run, write } = fixture(t);
    write(
      "package.json",
      JSON.stringify({
        repoTooling: { eventContractDirectories: directories },
      }),
    );
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /eventContractDirectories/);
  });
}

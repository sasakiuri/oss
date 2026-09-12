// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const suite = ["saika-lane", "saika-director", "saika-vista", "saika-docs"];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "saika-release-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(file, content) {
    const target = join(root, file);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
  }
  function pkg(name, options = {}) {
    const dir = `packages/${name}`;
    write(
      `${dir}/package.json`,
      JSON.stringify({
        name: `@sasakiuri/${name}`,
        version: "0.4.0",
        private: true,
        license: "MIT",
        ...options,
      }),
    );
    write(`${dir}/LICENSE`, "MIT\n");
    write(`${dir}/README.md`, `# ${name}\n`);
  }
  mkdirSync(join(root, "scripts"));
  for (const file of ["pre-release-check.sh", "check-english-only.mjs"]) {
    copyFileSync(join(repoRoot, "scripts", file), join(root, "scripts", file));
  }
  write("package.json", JSON.stringify({ private: true, license: "MIT" }));
  for (const file of [
    "LICENSE",
    "README.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
  ]) {
    write(file, "Release documentation\n");
  }
  write("SECURITY.md", "Supported: 0.4.x\n");
  write(".gitignore", ".local/\n");
  for (const name of suite) pkg(name);
  pkg("lighthouse-config", { version: "0.1.0" });
  pkg("eslint-config", {
    version: "1.0.0",
    private: false,
    publishConfig: { access: "public" },
  });
  pkg("stylelint-config", {
    version: "2.0.0",
    private: false,
    publishConfig: { access: "public" },
  });
  write("packages/saika-coach/.gitkeep", "");
  write("packages/saika-live/.gitkeep", "");
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
  function run() {
    const result = spawnSync(
      "bash",
      [
        "scripts/pre-release-check.sh",
        "--ci",
        "--skip-ci",
        "--skip-security",
        "--skip-git",
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  }
  return { root, write, pkg, run };
}

test("accepts private configs, independent config versions, reserved directories and middle dots", (t) => {
  const f = fixture(t);
  f.write(
    "packages/saika-lane/src/label.ts",
    'export const label = "Lane · Score";\n',
  );
  f.write("packages/saika-vista/.local/note.md", "日本語のローカルメモ\n");
  const result = f.run();
  assert.equal(result.status, 0, result.output);
});

test("rejects non-private configs without public access", (t) => {
  const f = fixture(t);
  f.pkg("eslint-config", {
    private: false,
    publishConfig: { access: "restricted" },
  });
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Publishing \/ Public package config/);
});

for (const [file, check] of [
  ["LICENSE", "Publishing / Package LICENSE files"],
  ["README.md", "Docs / Package READMEs"],
]) {
  test(`rejects real packages missing ${file}`, (t) => {
    const f = fixture(t);
    rmSync(join(f.root, "packages/lighthouse-config", file));
    const result = f.run();
    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes(`FAIL  ${check}`), result.output);
    assert.match(result.output, /packages\/lighthouse-config\//);
  });
}

for (const app of suite.filter((name) => name !== "saika-docs")) {
  test(`rejects Japanese text in ${app}`, (t) => {
    const f = fixture(t);
    f.write(`packages/${app}/src/label.ts`, 'export const label = "得点";\n');
    const result = f.run();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /FAIL +Docs \/ Japanese text/);
  });
}

test("rejects mismatched suite versions", (t) => {
  const f = fixture(t);
  f.pkg("saika-vista", { version: "0.3.0" });
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Versions \/ Suite versions/);
});

test("rejects missing suite packages", (t) => {
  const f = fixture(t);
  rmSync(join(f.root, "packages/saika-vista"), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Versions \/ Suite versions/);
});

test("rejects malformed suite manifests", (t) => {
  const f = fixture(t);
  f.write("packages/saika-vista/package.json", "{");
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Versions \/ Suite versions/);
});

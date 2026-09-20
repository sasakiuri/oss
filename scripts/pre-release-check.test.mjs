// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
  function run({ security = false, env = {} } = {}) {
    const result = spawnSync(
      "bash",
      [
        "scripts/pre-release-check.sh",
        "--ci",
        "--skip-ci",
        ...(security
          ? ["--skip-publishing", "--skip-docs", "--skip-versions"]
          : ["--skip-security"]),
        "--skip-git",
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, ...env },
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

test("preserves Nilay software and content licenses without relaxing other packages", (t) => {
  const f = fixture(t);
  f.pkg("nilay-knowledge", {
    version: "0.1.0",
    license: "(MIT AND CC-BY-SA-4.0)",
  });
  const accepted = f.run();
  assert.equal(accepted.status, 0, accepted.output);

  f.pkg("nilay-knowledge", { license: "MIT" });
  const relicensed = f.run();
  assert.notEqual(relicensed.status, 0, relicensed.output);
  assert.match(relicensed.output, /nilay-knowledge: MIT/);

  f.pkg("nilay-knowledge", { license: "(MIT AND CC-BY-SA-4.0)" });
  f.pkg("saika-lane", { license: "(MIT AND CC-BY-SA-4.0)" });
  const unrelated = f.run();
  assert.notEqual(unrelated.status, 0, unrelated.output);
  assert.match(unrelated.output, /saika-lane: \(MIT AND CC-BY-SA-4\.0\)/);
});

function securityFixture(t) {
  const f = fixture(t);
  f.write(".gitignore", ".local/\n.next/\nout/\n");
  for (const file of [
    "packages/saika-lane/src/main/createMainWindowOptions.ts",
    "packages/saika-lane/src/main/modules/report/infra/PrintWindowService.ts",
    "packages/saika-director/src/main/main.ts",
    "packages/saika-director/src/main/infrastructure/window/WindowManager.ts",
  ]) {
    f.write(
      file,
      "const options = { nodeIntegration: false, contextIsolation: true, sandbox: true };\n",
    );
  }
  const bin = join(f.root, ".local/bin");
  // Isolate network/dependency scanners; the source-security functions are real.
  for (const [name, output] of [
    ["gitleaks", ""],
    ["osv-scanner", ""],
    ["npm", '{"metadata":{"vulnerabilities":{}}}'],
  ]) {
    f.write(`.local/bin/${name}`, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return {
    ...f,
    run: () =>
      f.run({ security: true, env: { PATH: `${bin}:${process.env.PATH}` } }),
  };
}

test("security scans ignore local/build data but inspect nonignored new sources", (t) => {
  const f = securityFixture(t);
  const content =
    'const password = "fixture-credential-value"; const broker = "mqtt://operator:credential@broker.invalid"; const path = "/home/private-user/data"; const email = "private-user@company.invalid";\n';
  for (const file of [
    ".local/private.ts",
    "packages/saika-docs/.next/private.js",
    "packages/saika-docs/out/private.json",
  ]) {
    f.write(file, content);
  }
  let result = f.run();
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /private\.(ts|js|json)/);
  f.write("packages/saika-lane/src/new.ts", content);
  result = f.run();
  assert.equal(result.status, 1, result.output);
  for (const category of [
    "Hardcoded secrets",
    "Internal URLs/paths",
    "Personal info leak",
    "MQTT credential leak",
  ]) {
    assert.ok(
      result.output.includes(`FAIL  Security / ${category}`),
      result.output,
    );
  }
  assert.match(result.output, /packages\/saika-lane\/src\/new\.ts:1/);
  assert.doesNotMatch(
    result.output,
    /fixture-credential-value|private-user|operator:credential/,
  );
});

test("security scans retain tracked files that later match ignore rules", (t) => {
  const f = securityFixture(t);
  f.write(
    "packages/saika-lane/src/tracked.ts",
    'const token = "literal-credential";\n',
  );
  assert.equal(
    spawnSync("git", ["add", "packages/saika-lane/src/tracked.ts"], {
      cwd: f.root,
    }).status,
    0,
  );
  f.write(".gitignore", ".local/\npackages/saika-lane/src/tracked.ts\n");
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Security \/ Hardcoded secrets/);
  assert.match(result.output, /tracked\.ts:1/);
});

for (const [name, content] of [
  ["password", 'const password = "literal-credential";'],
  ["token", 'const options = { token: "literal-credential" };'],
  ["JSON", '{"api_key": "literal-credential"}'],
  ["template", "const secret = `literal-credential`;"],
  ["multiline", 'const secret =\n  "literal-credential";'],
  ["typed", 'const password: string | undefined = "literal-credential";'],
  ["suffix name", 'const client_secret = "literal-credential";'],
  ["dotted API key", 'api.key = "literal-credential";'],
  [
    "trailing comment",
    'const password = "literal-credential"; // configuration',
  ],
]) {
  test(`rejects nonempty static ${name} credentials without printing their value`, (t) => {
    const f = securityFixture(t);
    f.write(
      `packages/saika-lane/src/config.${name === "JSON" ? "json" : "ts"}`,
      content,
    );
    const result = f.run();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /FAIL +Security \/ Hardcoded secrets/);
    assert.match(
      result.output,
      /Static credential value: packages\/saika-lane\/src\/config\.(?:ts|json):1/,
    );
    assert.doesNotMatch(result.output, /literal-credential/);
  });
}

test("accepts runtime credentials, types, random generation, empty strings and comparisons", (t) => {
  const f = securityFixture(t);
  f.write(
    "packages/saika-lane/src/credentials.ts",
    [
      "interface Credentials { password: string; secret: string }",
      "function check(secret: string) { return secret === 'expected'; }",
      "const password = environment.PASSWORD;",
      "const token = document.cookie;",
      "const options = { password: credentials.password, secret: randomBytes(32).toString('base64url') };",
      "const empty = { password: '', token: \"\", secret: `` };",
      "const dynamic = { token: `Bearer ${runtimeToken}` };",
      "const secret = /password|authorization|cookie|token|secret/i;",
      "const label = reveal ? 'Hide pairing secret' : 'Show pairing secret';",
      "const kind = sensitive ? 'secret' : 'public';",
      "// const password = 'comment-example';",
      "/* const token = 'comment-example'; */",
    ].join("\n"),
  );
  const result = f.run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PASS +Security \/ Hardcoded secrets/);
});

test("warns on synthetic test credentials and ignores masked MQTT userinfo", (t) => {
  const f = securityFixture(t);
  f.write(
    "packages/saika-director/tests/connection.test.ts",
    'const password = "test-password"; const broker = "mqtt://operator:password@localhost";\n',
  );
  f.write(
    "packages/saika-director/src/masked.ts",
    'const message = "Connected to mqtt://***@localhost";\n',
  );
  const result = f.run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /WARN +Security \/ Hardcoded secrets/);
  assert.match(result.output, /WARN +Security \/ MQTT credential leak/);
  assert.match(result.output, /connection\.test\.ts:1/);
  assert.doesNotMatch(
    result.output,
    /masked\.ts|test-password|operator:password/,
  );
});

test("warns on explicit LAN examples and test paths but rejects unexplained production endpoints", (t) => {
  const f = securityFixture(t);
  f.write(
    "packages/saika-docs/README.md",
    "For example, connect to mqtt://192.168.10.10:1883.\n",
  );
  f.write(
    "packages/saika-lane/src/Endpoint.tsx",
    '<input placeholder="http://192.168.1.20:4180" />;\n',
  );
  f.write(
    "packages/saika-lane/tests/path.test.ts",
    'const directory = "/home/saika/data"; const endpoint = "http://10.0.0.1";\n',
  );
  let result = f.run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /WARN +Security \/ Internal URLs\/paths/);
  for (const path of ["README.md:1", "Endpoint.tsx:1", "path.test.ts:1"]) {
    assert.ok(result.output.includes(path), result.output);
  }
  f.write(
    "packages/saika-lane/src/config.ts",
    'const endpoint = "http://10.24.30.40";\nconst directory = "/home/private-user/data";\n',
  );
  result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL +Security \/ Internal URLs\/paths/);
  assert.match(result.output, /config\.ts:1/);
  assert.match(result.output, /config\.ts:2/);
  assert.doesNotMatch(result.output, /10\.24\.30\.40|private-user/);
});

test("security scans fail closed when Git cannot enumerate files", (t) => {
  const f = securityFixture(t);
  rmSync(join(f.root, ".git"), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Unable to enumerate source files with Git/);
  for (const category of [
    "Hardcoded secrets",
    "Internal URLs/paths",
    "Personal info leak",
    "MQTT credential leak",
  ]) {
    assert.ok(
      result.output.includes(`FAIL  Security / ${category}`),
      result.output,
    );
  }
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

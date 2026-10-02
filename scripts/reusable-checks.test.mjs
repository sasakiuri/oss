// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "consumer-tooling-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, name, content) {
  const target = join(root, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    typeof content === "string" ? content : JSON.stringify(content),
  );
}

// Replace external commands in an isolated process, leaving the real parsers,
// formatters and license scanner to inspect only the explicit fixture checkout.
function runTool(name, code, options = {}) {
  const url = new URL(`./${name}.mjs`, import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from "node:assert/strict";
    import commands from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    const options = ${JSON.stringify(options)};
    const calls = [];
    commands.execFileSync = (command, args, settings) => {
      assert.equal(command, "git");
      assert.deepEqual(args, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      calls.push({ command, args, cwd: settings.cwd });
      if (options.commandError) throw new Error(options.commandError);
      return (options.files ?? []).join("\\0");
    };
    commands.spawnSync = (command, args, settings) => {
      calls.push({ command, args, cwd: settings.cwd });
      if (options.commandError) return { error: new Error(options.commandError) };
      if (command === "docker") {
        const status = (options.statuses ?? []).shift();
        return { status: status === undefined ? 0 : status };
      }
      assert.ok(command === "npm" || command === "npm.cmd");
      return { status: options.npmStatus ?? 0, stdout: JSON.stringify(options.tree), stderr: "" };
    };
    syncBuiltinESMExports();
    process.argv = options.cliArgs
      ? [process.execPath, ${JSON.stringify(fileURLToPath(url))}, ...options.cliArgs]
      : [process.execPath, "consumer-tool.mjs", "--unknown-consumer-flag"];
    process.exitCode = options.initialExitCode;
    const tool = await import(${JSON.stringify(url.href)});
    ${code}
    console.log("RESULT:" + JSON.stringify({ calls, exitCode: process.exitCode ?? null }));
    process.exitCode = 0;
  `,
    ],
    { cwd: options.cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const match = result.stdout.match(/RESULT:(.*)\n$/);
  assert.ok(match, result.stdout);
  return {
    ...JSON.parse(match[1]),
    stdout: result.stdout.slice(0, match.index),
    stderr: result.stderr,
  };
}

test("imports do not launch checks, parse caller arguments or change exit status", (t) => {
  const root = fixture(t);
  write(root, "manual.md", "MQTT接続\n");
  for (const name of [
    "lint-text",
    "lint-infra",
    "generate-third-party-licenses",
  ]) {
    const result = runTool(name, "", { cwd: root, initialExitCode: 7 });
    assert.deepEqual(result.calls, []);
    assert.equal(result.exitCode, 7);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
  assert.equal(readFileSync(join(root, "manual.md"), "utf8"), "MQTT接続\n");
  assert.equal(existsSync(join(root, "THIRD-PARTY-LICENSES.txt")), false);
});

test("all APIs require caller-supplied roots before performing work", (t) => {
  const cwd = fixture(t);
  for (const [name, code] of [
    [
      "lint-text",
      "await assert.rejects(tool.lintText({}), /explicit repository root/);",
    ],
    [
      "lint-infra",
      "assert.throws(() => tool.lintInfrastructure({}), /explicit repository root/);",
    ],
    [
      "generate-third-party-licenses",
      "await assert.rejects(tool.generateLicenseReport({appDirectories: []}), /explicit repository root/);",
    ],
  ]) {
    assert.deepEqual(runTool(name, code, { cwd }).calls, []);
  }
});

test("text checks and fixes use consumer files, policy and ignores", (t) => {
  const root = fixture(t);
  const cwd = fixture(t);
  write(root, ".textlintrc.json", {
    rules: {
      [require.resolve("textlint-rule-ja-space-between-half-and-full-width")]: {
        space: ["alphabets"],
      },
    },
  });
  write(root, ".textlintignore", "ignored.md\n");
  write(root, "manual.md", "MQTT接続\n");
  write(root, "new.txt", "JSON形式\n");
  write(root, "ignored.md", "CSV出力\n");
  write(root, "example.js", "const text = 'MQTT接続';\n");
  write(cwd, "manual.md", "CSV出力\n");
  const options = {
    root,
    cwd,
    files: [
      "manual.md",
      "manual.md",
      "new.txt",
      "ignored.md",
      "deleted.md",
      "example.js",
    ],
  };
  const checked = runTool(
    "lint-text",
    `
    assert.equal(await tool.lintText({ root: options.root }), 2);
  `,
    options,
  );
  assert.equal(checked.calls[0].cwd, root);
  assert.match(checked.stdout, /Text spacing: 2 findings in 2 documents\./);
  assert.equal(checked.exitCode, null);
  assert.equal(readFileSync(join(root, "manual.md"), "utf8"), "MQTT接続\n");

  const fixed = runTool(
    "lint-text",
    `
    assert.equal(await tool.lintText({ root: options.root, fix: true }), 0);
  `,
    options,
  );
  assert.match(fixed.stdout, /Text spacing: 0 findings in 2 documents\./);
  assert.equal(readFileSync(join(root, "manual.md"), "utf8"), "MQTT 接続\n");
  assert.equal(readFileSync(join(root, "new.txt"), "utf8"), "JSON 形式\n");
  assert.equal(readFileSync(join(root, "ignored.md"), "utf8"), "CSV出力\n");
  assert.equal(readFileSync(join(cwd, "manual.md"), "utf8"), "CSV出力\n");
});

test("infrastructure checks mount only the consumer and retain immutable offline images", (t) => {
  const root = fixture(t);
  const policyRoot = fixture(t);
  write(policyRoot, "hadolint.yaml", "failure-threshold: warning\n");
  symlinkSync(join(policyRoot, "hadolint.yaml"), join(root, ".hadolint.yaml"));
  for (const filename of [
    "run.sh",
    ".husky/pre-commit",
    ".husky/commit-msg",
    "Dockerfile",
    "nested/Dockerfile.test",
  ])
    write(root, filename, "fixture");
  const result = runTool(
    "lint-infra",
    `
    assert.equal(await tool.lintInfrastructure({ root: options.root }), 0);
  `,
    {
      root,
      cwd: fixture(t),
      files: [
        "run.sh",
        ".husky/pre-commit",
        ".husky/commit-msg",
        "Dockerfile",
        "nested/Dockerfile.test",
        "manual.md",
        "deleted.sh",
        ".agents/private.sh",
      ],
    },
  );
  assert.equal(result.calls[0].cwd, root);
  const dockerCalls = result.calls.slice(1);
  assert.equal(dockerCalls.length, 4);
  for (const call of dockerCalls) {
    assert.equal(call.command, "docker");
    assert.equal(call.cwd, root);
    assert.deepEqual(call.args.slice(0, 8), [
      "run",
      "--rm",
      "--network",
      "none",
      "--volume",
      `${root}:/repo:ro`,
      "--workdir",
      "/repo",
    ]);
  }
  assert.deepEqual(
    dockerCalls.map((call) =>
      call.args.find((argument) => argument.includes("@sha256:")),
    ),
    [
      "koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d",
      "rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667",
      "hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e",
      "ghcr.io/zizmorcore/zizmor:1.29.0@sha256:863026d54f91271b10b60b67ad8054cb37120167e162482597db102b3026a284",
    ],
  );
  assert.deepEqual(dockerCalls[0].args.slice(9), [
    "--severity=info",
    "run.sh",
    ".husky/pre-commit",
    ".husky/commit-msg",
  ]);
  assert.deepEqual(dockerCalls[2].args.slice(8, 10), [
    "--volume",
    `${join(policyRoot, "hadolint.yaml")}:/policy/hadolint.yaml:ro`,
  ]);
  assert.deepEqual(dockerCalls[2].args.slice(11), [
    "hadolint",
    "--config",
    "/policy/hadolint.yaml",
    "Dockerfile",
    "nested/Dockerfile.test",
  ]);
  assert.deepEqual(dockerCalls[3].args.slice(9), [
    "--offline",
    "--no-progress",
    "--min-severity",
    "low",
    ".github",
  ]);
});

test("infrastructure failures return the tool status without exiting the caller", (t) => {
  for (const status of [4, null]) {
    const root = fixture(t);
    const result = runTool(
      "lint-infra",
      `
      assert.equal(await tool.lintInfrastructure({ root: options.root }), ${status || 1});
    `,
      { root, cwd: root, statuses: [status], initialExitCode: 7 },
    );
    assert.equal(result.calls.length, 2);
    assert.equal(result.exitCode, 7);
  }
});

function licenseFixture(t) {
  const root = fixture(t);
  const appDirectory = "packages/consumer-app";
  const dependencyPath = join(root, "node_modules", "fixture-dependency");
  write(root, "package.json", {
    name: "consumer-fixture",
    version: "1.0.0",
    private: true,
    workspaces: ["packages/*"],
    dependencies: { "fixture-dependency": "1.0.0" },
  });
  write(root, `${appDirectory}/package.json`, {
    name: "@example/consumer-app",
    version: "1.0.0",
    dependencies: { "fixture-dependency": "1.0.0" },
  });
  write(root, "packages/other-app/package.json", {
    name: "@example/other-app",
    version: "1.0.0",
  });
  write(root, "packages/optional-requirer/package.json", {
    name: "@example/optional-requirer",
    version: "1.0.0",
    peerDependencies: { "fixture-dependency": "^2.0.0" },
    peerDependenciesMeta: { "fixture-dependency": { optional: true } },
  });
  write(root, "node_modules/fixture-dependency/package.json", {
    name: "fixture-dependency",
    version: "1.0.0",
    license: "MIT",
  });
  write(
    root,
    "node_modules/fixture-dependency/LICENSE",
    "Fixture license text.\n",
  );
  write(
    root,
    "node_modules/fixture-dependency/NOTICE",
    "Fixture copyright notice.\n",
  );
  const tree = {
    name: "consumer-fixture",
    problems: [`invalid: fixture-dependency@1.0.0 ${dependencyPath}`],
    dependencies: {
      "@example/consumer-app": {
        name: "@example/consumer-app",
        version: "1.0.0",
        dependencies: {
          "fixture-dependency": {
            name: "fixture-dependency",
            version: "1.0.0",
            path: dependencyPath,
            invalid: '"^2.0.0" from packages/optional-requirer',
          },
        },
      },
    },
  };
  return { root, appDirectory, tree, cwd: fixture(t) };
}

test("license generation and checking use the consumer dependency tree and selected workspace", (t) => {
  const options = licenseFixture(t);
  const argumentsCode = `{
    repositoryRoot: options.root,
    appDirectories: [options.appDirectory, "packages/other-app"],
    selectedWorkspace: "@example/consumer-app"
  }`;
  const generated = runTool(
    "generate-third-party-licenses",
    `
    assert.equal(await tool.generateLicenseReport(${argumentsCode}), 0);
  `,
    options,
  );
  assert.equal(generated.calls.length, 1);
  assert.equal(generated.calls[0].cwd, options.root);
  assert.deepEqual(generated.calls[0].args, [
    "ls",
    "--workspace",
    "@example/consumer-app",
    "--omit=dev",
    "--all",
    "--json",
    "--long",
  ]);
  const reportPath = join(
    options.root,
    options.appDirectory,
    "THIRD-PARTY-LICENSES.txt",
  );
  const report = readFileSync(reportPath, "utf8");
  assert.match(report, /fixture-dependency@1\.0\.0/);
  assert.match(report, /Fixture license text\./);
  assert.match(report, /Fixture copyright notice\./);
  assert.equal(
    existsSync(
      join(options.root, "packages/other-app/THIRD-PARTY-LICENSES.txt"),
    ),
    false,
  );
  assert.equal(generated.exitCode, null);
  const checked = runTool(
    "generate-third-party-licenses",
    `
    assert.equal(await tool.generateLicenseReport({ ...${argumentsCode}, checkOnly: true }), 0);
  `,
    options,
  );
  assert.match(
    checked.stdout,
    /Verified 1 production package\/version license entries/,
  );
  writeFileSync(reportPath, "Stale report.\n");
  const stale = runTool(
    "generate-third-party-licenses",
    `
    assert.equal(await tool.generateLicenseReport({ ...${argumentsCode}, checkOnly: true }), 1);
  `,
    options,
  );
  assert.match(stale.stderr, /THIRD-PARTY-LICENSES\.txt is stale/);
  assert.equal(readFileSync(reportPath, "utf8"), "Stale report.\n");
});

test("license scanning matches npm's normalized version without accepting another version", (t) => {
  const options = licenseFixture(t);
  const manifestPath = "node_modules/fixture-dependency/package.json";
  rmSync(join(options.root, "node_modules/fixture-dependency/LICENSE"));
  for (const [version, expectedStatus] of [
    ["v1.0.0", 0],
    ["v2.0.0", 1],
  ]) {
    write(options.root, manifestPath, {
      name: "fixture-dependency",
      version,
      license: "MIT",
    });
    const result = runTool(
      "generate-third-party-licenses",
      `
      assert.equal(await tool.generateLicenseReport({
        repositoryRoot: options.root,
        appDirectories: [options.appDirectory]
      }), ${expectedStatus});
      `,
      options,
    );
    if (expectedStatus === 0) {
      const report = readFileSync(
        join(options.root, options.appDirectory, "THIRD-PARTY-LICENSES.txt"),
        "utf8",
      );
      assert.match(report, /fixture-dependency@1\.0\.0/);
      assert.match(report, /MIT/);
      assert.doesNotMatch(report, /fixture-dependency@v1\.0\.0/);
    } else {
      assert.match(result.stderr, /Could not resolve license text/);
    }
  }
});

test("license version normalization preserves digit-prefixed scopes", (t) => {
  const options = licenseFixture(t);
  const name = "@v1/tools";
  for (const path of ["package.json", `${options.appDirectory}/package.json`]) {
    const manifest = JSON.parse(readFileSync(join(options.root, path), "utf8"));
    manifest.dependencies[name] = "1.0.0";
    write(options.root, path, manifest);
  }
  write(options.root, `node_modules/${name}/package.json`, {
    name,
    version: "v1.0.0",
    license: "MIT",
  });
  options.tree.dependencies["@example/consumer-app"].dependencies[name] = {
    name,
    version: "1.0.0",
    path: join(options.root, "node_modules", name),
  };
  runTool(
    "generate-third-party-licenses",
    `assert.equal(await tool.generateLicenseReport({
      repositoryRoot: options.root,
      appDirectories: [options.appDirectory]
    }), 0);`,
    options,
  );
  const report = readFileSync(
    join(options.root, options.appDirectory, "THIRD-PARTY-LICENSES.txt"),
    "utf8",
  );
  assert.match(report, /@v1\/tools@1\.0\.0/);
  assert.doesNotMatch(report, /@1\/tools/);
});

test("unrelated linked tooling problems do not invalidate the workspace production closure", (t) => {
  const options = licenseFixture(t);
  const toolingRoot = fixture(t);
  write(toolingRoot, "package.json", {
    name: "fixture-tooling",
    version: "1.0.0",
    devDependencies: { "fixture-build-tool": "^2.0.0" },
  });
  symlinkSync(
    toolingRoot,
    join(options.root, "node_modules/fixture-tooling"),
    "junction",
  );
  mkdirSync(join(options.root, "node_modules/@example"), { recursive: true });
  symlinkSync(
    join(options.root, "packages/other-app"),
    join(options.root, "node_modules/@example/other-app"),
    "junction",
  );
  const missingProblem =
    "missing: fixture-build-tool@^2.0.0, required by fixture-tooling@1.0.0";
  const invalidProblem =
    "invalid: fixture-dev-peer@1.0.0 /fixture-tooling/node_modules/fixture-dev-peer";
  options.tree.problems.push(missingProblem, invalidProblem);
  options.tree.dependencies["fixture-tooling"] = {
    name: "fixture-tooling",
    version: "1.0.0",
    extraneous: true,
    dependencies: {
      "fixture-build-tool": { missing: true, problems: [missingProblem] },
      "fixture-dev-peer": {
        version: "1.0.0",
        invalid: '"^2.0.0" from node_modules/fixture-tooling',
        problems: [invalidProblem],
      },
    },
  };
  options.tree.dependencies["@example/consumer-app"].dependencies[
    "stale-module"
  ] = {
    extraneous: true,
    dependencies: {
      "fixture-build-tool": { missing: true, problems: [missingProblem] },
    },
  };
  options.npmStatus = 1;
  const result = runTool(
    "generate-third-party-licenses",
    `
    assert.equal(await tool.generateLicenseReport({
      repositoryRoot: options.root,
      appDirectories: [options.appDirectory]
    }), 0);
  `,
    options,
  );
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /Unable to determine license content/);
  assert.match(
    result.stdout,
    /Wrote 1 production package\/version license entries/,
  );
  const report = readFileSync(
    join(options.root, options.appDirectory, "THIRD-PARTY-LICENSES.txt"),
    "utf8",
  );
  assert.doesNotMatch(
    report,
    /fixture-build-tool|fixture-dev-peer|stale-module/,
  );
});

test("missing production dependencies remain fatal even when root tooling has the same problem", (t) => {
  for (const includeNodeProblems of [true, false]) {
    const options = licenseFixture(t);
    const problem =
      "missing: fixture-runtime@^1.0.0, required by @example/consumer-app@1.0.0";
    const missingNode = {
      missing: true,
      ...(includeNodeProblems ? { problems: [problem] } : {}),
    };
    options.tree.problems.push(problem);
    options.tree.dependencies["@example/consumer-app"].dependencies[
      "fixture-runtime"
    ] = missingNode;
    options.tree.dependencies["fixture-tooling"] = {
      extraneous: true,
      dependencies: {
        "fixture-runtime": { missing: true, problems: [problem] },
      },
    };
    options.npmStatus = 1;
    const result = runTool(
      "generate-third-party-licenses",
      `
      assert.equal(await tool.generateLicenseReport({
        repositoryRoot: options.root,
        appDirectories: [options.appDirectory]
      }), 1);
    `,
      options,
    );
    assert.match(result.stderr, /invalid production dependency tree/);
    assert.match(result.stderr, /missing: fixture-runtime/);
    assert.equal(
      existsSync(
        join(options.root, options.appDirectory, "THIRD-PARTY-LICENSES.txt"),
      ),
      false,
    );
  }
});

test("invalid required production versions remain fatal alongside unrelated tooling errors", (t) => {
  const options = licenseFixture(t);
  const dependency =
    options.tree.dependencies["@example/consumer-app"].dependencies[
      "fixture-dependency"
    ];
  dependency.invalid = '"^2.0.0" from packages/consumer-app';
  dependency.problems = [...options.tree.problems];
  options.tree.problems.push(
    "missing: fixture-build-tool@^1.0.0, required by fixture-tooling@1.0.0",
  );
  options.npmStatus = 1;
  const result = runTool(
    "generate-third-party-licenses",
    `
    assert.equal(await tool.generateLicenseReport({
      repositoryRoot: options.root,
      appDirectories: [options.appDirectory]
    }), 1);
  `,
    options,
  );
  assert.match(result.stderr, /invalid: fixture-dependency@1\.0\.0/);
  assert.doesNotMatch(result.stderr, /fixture-build-tool/);
  assert.equal(
    existsSync(
      join(options.root, options.appDirectory, "THIRD-PARTY-LICENSES.txt"),
    ),
    false,
  );
});

test("consumer command failures do not retry against the tooling checkout", (t) => {
  const options = licenseFixture(t);
  options.commandError = "Consumer command failed";
  for (const [name, code] of [
    [
      "lint-text",
      "await assert.rejects(tool.lintText({root: options.root}), /Consumer command failed/);",
    ],
    [
      "lint-infra",
      "assert.throws(() => tool.lintInfrastructure({root: options.root}), /Consumer command failed/);",
    ],
    [
      "generate-third-party-licenses",
      "assert.equal(await tool.generateLicenseReport({repositoryRoot: options.root, appDirectories: [options.appDirectory]}), 1);",
    ],
  ]) {
    const result = runTool(name, code, options);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].cwd, options.root);
  }
});

test("standalone entrypoints retain source checkout defaults and status handling", (t) => {
  const cwd = fixture(t);
  const text = runTool("lint-text", "", {
    cwd,
    cliArgs: [],
    files: ["README.md"],
  });
  assert.equal(text.calls[0].cwd, repositoryRoot.replace(/\/$/, ""));
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /Text spacing: 0 findings in 1 documents\./);
  const invalid = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./lint-text.mjs", import.meta.url)), "--unknown"],
    { cwd, encoding: "utf8" },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage: node scripts\/lint-text\.mjs \[--fix\]/);

  const infrastructure = runTool("lint-infra", "", {
    cwd,
    cliArgs: [],
    statuses: [3],
  });
  assert.equal(infrastructure.calls[0].cwd, repositoryRoot.replace(/\/$/, ""));
  assert.equal(infrastructure.exitCode, 3);
  assert.equal(infrastructure.calls.length, 2);

  const licenses = runTool("generate-third-party-licenses", "", {
    cwd,
    cliArgs: ["--check", "--workspace=@example/unknown-app"],
  });
  assert.deepEqual(licenses.calls, []);
  assert.equal(licenses.exitCode, 1);
  assert.match(
    licenses.stderr,
    /Unknown application workspace: @example\/unknown-app/,
  );
});

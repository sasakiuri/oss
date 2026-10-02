// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkLicenses } from "../license-check.mjs";

const require = createRequire(import.meta.url);
const Arborist = createRequire(require.resolve("licensee"))("@npmcli/arborist");
const sourcePolicy = fileURLToPath(
  new URL("../../../.licensee.json", import.meta.url),
);

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "consumer-license-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = resolve(directory, "consumer");
  mkdirSync(root);
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({
      name: "consumer-root",
      private: true,
      workspaces: ["packages/*"],
    }),
  );
  mkdirSync(resolve(root, "packages"));
  symlinkSync(sourcePolicy, resolve(root, ".licensee.json"), "file");
  const errors = [];
  t.mock.method(console, "error", (message) => errors.push(message));
  return { root, directory, errors };
}

function packageNode(directory, name, license, extra = {}) {
  return {
    path: directory,
    realpath: directory,
    package: {
      name,
      version: "1.0.0",
      ...(license === undefined ? {} : { license }),
    },
    version: "1.0.0",
    edgesIn: new Set([{}]),
    edgesOut: new Map(),
    ...extra,
  };
}

function inventory(t, root, nodes) {
  t.mock.method(Arborist.prototype, "loadActual", async function (options) {
    assert.equal(this.path, root);
    assert.deepEqual(options, { forceActual: true });
    return {
      inventory: new Map([
        [
          root,
          packageNode(root, "consumer-root", undefined, {
            isProjectRoot: true,
          }),
        ],
        ...nodes.map((node, index) => [index, node]),
      ]),
    };
  });
}

test("uses the consumer root and unchanged shared policy to accept MIT and reject AGPL", async (t) => {
  const { root, errors } = fixture(t);
  const policy = readFileSync(sourcePolicy, "utf8");
  const dependency = packageNode(
    resolve(root, "node_modules/fixture-runtime"),
    "fixture-runtime",
    "MIT",
  );
  inventory(t, root, [dependency]);
  assert.equal(await checkLicenses(root), 0);
  assert.deepEqual(errors, []);
  dependency.package.license = "AGPL-3.0-only";
  assert.equal(await checkLicenses(root), 1);
  assert.match(
    errors.join("\n"),
    /fixture-runtime@1\.0\.0: NOT APPROVED \(AGPL-3\.0-only\)/,
  );
  assert.equal(readFileSync(sourcePolicy, "utf8"), policy);
  assert.equal(readFileSync(resolve(root, ".licensee.json"), "utf8"), policy);
});

test("filters verified empty external source ancestors while checking their linked tools", async (t) => {
  const { root, directory, errors } = fixture(t);
  const sourceRoot = packageNode(
    resolve(directory, "source"),
    undefined,
    undefined,
    { package: {}, edgesIn: new Set(), edgesOut: new Map() },
  );
  const sourceParent = packageNode(
    resolve(directory, "source/packages/tool-profile"),
    undefined,
    undefined,
    {
      package: {},
      edgesIn: new Set(),
      edgesOut: new Map(),
      parent: sourceRoot,
    },
  );
  const tool = packageNode(
    resolve(
      directory,
      "source/packages/tool-profile/node_modules/fixture-tool",
    ),
    "fixture-tool",
    "MIT",
    { parent: sourceParent },
  );
  const link = packageNode(
    resolve(root, "node_modules/fixture-tool"),
    "fixture-tool",
    "MIT",
    { isLink: true, realpath: tool.realpath, target: tool },
  );
  inventory(t, root, [sourceRoot, sourceParent, tool, link]);
  assert.equal(await checkLicenses(root), 0);
  assert.deepEqual(errors, []);
  tool.package.license = "AGPL-3.0-only";
  link.package.license = "AGPL-3.0-only";
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.join("\n"), /fixture-tool@1\.0\.0: NOT APPROVED/);
});

test("required malformed packages are fatal even when they are external source ancestors", async (t) => {
  const { root, directory, errors } = fixture(t);
  const malformed = packageNode(
    resolve(directory, "source"),
    undefined,
    "MIT",
    { package: {}, edgesIn: new Set([{}]) },
  );
  const target = packageNode(
    resolve(directory, "source/node_modules/fixture-tool"),
    "fixture-tool",
    "MIT",
    { parent: malformed },
  );
  const link = packageNode(
    resolve(root, "node_modules/fixture-tool"),
    "fixture-tool",
    "MIT",
    { isLink: true, realpath: target.realpath, target },
  );
  inventory(t, root, [malformed, target, link]);
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.join("\n"), /Installed package is missing its name/);
  assert.match(
    errors.join("\n"),
    new RegExp(malformed.realpath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("empty external non-ancestors and unnamed packages inside the consumer remain fatal", async (t) => {
  const { root, directory, errors } = fixture(t);
  for (const location of [
    resolve(directory, "unrelated"),
    resolve(root, "node_modules/broken"),
  ]) {
    const malformed = packageNode(location, undefined, undefined, {
      package: {},
      edgesIn: new Set(),
      edgesOut: new Map(),
    });
    inventory(t, root, [malformed]);
    assert.equal(await checkLicenses(root), 1);
    assert.match(errors.at(-1), /Installed package is missing its name/);
  }
});

test("only actual private root and active workspace paths are exempt", async (t) => {
  const { root, errors } = fixture(t);
  const privatePath = resolve(root, "packages/private-app");
  const publicPath = resolve(root, "packages/public-app");
  const inactivePath = resolve(root, "inactive/private-app");
  for (const [directory, name, privatePackage] of [
    [privatePath, "@example/private-app", true],
    [publicPath, "@example/public-app", false],
    [inactivePath, "@example/inactive-app", true],
  ]) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, "package.json"),
      JSON.stringify({ name, private: privatePackage }),
    );
  }
  const ownPrivate = packageNode(
    privatePath,
    "@example/private-app",
    undefined,
  );
  const link = packageNode(
    resolve(root, "node_modules/@example/private-app"),
    "@example/private-app",
    undefined,
    { isLink: true, realpath: privatePath, target: ownPrivate },
  );
  inventory(t, root, [ownPrivate, link]);
  assert.equal(await checkLicenses(root), 0);
  assert.deepEqual(errors, []);
  for (const dependency of [
    packageNode(publicPath, "@example/public-app", "AGPL-3.0-only"),
    packageNode(inactivePath, "@example/inactive-app", "AGPL-3.0-only"),
    packageNode(
      resolve(root, "node_modules/@example/private-app-copy"),
      "@example/private-app",
      "AGPL-3.0-only",
    ),
  ]) {
    inventory(t, root, [ownPrivate, link, dependency]);
    assert.equal(await checkLicenses(root), 1);
    assert.match(errors.at(-1), /NOT APPROVED \(AGPL-3\.0-only\)/);
  }
});

test("missing license metadata, malformed versions and rejected duplicate copies fail clearly", async (t) => {
  const { root, errors } = fixture(t);
  const directory = resolve(root, "node_modules/fixture-runtime");
  inventory(t, root, [packageNode(directory, "fixture-runtime", undefined)]);
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.at(-1), /missing or invalid license metadata/);
  inventory(t, root, [
    packageNode(directory, "fixture-runtime", "MIT", { version: undefined }),
  ]);
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.at(-1), /Installed package is missing its version/);
  inventory(t, root, [
    packageNode(directory, "fixture-runtime", "MIT"),
    packageNode(
      resolve(root, "packages/public-app/node_modules/fixture-runtime"),
      "fixture-runtime",
      "AGPL-3.0-only",
    ),
  ]);
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.at(-1), /NOT APPROVED \(AGPL-3\.0-only\)/);
});

test("requires explicit roots and readable caller policies without fallback", async (t) => {
  const { root, errors } = fixture(t);
  assert.equal(await checkLicenses(), 1);
  assert.match(errors.at(-1), /explicit repository root/);
  rmSync(resolve(root, ".licensee.json"));
  assert.equal(await checkLicenses(root), 1);
  assert.match(errors.at(-1), /\.licensee\.json/);
});

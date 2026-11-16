// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
const { applications } = readJson("scripts/saika-suite.json");
const electronApplications = applications.filter(({ electron }) => electron);

test("the changeset fixed group releases the manifest applications in order", () => {
  assert.deepEqual(readJson(".changeset/config.json").fixed, [
    applications.map(({ workspace }) => workspace),
  ]);
});

test("each application names its workspace package directory", () => {
  for (const application of applications) {
    assert.deepEqual(Object.keys(application), [
      "workspace",
      "directory",
      "electron",
    ]);
    assert.equal(
      readJson(join(application.directory, "package.json")).name,
      application.workspace,
    );
  }
});

test("Electron applications match their builder product and update metadata namespace", () => {
  assert.notEqual(electronApplications.length, 0);
  const namespaces = new Set();
  for (const { directory, electron } of electronApplications) {
    assert.deepEqual(Object.keys(electron), [
      "product",
      "updateMetadataNamespace",
      "windowFiles",
      "windowGuard",
    ]);
    assert.equal(
      readJson(join(directory, "electron-builder.json")).productName,
      electron.product,
    );
    const namespace = electron.updateMetadataNamespace;
    const namespacingScripts = Object.values(
      readJson(join(directory, "package.json")).scripts,
    ).filter((script) => script.includes("namespace-update-metadata.mjs"));
    if (namespace === null) {
      assert.deepEqual(namespacingScripts, [], directory);
    } else {
      assert.equal(typeof namespace, "string");
      assert.ok(!namespaces.has(namespace), namespace);
      namespaces.add(namespace);
      assert.notEqual(namespacingScripts.length, 0, directory);
      for (const script of namespacingScripts) {
        assert.ok(
          script.includes(`namespace-update-metadata.mjs ${namespace} release`),
          script,
        );
      }
    }
  }
});

test("every Electron window and guard file named for the security check exists", () => {
  for (const { directory, electron } of electronApplications) {
    for (const file of electron.windowFiles) {
      assert.ok(existsSync(join(repoRoot, directory, file)), file);
    }
    if (electron.windowGuard !== null) {
      assert.ok(existsSync(join(repoRoot, directory, electron.windowGuard)));
    }
  }
});

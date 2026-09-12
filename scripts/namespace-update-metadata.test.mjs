// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";

import { namespaceUpdateMetadata } from "./namespace-update-metadata.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "saika-update-metadata-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const metadata = (url, version = "0.4.0") => ({
  version,
  files: [{ url, sha512: "unchanged-checksum", size: 123 }],
  path: url,
  sha512: "unchanged-checksum",
});
const write = (directory, name, data) =>
  writeFile(join(directory, name), yaml.dump(data));
const read = async (directory, name) =>
  yaml.load(await readFile(join(directory, name), "utf8"));

for (const namespace of ["director", "vista"]) {
  for (const channel of ["latest", "beta", "rc"]) {
    test(`${namespace} isolates ${channel} metadata on every platform`, async (t) => {
      const directory = await fixture(t);
      const product = namespace === "director" ? "Director" : "Vista";
      const version = channel === "latest" ? "0.4.0" : `0.4.0-${channel}.1`;
      for (const [suffix, extension] of [
        ["", "exe"],
        ["-mac", "zip"],
        ["-linux", "AppImage"],
      ]) {
        const info = metadata(
          `Saika-${product}-${version}-x64.${extension}`,
          version,
        );
        await write(directory, `${channel}${suffix}.yml`, info);
        await namespaceUpdateMetadata(directory, namespace, version);
        assert.deepEqual(
          await read(directory, `${namespace}-${channel}${suffix}.yml`),
          info,
        );
        assert.ok(
          !(await readdir(directory)).includes(`${channel}${suffix}.yml`),
        );
      }
    });
  }
}

test("a combined macOS build preserves every architecture and artifact checksum", async (t) => {
  const directory = await fixture(t);
  const info = metadata("Saika-Director-0.4.0-mac-x64.zip");
  info.files.push({
    url: "Saika-Director-0.4.0-mac-arm64.zip",
    sha512: "arm64-checksum",
    size: 456,
  });
  await write(directory, "latest-mac.yml", info);
  await namespaceUpdateMetadata(directory, "director", "0.4.0");
  assert.deepEqual(await read(directory, "director-latest-mac.yml"), info);
  assert.deepEqual(await readdir(directory), ["director-latest-mac.yml"]);
});

test("separate macOS architecture builds retain both matching installers", async (t) => {
  const directory = await fixture(t);
  for (const arch of ["x64", "arm64"]) {
    await write(
      directory,
      "latest-mac.yml",
      metadata(`Saika-Director-0.4.0-mac-${arch}.zip`),
    );
    await namespaceUpdateMetadata(directory, "director", "0.4.0");
  }
  const merged = await read(directory, "director-latest-mac.yml");
  assert.deepEqual(
    merged.files.map((file) => file.url),
    ["Saika-Director-0.4.0-mac-x64.zip", "Saika-Director-0.4.0-mac-arm64.zip"],
  );
  assert.equal(merged.files[0].sha512, "unchanged-checksum");
  assert.equal(merged.path, merged.files[0].url);
});

test("a new version replaces old architecture entries", async (t) => {
  const directory = await fixture(t);
  await write(
    directory,
    "director-latest-mac.yml",
    metadata("Saika-Director-0.3.0-mac-x64.zip", "0.3.0"),
  );
  await write(
    directory,
    "latest-mac.yml",
    metadata("Saika-Director-0.4.0-mac-arm64.zip"),
  );
  await namespaceUpdateMetadata(directory, "director", "0.4.0");
  assert.equal(
    (await read(directory, "director-latest-mac.yml")).files.length,
    1,
  );
});

test("wrong-application metadata is rejected without replacing an existing channel", async (t) => {
  const directory = await fixture(t);
  const good = metadata("Saika-Director-0.4.0-win-x64.exe");
  await write(directory, "director-latest.yml", good);
  await write(
    directory,
    "latest.yml",
    metadata("Saika-Lane-0.4.0-win-x64.exe"),
  );
  await assert.rejects(
    namespaceUpdateMetadata(directory, "director", "0.4.0"),
    /does not belong/,
  );
  assert.deepEqual(await read(directory, "director-latest.yml"), good);
});

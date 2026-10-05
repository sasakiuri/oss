// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewedAliasAdvisories } from "./dependency-review-aliases.mjs";

const readJson = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = readJson("../package.json");
const lock = readJson("../package-lock.json");
const ids = ["GHSA-grv7-fg5c-xmjg", "GHSA-vfj7-8cjw-p6xm"];
const change = {
  change_type: "added",
  manifest: "package-lock.json",
  ecosystem: "npm",
  name: "braces",
  version: "3.0.3-pn.3",
  package_url: "pkg:npm/braces@3.0.3-pn.3",
  vulnerabilities: ids.map((id) => ({ advisory_ghsa_id: id })),
};

test("only verified alias findings receive scoped advisory corrections", () => {
  assert.deepEqual(reviewedAliasAdvisories([change], lock, manifest), ids);
  assert.deepEqual(reviewedAliasAdvisories([], {}, {}), []);
  assert.deepEqual(
    reviewedAliasAdvisories([{ ...change, change_type: "removed" }], {}, {}),
    [],
  );
  assert.deepEqual(
    reviewedAliasAdvisories(
      [{ ...change, vulnerabilities: [{ advisory_ghsa_id: "unreviewed" }] }],
      lock,
      manifest,
    ),
    [],
  );
});

test("the same advisory on another package, version or manifest is never allowed", () => {
  for (const [key, value] of Object.entries({
    name: "another-package",
    version: "3.0.3",
    manifest: "another/package-lock.json",
    ecosystem: "other",
    package_url: "pkg:npm/braces@3.0.3",
  })) {
    assert.throws(
      () =>
        reviewedAliasAdvisories([{ ...change, [key]: value }], lock, manifest),
      /Unreviewed dependency finding/,
    );
  }
});

test("every alias must match the exact reviewed package, version and archive", () => {
  const paths = Object.keys(lock.packages).filter((path) =>
    path.endsWith("/braces"),
  );
  assert.ok(paths.length > 0);
  for (const path of paths) {
    for (const key of ["name", "version", "resolved", "integrity"]) {
      const altered = structuredClone(lock);
      altered.packages[path][key] = "unreviewed";
      assert.throws(
        () => reviewedAliasAdvisories([change], altered, manifest),
        /Unreviewed braces artifact/,
      );
    }
  }
  assert.throws(
    () => reviewedAliasAdvisories([change], {}, manifest),
    /No reviewed braces aliases/,
  );
  assert.throws(
    () => reviewedAliasAdvisories([change], lock, {}),
    /override is missing or changed/,
  );
});

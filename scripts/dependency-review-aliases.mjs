// SPDX-License-Identifier: MIT
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reviewedFork = {
  name: "@dieub/braces-depth-guard",
  version: "3.0.3-pn.3",
  resolved:
    "https://registry.npmjs.org/@dieub/braces-depth-guard/-/braces-depth-guard-3.0.3-pn.3.tgz",
  integrity:
    "sha512-QY+Uq4s42STyIMPoRkBuUZfYyvz0uZuwuUburLwMx5N+lWqnHHaBxcKPtgKVKjTyFnS1q4ivKu9Wxi4VG7FE9Q==",
};
const correctedAdvisories = new Set([
  "GHSA-grv7-fg5c-xmjg",
  "GHSA-vfj7-8cjw-p6xm",
]);

// GitHub's npm lockfile parser reports the alias directory as the package name.
// Correct only findings for the exact reviewed artifact; npm audit still checks
// the installed package under its real identity in the same required job.
export function reviewedAliasAdvisories(changes, lock, manifest) {
  const allowed = new Set();
  for (const change of changes) {
    if (change.change_type !== "added") continue;
    for (const vulnerability of change.vulnerabilities ?? []) {
      const id = vulnerability.advisory_ghsa_id;
      if (!correctedAdvisories.has(id)) continue;
      if (
        change.manifest !== "package-lock.json" ||
        change.ecosystem !== "npm" ||
        change.name !== "braces" ||
        change.version !== reviewedFork.version ||
        change.package_url !== `pkg:npm/braces@${reviewedFork.version}`
      ) {
        throw new Error(`Unreviewed dependency finding: ${id}`);
      }
      allowed.add(id);
    }
  }
  if (allowed.size === 0) return [];

  if (
    manifest.overrides?.braces !==
    `npm:${reviewedFork.name}@${reviewedFork.version}`
  ) {
    throw new Error("The reviewed braces override is missing or changed");
  }
  const aliases = Object.entries(lock.packages ?? {}).filter(([path]) =>
    /(?:^|\/)node_modules\/braces$/.test(path),
  );
  if (aliases.length === 0) throw new Error("No reviewed braces aliases found");
  for (const [path, entry] of aliases) {
    for (const [key, expected] of Object.entries(reviewedFork)) {
      if (entry[key] !== expected) {
        throw new Error(`Unreviewed braces artifact at ${path}: ${key}`);
      }
    }
  }
  return [...allowed].sort();
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
  const allowed = reviewedAliasAdvisories(
    readJson(process.argv[2]),
    readJson("package-lock.json"),
    readJson("package.json"),
  );
  const output = `allow-ghsas=${allowed.join(",")}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}

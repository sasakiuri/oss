#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const requestedRoots = process.argv.slice(2);
if (requestedRoots.length === 0) {
  console.error("Usage: node scripts/check-english-only.mjs <directory> [...]");
  process.exit(2);
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const pathspecs = requestedRoots.map((requestedRoot) => {
  const absoluteRoot = resolve(process.cwd(), requestedRoot);
  const relativeRoot = relative(repoRoot, absoluteRoot);
  if (relativeRoot === ".." || relativeRoot.startsWith(`..${sep}`)) {
    throw new Error(
      `Language-check directory is outside the repository: ${requestedRoot}`,
    );
  }
  return relativeRoot || ".";
});

const files = execFileSync(
  "git",
  [
    "-C",
    repoRoot,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...pathspecs,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\0")
  .filter(Boolean);

const disallowedText =
  /[\u3005\u303b\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\u{1b000}-\u{1b16f}\u{20000}-\u{2fa1f}]/u;
const disallowedJapaneseMetadata = /(?:\blang\s*=\s*["']?ja\b|\bja[-_]JP\b)/iu;
const violations = [];

for (const file of files) {
  if (disallowedText.test(file)) {
    violations.push(
      `${file}: file name contains disallowed Japanese or CJK text`,
    );
  }

  const buffer = readFileSync(resolve(repoRoot, file));
  if (buffer.includes(0)) continue;

  const lines = buffer.toString("utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!disallowedText.test(line) && !disallowedJapaneseMetadata.test(line))
      continue;
    violations.push(`${file}:${index + 1}: ${line.trim()}`);
  }
}

if (violations.length > 0) {
  console.error(
    "Japanese or CJK text is not allowed in the checked application files:",
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(`Language check passed for ${files.length} file(s).`);

// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLinter, loadLinterFormatter, loadTextlintrc } from "textlint";

export async function lintText({ root, fix = false }) {
  if (typeof root !== "string" || !root) {
    throw new TypeError("lintText requires an explicit repository root.");
  }
  root = path.resolve(root);

  // Git supplies both tracked documents and new, non-ignored documents.
  const files = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        {
          cwd: root,
          encoding: "utf8",
        },
      ).split("\0"),
    ),
  ]
    .filter((file) => /\.(md|txt)$/.test(file))
    .map((file) => path.join(root, file))
    .filter(existsSync);

  const descriptor = await loadTextlintrc({
    configFilePath: realpathSync(path.join(root, ".textlintrc.json")),
  });
  const linter = createLinter({
    descriptor,
    cwd: root,
    ignoreFilePath: path.join(root, ".textlintignore"),
  });
  if (fix) {
    const fixes = await linter.fixFiles(files);
    for (const fix of fixes) {
      if (fix.output !== fix.original)
        await writeFile(fix.filePath, fix.output);
    }
  }
  const results = await linter.lintFiles(files);
  const formatter = await loadLinterFormatter({ formatterName: "stylish" });
  const output = formatter.format(results);
  if (output) console.log(output);
  const count = results.reduce(
    (sum, result) => sum + result.messages.length,
    0,
  );
  console.log(
    `Text spacing: ${count} findings in ${results.length} documents.`,
  );
  return count;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--fix")) {
    throw new Error("Usage: node scripts/lint-text.mjs [--fix]");
  }
  const count = await lintText({
    root: fileURLToPath(new URL("../", import.meta.url)),
    fix: args.includes("--fix"),
  });
  process.exitCode = count ? 1 : 0;
}

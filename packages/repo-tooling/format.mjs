// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as prettier from "prettier";
import { repositoryFiles } from "./files.mjs";
import { isInside } from "./runtime.mjs";

export async function formatRepository(root, { write = false } = {}) {
  let checked = 0;
  let changed = 0;
  for (const file of repositoryFiles(root)) {
    const filepath = resolve(root, file);
    const ignorePath = [resolve(root, ".gitignore")];
    for (
      let directory = dirname(filepath);
      isInside(root, directory);
      directory = dirname(directory)
    ) {
      const ignore = resolve(directory, ".prettierignore");
      if (existsSync(ignore)) ignorePath.push(ignore);
      if (directory === root) break;
    }
    const info = await prettier.getFileInfo(filepath, { ignorePath });
    if (info.ignored || !info.inferredParser) continue;
    checked++;
    const options = {
      ...(await prettier.resolveConfig(filepath, { editorconfig: true })),
      filepath,
    };
    const source = readFileSync(filepath, "utf8");
    const formatted = await prettier.format(source, options);
    if (source === formatted) continue;
    changed++;
    console.log(`${write ? "Formatted" : "Unformatted"}: ${file}`);
    if (write) writeFileSync(filepath, formatted);
  }
  console.log(
    `Formatting: ${checked} files checked, ${changed} ${write ? "formatted" : "unformatted"}.`,
  );
  return write || changed === 0 ? 0 : 1;
}

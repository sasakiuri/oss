// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";

export function repositoryFiles(root) {
  return [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        },
      ).split("\0"),
    ),
  ]
    .filter(
      (file) =>
        file &&
        !file.split("/").includes(".local") &&
        existsSync(resolve(root, file)) &&
        lstatSync(resolve(root, file)).isFile(),
    )
    .sort();
}

// SPDX-License-Identifier: MIT
/** Native browser modules are served as written, so check every public script. */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const directory = new URL("../public/", import.meta.url);
for (const entry of readdirSync(directory, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const result = spawnSync(
    process.execPath,
    ["--check", join(entry.parentPath, entry.name)],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { readJson } from "./runtime.mjs";

export function checkEventContracts(root, base) {
  if (
    typeof base !== "string" ||
    ![40, 64].includes(base.length) ||
    !/^[a-f0-9]+$/.test(base)
  )
    throw new Error(
      "Pass --base with the full base commit hash (or set BASE_SHA).",
    );
  const directories = readJson(resolve(root, "package.json")).repoTooling
    ?.eventContractDirectories;
  if (
    !Array.isArray(directories) ||
    directories.length === 0 ||
    directories.some(
      (directory) =>
        typeof directory !== "string" ||
        directory.includes("\\") ||
        directory.includes("\0") ||
        isAbsolute(directory) ||
        directory
          .split("/")
          .some((part) => !part || part === "." || part === ".."),
    )
  )
    throw new Error(
      "repoTooling.eventContractDirectories must list repository-relative directories.",
    );
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    if (
      git("cat-file", "-t", base).toString().trim() !== "commit" ||
      git("rev-parse", "--verify", base).toString().trim() !== base
    )
      throw new Error("not a commit");
  } catch {
    throw new Error(`Base commit is unavailable or is not a commit: ${base}`);
  }
  const entries = git("ls-tree", "-r", "-z", "--full-tree", base)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const changed = [];
  let checked = 0;
  for (const entry of entries) {
    const separator = entry.indexOf("\t");
    const file = entry.slice(separator + 1);
    if (
      !file.endsWith(".json") ||
      !directories.some((directory) => file.startsWith(`${directory}/`))
    )
      continue;
    ++checked;
    const [mode, type, object] = entry.slice(0, separator).split(" ");
    let matches = false;
    try {
      const filename = resolve(root, file);
      const canonical = realpathSync(filename);
      matches =
        type === "blob" &&
        /^100[0-7]{3}$/.test(mode) &&
        canonical === resolve(realpathSync(root), file) &&
        lstatSync(filename).isFile() &&
        readFileSync(filename).equals(git("cat-file", "blob", object));
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
    if (!matches) changed.push(file);
  }
  return { checked, changed };
}

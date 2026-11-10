// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, win32 } from "node:path";
import { readJson } from "./runtime.mjs";

function repositoryPath(path) {
  return (
    typeof path === "string" &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !isAbsolute(path) &&
    !win32.isAbsolute(path) &&
    !/^[a-z]:/i.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function contractDirectories(manifest, required) {
  const directories = manifest.repoTooling?.eventContractDirectories;
  if (directories === undefined && !required) return [];
  if (
    !Array.isArray(directories) ||
    directories.length === 0 ||
    !directories.every(repositoryPath)
  )
    throw new Error(
      "repoTooling.eventContractDirectories must list repository-relative directories.",
    );
  return directories;
}

export function checkEventContracts(root, base) {
  root = resolve(root);
  if (
    typeof base !== "string" ||
    ![40, 64].includes(base.length) ||
    !/^[a-f0-9]+$/.test(base)
  )
    throw new Error(
      "Pass --base with the full base commit hash (or set BASE_SHA).",
    );
  const directories = contractDirectories(
    readJson(resolve(root, "package.json")),
    true,
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
  let tree;
  try {
    tree = new TextDecoder("utf-8", { fatal: true }).decode(
      git("ls-tree", "-r", "-z", "--full-tree", base),
    );
  } catch {
    throw new Error(
      "Base tree is unavailable or contains invalid UTF-8 paths.",
    );
  }
  const entries = tree.split("\0").filter(Boolean);
  const manifest = entries.find(
    (entry) => entry.slice(entry.indexOf("\t") + 1) === "package.json",
  );
  if (manifest) {
    const [mode, type, object] = manifest
      .slice(0, manifest.indexOf("\t"))
      .split(" ");
    if (type !== "blob" || !/^100[0-7]{3}$/.test(mode))
      throw new Error("Base package.json must be a regular file.");
    directories.push(
      ...contractDirectories(
        JSON.parse(git("cat-file", "blob", object)),
        false,
      ),
    );
  }
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
    if (!repositoryPath(file))
      throw new Error(
        `Unsafe repository path in base event contracts: ${file}`,
      );
    ++checked;
    const [mode, type, object] = entry.slice(0, separator).split(" ");
    let matches = false;
    try {
      const filename = resolve(root, file);
      const withinRoot = relative(root, filename);
      if (
        withinRoot === ".." ||
        withinRoot.startsWith(`..${win32.sep}`) ||
        withinRoot.startsWith("../") ||
        isAbsolute(withinRoot)
      )
        throw new Error(`Event contract resolves outside repository: ${file}`);
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

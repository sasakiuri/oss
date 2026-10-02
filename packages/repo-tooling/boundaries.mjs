// SPDX-License-Identifier: MIT
import { existsSync, lstatSync, readlinkSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { isInside, readJson, upstreamRoot } from "./runtime.mjs";

export function checkBoundaries(root, allowedRoots = []) {
  const roots = [resolve(root), ...allowedRoots.map((value) => resolve(value))];
  const violations = [];
  const check = (filename, reference) => {
    const target = resolve(dirname(resolve(root, filename)), reference);
    if (!roots.some((allowed) => isInside(allowed, target)))
      violations.push(`${filename}: ${reference}`);
  };
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const filename of files) {
    if (filename.startsWith(".agents/") || filename.startsWith(".local/"))
      continue;
    const absolute = resolve(root, filename);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const reference = readlinkSync(absolute);
      check(filename, reference);
      if (!existsSync(resolve(dirname(absolute), reference)))
        violations.push(`${filename}: missing target ${reference}`);
      continue;
    }
    if (/(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(filename)) {
      const { parseConfigFileTextToJson } = createRequire(
        resolve(upstreamRoot, "package.json"),
      )("typescript");
      const parsed = parseConfigFileTextToJson(
        filename,
        readFileSync(absolute, "utf8"),
      );
      if (parsed.error)
        throw new Error(`Invalid TypeScript configuration: ${filename}`);
      const config = parsed.config;
      for (const reference of [
        ...[].concat(config.extends ?? []),
        ...(config.references ?? []).map((entry) => entry.path),
        ...(config.compilerOptions?.baseUrl
          ? [config.compilerOptions.baseUrl]
          : []),
      ]) {
        if (typeof reference === "string" && reference.startsWith("."))
          check(filename, reference);
      }
      const base = config.compilerOptions?.baseUrl ?? ".";
      for (const references of Object.values(
        config.compilerOptions?.paths ?? {},
      )) {
        for (const reference of references)
          check(filename, `${base}/${reference}`);
      }
    }
    if (filename.endsWith("package.json")) {
      const manifest = readJson(absolute);
      for (const section of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        for (const reference of Object.values(manifest[section] ?? {})) {
          if (typeof reference === "string" && reference.startsWith("file:"))
            check(filename, reference.slice(5));
        }
      }
    }
    if (filename.endsWith("package-lock.json")) {
      const lock = readJson(absolute);
      for (const reference of Object.values(lock.packages ?? {})
        .map((entry) => entry.resolved)
        .filter(Boolean)) {
        if (reference.startsWith("file:")) check(filename, reference.slice(5));
        else if (reference.startsWith("../")) check(filename, reference);
      }
    }
    if (/\.(?:[cm]?[jt]sx?)$/.test(filename)) {
      const code = readFileSync(absolute, "utf8");
      const imports = code.matchAll(
        /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](\.[^"']+)["']/g,
      );
      for (const match of imports) check(filename, match[1]);
    }
  }
  return violations;
}

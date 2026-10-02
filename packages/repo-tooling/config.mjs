// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import {
  readJson,
  upstreamRoot,
  upstreamManifest,
  toolRequire,
} from "./runtime.mjs";

export function workspaceDirectories(root) {
  const patterns = readJson(resolve(root, "package.json")).workspaces ?? [];
  if (!Array.isArray(patterns)) throw new Error("workspaces must be an array");
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith("/*")) {
      if (pattern.includes("*"))
        throw new Error(`Unsupported workspace pattern: ${pattern}`);
      return existsSync(resolve(root, pattern, "package.json"))
        ? [pattern]
        : [];
    }
    const parent = pattern.slice(0, -2);
    return readdirSync(resolve(root, parent), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(resolve(root, parent, entry.name, "package.json")),
      )
      .map((entry) => `${parent}/${entry.name}`);
  });
}

export function createCommitlintConfig(root) {
  const packageScopes = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "packages",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((filename) => filename && existsSync(resolve(root, filename)))
    .map((filename) => filename.split("/")[1])
    .filter((name) => name && !name.startsWith("."))
    .map((name) => name.replaceAll(".", "-"));
  return {
    extends: [
      resolve(
        upstreamRoot,
        "node_modules/@commitlint/config-conventional/lib/index.js",
      ),
    ],
    rules: {
      "scope-enum": [
        2,
        "always",
        [...new Set(packageScopes), "repo", "root", "monorepo"],
      ],
      "scope-empty": [2, "never"],
      "scope-case": [2, "always", "kebab-case"],
      "type-enum": [
        2,
        "always",
        [
          "feat",
          "fix",
          "docs",
          "style",
          "refactor",
          "perf",
          "test",
          "chore",
          "ci",
          "revert",
        ],
      ],
      "subject-case": [0],
      "header-max-length": [2, "always", 100],
    },
  };
}

export function createLintStagedConfig(root) {
  const workspaces = workspaceDirectories(root);
  const quote = (value) => JSON.stringify(value);
  const config = { "*.{md,txt}": () => "npm run lint:text" };
  const checked = [];
  for (const directory of workspaces) {
    const manifest = readJson(resolve(root, directory, "package.json"));
    if (!manifest.scripts?.lint) continue;
    checked.push(directory);
    config[
      `${directory}/**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,scss,yml,yaml}`
    ] = () => {
      const commands = [`npm run lint --workspace ${quote(manifest.name)}`];
      commands.push(
        manifest.scripts["lint:prettier"]
          ? `npm run lint:prettier --workspace ${quote(manifest.name)}`
          : `repo-tooling run --cwd ${quote(directory)} prettier --check .`,
      );
      if (manifest.scripts.typecheck)
        commands.push(`npm run typecheck --workspace ${quote(manifest.name)}`);
      return commands;
    };
  }
  config["*.{js,mjs,cjs,ts,json,md,yml,yaml}"] = (filenames) => {
    const files = filenames.filter((file) => {
      if (lstatSync(file).isSymbolicLink()) return false;
      const local = relative(root, file).split(sep).join("/");
      return !checked.some((directory) => local.startsWith(`${directory}/`));
    });
    return files.length
      ? [`repo-tooling run prettier --write ${files.map(quote).join(" ")}`]
      : [];
  };
  return config;
}

export async function createKnipConfig(root) {
  const { default: source } = await import(
    resolve(upstreamRoot, "knip.config.ts")
  );
  return {
    ...source,
    ignoreIssues: {},
    workspaces: {
      ".": source.workspaces["."],
      ...Object.fromEntries(
        workspaceDirectories(root).map((directory) => {
          const cwd = resolve(root, directory);
          const manifest = readJson(resolve(cwd, "package.json"));
          const linked = manifest.repoTooling?.linkedDependencies ?? [];
          const dynamicConfigs = [];
          const packageName = (specifier) =>
            specifier.startsWith("@")
              ? specifier.split("/").slice(0, 2).join("/")
              : specifier.split("/")[0];
          if (
            typeof manifest.prettier === "string" &&
            !manifest.prettier.startsWith(".")
          )
            dynamicConfigs.push(packageName(manifest.prettier));
          const tsconfigPath = resolve(cwd, "tsconfig.json");
          if (existsSync(tsconfigPath)) {
            const { parseConfigFileTextToJson } =
              toolRequire(root)("typescript");
            const { config, error } = parseConfigFileTextToJson(
              tsconfigPath,
              readFileSync(tsconfigPath, "utf8"),
            );
            if (error)
              throw new Error(
                `Invalid TypeScript configuration: ${tsconfigPath}`,
              );
            for (const specifier of [].concat(config.extends ?? []))
              if (!specifier.startsWith("."))
                dynamicConfigs.push(packageName(specifier));
          }
          return [
            directory,
            {
              prettier: Boolean(manifest.prettier),
              vitest: linked.includes("vitest"),
              entry: [
                "*.config.{js,mjs,cjs,ts}",
                "**/*.test.{ts,tsx}",
                "scripts/**/*.{ts,mjs}",
                ...(existsSync(resolve(cwd, "vitest.setup.ts"))
                  ? ["vitest.setup.ts"]
                  : []),
              ],
              ignore: [".local/**"],
              ignoreDependencies: [...linked, ...dynamicConfigs],
            },
          ];
        }),
      ),
    },
  };
}

export function createCspellConfig(root) {
  const source = readJson(resolve(upstreamRoot, "cspell.json"));
  const local =
    readJson(resolve(root, "package.json")).repoTooling?.cspell ?? {};
  return {
    ...source,
    ...local,
    words: [...source.words, ...(local.words ?? [])],
    files: local.files ?? [
      "README.md",
      "AGENTS.md",
      ...workspaceDirectories(root).map(
        (directory) => `${directory}/**/*.{ts,tsx,mjs}`,
      ),
    ],
  };
}

export function createSyncpackConfig(root) {
  const source = readJson(resolve(upstreamRoot, ".syncpackrc.json"));
  const local =
    readJson(resolve(root, "package.json")).repoTooling?.syncpack ?? {};
  return {
    ...source,
    ...local,
    source: [
      "package.json",
      ...workspaceDirectories(root).map(
        (directory) => `${directory}/package.json`,
      ),
    ],
    versionGroups: [
      {
        label: "Linked checkout dependencies",
        specifierTypes: ["file"],
        isIgnored: true,
      },
      ...(local.versionGroups ?? []),
      ...source.versionGroups,
    ],
    semverGroups: [
      {
        label: "Linked checkout dependencies",
        specifierTypes: ["file"],
        isIgnored: true,
      },
      ...source.semverGroups,
    ],
  };
}

export function consumerMetadata() {
  const source = upstreamManifest();
  return Object.fromEntries(
    ["engines", "volta", "packageManager", "overrides"].map((key) => [
      key,
      source[key],
    ]),
  );
}

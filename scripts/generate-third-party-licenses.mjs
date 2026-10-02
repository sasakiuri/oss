#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectLicenses } from "generate-license-file";

const normalizeText = (value) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

// npm ls strips a leading v from package versions; Arborist's scanner retains it.
const normalizeDependencyId = (value) => {
  const separator = value.lastIndexOf("@");
  return (
    value.slice(0, separator + 1) +
    value.slice(separator + 1).replace(/^v(?=\d)/, "")
  );
};

/**
 * The `invalid:` problems in an `npm ls --json --long` tree whose every
 * complaint comes from an optional peer range, keyed as npm prints them.
 */
const invalidOnlyAsOptionalPeer = async (repositoryRoot, tree) => {
  const invalidNodes = [];
  const visit = (node, name) => {
    if (!node || node.extraneous === true) return;
    if (typeof node?.invalid === "string" && node.path) {
      invalidNodes.push({ name, node });
    }
    for (const [childName, child] of Object.entries(node?.dependencies ?? {})) {
      visit(child, childName);
    }
  };
  visit(tree, tree.name);

  const optionalOnly = new Set();
  const verdicts = new Map();
  for (const { name, node } of invalidNodes) {
    const problem = `invalid: ${name}@${node.version} ${node.path}`;
    const requirers = [
      ...node.invalid.matchAll(/"[^"]*" from (\S+?)(?:,|$)/g),
    ].map((match) => match[1]);
    let optional = requirers.length > 0;
    for (const location of requirers) {
      let manifest;
      try {
        manifest = await readJson(
          join(repositoryRoot, location, "package.json"),
        );
      } catch {
        optional = false;
        break;
      }
      const isOptionalPeer =
        manifest.peerDependenciesMeta?.[name]?.optional === true &&
        manifest.dependencies?.[name] === undefined &&
        manifest.optionalDependencies?.[name] === undefined;
      if (!isOptionalPeer) {
        optional = false;
        break;
      }
    }
    // The same package can be listed under several parents; one real
    // requirement anywhere keeps the problem fatal.
    verdicts.set(problem, (verdicts.get(problem) ?? true) && optional);
  }
  for (const [problem, optional] of verdicts) {
    if (optional) optionalOnly.add(problem);
  }
  return optionalOnly;
};

const loadProductionDependencyIds = async (repositoryRoot, appPackage) => {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npmCommand,
    [
      "ls",
      "--workspace",
      appPackage.name,
      "--omit=dev",
      "--all",
      "--json",
      "--long",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_loglevel: "error" },
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;
  if (!result.stdout.trim()) {
    throw new Error(
      `npm ls did not return a dependency tree.\n${result.stderr.trim()}`,
    );
  }

  let tree;
  try {
    tree = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Could not parse npm ls output: ${error.message}`);
  }

  const workspaceNode = tree.dependencies?.[appPackage.name];
  if (!workspaceNode) {
    throw new Error(
      `npm ls did not return the ${appPackage.name} workspace subtree.`,
    );
  }

  // npm includes unrelated root modules and their dependency problems even
  // when a workspace is selected. Validate the actual production subtree,
  // including missing nodes, rather than npm's aggregate root problem list.
  const workspaceProblems = new Set();
  const collectProblems = (node, name, parent) => {
    if (!node || node.extraneous === true) return;
    for (const problem of node.problems ?? []) {
      if (!problem.startsWith("extraneous:")) workspaceProblems.add(problem);
    }
    if (node.missing === true && !node.problems?.length) {
      workspaceProblems.add(`missing: ${name}, required by ${parent}`);
    }
    if (node.invalid && !node.problems?.length) {
      workspaceProblems.add(`invalid: ${name}@${node.version} ${node.path}`);
    }
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      collectProblems(child, childName, `${name}@${node.version}`);
    }
  };
  collectProblems(workspaceNode, appPackage.name, tree.name);

  // npm 11 does not install optional peers, yet still reports a package that
  // another dependency brought in as "invalid" when its version is outside an
  // optional peer range. That package is not the peer, so only an invalid
  // package that some dependant actually requires is fatal.
  const optionalPeerOnly = await invalidOnlyAsOptionalPeer(
    repositoryRoot,
    workspaceNode,
  );
  const fatalProblems = [...workspaceProblems].filter(
    (problem) => !optionalPeerOnly.has(problem),
  );
  if (fatalProblems.length > 0) {
    throw new Error(
      `npm reported an invalid production dependency tree:\n${fatalProblems.join("\n")}`,
    );
  }

  const dependencyIds = new Set();
  const dependencyPaths = new Map();
  const visit = (node, fallbackName) => {
    if (!node || node.extraneous === true) {
      return;
    }

    const name = node.name ?? fallbackName;
    if (name && node.version && name !== appPackage.name) {
      const id = normalizeDependencyId(`${name}@${node.version}`);
      dependencyIds.add(id);
      if (node.path) {
        const paths = dependencyPaths.get(id) ?? new Set();
        paths.add(node.path);
        dependencyPaths.set(id, paths);
      }
    }

    for (const [dependencyName, dependency] of Object.entries(
      node.dependencies ?? {},
    )) {
      visit(dependency, dependencyName);
    }
  };

  visit(workspaceNode, appPackage.name);

  if (dependencyIds.size === 0) {
    throw new Error(
      `No production dependencies were found for ${appPackage.name}.`,
    );
  }

  return { dependencyIds, dependencyPaths };
};

const loadLicenseRecords = async (
  repositoryRoot,
  dependencyIds,
  dependencyPaths,
  appPackageJsonPath,
) => {
  const productionIds = [...dependencyIds].map((id) => {
    const separator = id.lastIndexOf("@");
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `${escape(id.slice(0, separator))}@v?${escape(id.slice(separator + 1))}`;
  });
  const options = {
    // Skip unrelated workspaces and linked development tools before the
    // scanner reads their license texts or traverses their dependencies.
    exclude: [`/^(?!(?:${productionIds.join("|")})$).+/`],
    replace: {
      doctrine: join(repositoryRoot, "node_modules", "doctrine", "LICENSE"),
      rc: join(repositoryRoot, "node_modules", "rc", "LICENSE.MIT"),
      "type-fest": join(
        repositoryRoot,
        "node_modules",
        "type-fest",
        "license-mit",
      ),
    },
  };

  // Most workspace dependencies are hoisted to the repository root. A small
  // number can remain under the app workspace when their versions conflict,
  // so scan both actual trees and then retain only the app production closure.
  const discoveredLicenses = [
    ...(await getProjectLicenses(
      join(repositoryRoot, "package.json"),
      options,
    )),
    ...(await getProjectLicenses(appPackageJsonPath, options)),
  ];

  const records = new Map();
  for (const license of discoveredLicenses) {
    const content = normalizeText(license.content);
    const notices = license.notices.map(normalizeText).filter(Boolean);
    const recordKey = JSON.stringify([content, notices]);

    for (const scannedId of license.dependencies) {
      const dependencyId = normalizeDependencyId(scannedId);
      if (!dependencyIds.has(dependencyId)) {
        continue;
      }

      const existing = records.get(dependencyId);
      if (existing && existing.recordKey !== recordKey) {
        throw new Error(
          `Conflicting license texts were found for ${dependencyId}.`,
        );
      }

      records.set(dependencyId, { content, notices, recordKey });
    }
  }

  // npm's production closure can include build-tool peers marked dev by Arborist.
  // Preserve their notices from the actual installed package when the scanner skips them.
  const readFirst = async (directory, candidates) => {
    for (const candidate of candidates) {
      try {
        return normalizeText(
          await readFile(join(directory, candidate), "utf8"),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return "";
  };
  for (const id of dependencyIds) {
    if (records.has(id)) continue;
    for (const directory of dependencyPaths.get(id) ?? []) {
      const content = await readFirst(directory, [
        "LICENSE",
        "LICENSE.md",
        "LICENSE.txt",
        "LICENCE",
        "LICENCE.md",
        "COPYING",
        "COPYING.md",
        "COPYING.txt",
        "license",
        "license.md",
        "license.txt",
      ]);
      if (!content) continue;
      const notice = await readFirst(directory, [
        "NOTICE",
        "NOTICE.md",
        "NOTICE.txt",
        "notice",
      ]);
      const notices = notice ? [notice] : [];
      const recordKey = JSON.stringify([content, notices]);
      if (records.has(id) && records.get(id).recordKey !== recordKey)
        throw new Error(`Conflicting license texts were found for ${id}.`);
      records.set(id, { content, notices, recordKey });
    }
  }
  const missing = [...dependencyIds]
    .filter((dependencyId) => !records.has(dependencyId))
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `Could not resolve license text for:\n${missing.join("\n")}`,
    );
  }

  return records;
};

const formatReport = (records, appPackageName) => {
  const groups = new Map();
  for (const [dependencyId, record] of records) {
    const group = groups.get(record.recordKey) ?? {
      content: record.content,
      notices: record.notices,
      dependencies: [],
    };
    group.dependencies.push(dependencyId);
    groups.set(record.recordKey, group);
  }

  const sortedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      dependencies: group.dependencies.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.dependencies[0].localeCompare(b.dependencies[0]));

  const lines = [
    "THIRD-PARTY SOFTWARE NOTICES",
    "",
    "This file is generated from the installed production dependency closure of",
    `${appPackageName}. Do not edit it manually.`,
    "",
    `Package/version entries: ${records.size}`,
    "",
  ];

  for (const group of sortedGroups) {
    lines.push(
      group.dependencies.length === 1
        ? "The following npm package may be included in this product:"
        : "The following npm packages may be included in this product:",
      "",
      ...group.dependencies.map((dependencyId) => ` - ${dependencyId}`),
      "",
      group.dependencies.length === 1
        ? "This package contains the following license:"
        : "These packages each contain the following license:",
      "",
      group.content,
    );

    if (group.notices.length > 0) {
      lines.push(
        "",
        "With the following notices:",
        "",
        group.notices.join("\n\n"),
      );
    }

    lines.push("", "-----------", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
};

const generateForApplication = async (
  repositoryRoot,
  appDirectory,
  checkOnly,
) => {
  const appPackageJsonPath = join(appDirectory, "package.json");
  const reportPath = join(appDirectory, "THIRD-PARTY-LICENSES.txt");
  const appPackage = await readJson(appPackageJsonPath);
  const { dependencyIds, dependencyPaths } = await loadProductionDependencyIds(
    repositoryRoot,
    appPackage,
  );
  const records = await loadLicenseRecords(
    repositoryRoot,
    dependencyIds,
    dependencyPaths,
    appPackageJsonPath,
  );
  const report = formatReport(records, appPackage.name);

  if (checkOnly) {
    let currentReport;
    try {
      currentReport = await readFile(reportPath, "utf8");
    } catch {
      throw new Error(`Missing generated report: ${reportPath}`);
    }

    if (currentReport !== report) {
      throw new Error(
        "THIRD-PARTY-LICENSES.txt is stale. Run `npm run license-report` and commit the result.",
      );
    }

    console.log(
      `Verified ${records.size} production package/version license entries for ${appPackage.name}.`,
    );
    return;
  }

  await writeFile(reportPath, report, "utf8");
  console.log(
    `Wrote ${records.size} production package/version license entries to ${reportPath}.`,
  );
};

export async function generateLicenseReport({
  repositoryRoot,
  appDirectories,
  checkOnly = false,
  selectedWorkspace,
}) {
  if (typeof repositoryRoot !== "string" || !repositoryRoot) {
    throw new TypeError(
      "generateLicenseReport requires an explicit repository root.",
    );
  }
  if (
    !Array.isArray(appDirectories) ||
    appDirectories.some(
      (directory) => typeof directory !== "string" || !directory,
    )
  ) {
    throw new TypeError(
      "generateLicenseReport requires application directories.",
    );
  }
  repositoryRoot = resolve(repositoryRoot);
  try {
    const applications = await Promise.all(
      appDirectories.map(async (directory) => {
        const appDirectory = resolve(repositoryRoot, directory);
        return {
          appDirectory,
          appPackage: await readJson(join(appDirectory, "package.json")),
        };
      }),
    );
    const selectedApplications = selectedWorkspace
      ? applications.filter(
          ({ appPackage }) => appPackage.name === selectedWorkspace,
        )
      : applications;

    if (selectedApplications.length === 0) {
      throw new Error(`Unknown application workspace: ${selectedWorkspace}`);
    }

    for (const { appDirectory } of selectedApplications) {
      await generateForApplication(repositoryRoot, appDirectory, checkOnly);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.exitCode = await generateLicenseReport({
    repositoryRoot,
    appDirectories: [
      join(repositoryRoot, "packages", "saika-lane"),
      join(repositoryRoot, "packages", "saika-director"),
      join(repositoryRoot, "packages", "saika-vista"),
      join(repositoryRoot, "packages", "saika-docs"),
      join(repositoryRoot, "packages", "nilay-knowledge"),
      join(repositoryRoot, "packages", "nilay-about"),
    ],
    checkOnly: process.argv.includes("--check"),
    selectedWorkspace: process.argv
      .find((argument) => argument.startsWith("--workspace="))
      ?.slice("--workspace=".length),
  });
}

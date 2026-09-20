#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectLicenses } from "generate-license-file";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectories = [
  join(repositoryRoot, "packages", "saika-lane"),
  join(repositoryRoot, "packages", "saika-director"),
  join(repositoryRoot, "packages", "saika-vista"),
  join(repositoryRoot, "packages", "saika-docs"),
  join(repositoryRoot, "packages", "nilay-knowledge"),
];
const checkOnly = process.argv.includes("--check");
const selectedWorkspace = process.argv
  .find((argument) => argument.startsWith("--workspace="))
  ?.slice("--workspace=".length);

const normalizeText = (value) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const loadProductionDependencyIds = async (appPackage) => {
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

  // npm reports unrelated, stale root modules as "extraneous" even when a
  // workspace is selected. They are outside the app subtree and cannot be
  // packaged by electron-builder, so only other tree problems are fatal.
  const fatalProblems = (tree.problems ?? []).filter(
    (problem) => !problem.startsWith("extraneous:"),
  );
  if (fatalProblems.length > 0) {
    throw new Error(
      `npm reported an invalid production dependency tree:\n${fatalProblems.join("\n")}`,
    );
  }

  const workspaceNode = tree.dependencies?.[appPackage.name];
  if (!workspaceNode) {
    throw new Error(
      `npm ls did not return the ${appPackage.name} workspace subtree.`,
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
      const id = `${name}@${node.version}`;
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
  dependencyIds,
  dependencyPaths,
  appPackageJsonPath,
) => {
  const options = {
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

    for (const dependencyId of license.dependencies) {
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

const generateForApplication = async (appDirectory) => {
  const appPackageJsonPath = join(appDirectory, "package.json");
  const reportPath = join(appDirectory, "THIRD-PARTY-LICENSES.txt");
  const appPackage = await readJson(appPackageJsonPath);
  const { dependencyIds, dependencyPaths } =
    await loadProductionDependencyIds(appPackage);
  const records = await loadLicenseRecords(
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

const main = async () => {
  const applications = await Promise.all(
    appDirectories.map(async (appDirectory) => ({
      appDirectory,
      appPackage: await readJson(join(appDirectory, "package.json")),
    })),
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
    await generateForApplication(appDirectory);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

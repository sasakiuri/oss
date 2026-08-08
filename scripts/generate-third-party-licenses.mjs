#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectLicenses } from "generate-license-file";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = join(repositoryRoot, "packages", "saika-lane");
const appPackageJsonPath = join(appDirectory, "package.json");
const reportPath = join(appDirectory, "THIRD-PARTY-LICENSES.txt");
const checkOnly = process.argv.includes("--check");

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
  const visit = (node, fallbackName) => {
    if (!node || node.extraneous === true) {
      return;
    }

    const name = node.name ?? fallbackName;
    if (name && node.version && name !== appPackage.name) {
      dependencyIds.add(`${name}@${node.version}`);
    }

    for (const [dependencyName, dependency] of Object.entries(
      node.dependencies ?? {},
    )) {
      visit(dependency, dependencyName);
    }
  };

  visit(workspaceNode, appPackage.name);

  if (dependencyIds.size === 0) {
    throw new Error("No production dependencies were found for Saika Lane.");
  }

  return dependencyIds;
};

const loadLicenseRecords = async (dependencyIds) => {
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

const formatReport = (records) => {
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
    "@sasakiuri/saika-lane. Do not edit it manually.",
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

const main = async () => {
  const appPackage = await readJson(appPackageJsonPath);
  const dependencyIds = await loadProductionDependencyIds(appPackage);
  const records = await loadLicenseRecords(dependencyIds);
  const report = formatReport(records);

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
      `Verified ${records.size} production package/version license entries.`,
    );
    return;
  }

  await writeFile(reportPath, report, "utf8");
  console.log(
    `Wrote ${records.size} production package/version license entries to ${reportPath}.`,
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

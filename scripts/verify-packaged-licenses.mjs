#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { listPackage, extractFile } from "@electron/asar";
import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = join(repositoryRoot, "packages", "saika-lane");
const expectedLicensePath = join(appDirectory, "LICENSE");
const expectedReportPath = join(appDirectory, "THIRD-PARTY-LICENSES.txt");
const defaultSearchRoot = join(appDirectory, "release");

const exists = async (path) => {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const findAppArchives = async (root) => {
  const archives = [];
  const visit = async (path) => {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === "app.asar") {
        archives.push(entryPath);
      }
    }
  };

  await visit(root);
  return archives.sort((a, b) => a.localeCompare(b));
};

const parseReportInventory = (report) => {
  const inventory = new Set();
  for (const line of report.split(/\r?\n/)) {
    const match = /^ - (.+)@([^@]+)$/.exec(line);
    if (match) {
      inventory.add(`${match[1]}@${match[2]}`);
    }
  }
  return inventory;
};

const packageJsonEntryPattern =
  /(?:^|\/)node_modules\/(?:@[^/]+\/[^/]+|[^/]+)\/package\.json$/;

const readPackagedDependencyIds = (archivePath, appPackageName) => {
  const dependencyIds = new Set();
  const entries = listPackage(archivePath, { isPack: false });

  for (const entry of entries) {
    const normalizedEntry = entry.replaceAll("\\", "/").replace(/^\//, "");
    if (!packageJsonEntryPattern.test(normalizedEntry)) {
      continue;
    }

    let packageJson;
    try {
      packageJson = JSON.parse(
        extractFile(archivePath, normalizedEntry).toString("utf8"),
      );
    } catch (error) {
      throw new Error(
        `Could not read ${normalizedEntry} from ${archivePath}: ${error.message}`,
      );
    }

    if (
      packageJson.name &&
      packageJson.version &&
      packageJson.name !== appPackageName
    ) {
      dependencyIds.add(`${packageJson.name}@${packageJson.version}`);
    }
  }

  return dependencyIds;
};

const assertCopiedFile = async (
  resourcesDirectory,
  filename,
  expectedContent,
) => {
  const packagedPath = join(resourcesDirectory, filename);
  if (!(await exists(packagedPath))) {
    throw new Error(`Packaged legal file is missing: ${packagedPath}`);
  }

  const packagedContent = await readFile(packagedPath);
  if (!packagedContent.equals(expectedContent)) {
    throw new Error(
      `Packaged legal file differs from the repository copy: ${packagedPath}`,
    );
  }
};

const main = async () => {
  const searchRoots = process.argv.slice(2).map((path) => resolve(path));
  if (searchRoots.length === 0) {
    searchRoots.push(defaultSearchRoot);
  }

  for (const root of searchRoots) {
    if (!(await exists(root))) {
      throw new Error(`Packaged application directory does not exist: ${root}`);
    }
  }

  const archives = (
    await Promise.all(
      searchRoots.map((root) =>
        basename(root) === "app.asar" ? [root] : findAppArchives(root),
      ),
    )
  ).flat();
  if (archives.length === 0) {
    throw new Error(`No app.asar was found below: ${searchRoots.join(", ")}`);
  }

  const [appPackage, expectedLicense, expectedReport] = await Promise.all([
    readFile(join(appDirectory, "package.json"), "utf8").then(JSON.parse),
    readFile(expectedLicensePath),
    readFile(expectedReportPath),
  ]);
  const reportInventory = parseReportInventory(expectedReport.toString("utf8"));

  for (const archivePath of archives) {
    const resourcesDirectory = dirname(archivePath);
    await assertCopiedFile(resourcesDirectory, "LICENSE", expectedLicense);
    await assertCopiedFile(
      resourcesDirectory,
      "THIRD-PARTY-LICENSES.txt",
      expectedReport,
    );

    const packagedDependencyIds = readPackagedDependencyIds(
      archivePath,
      appPackage.name,
    );
    const missing = [...packagedDependencyIds]
      .filter((dependencyId) => !reportInventory.has(dependencyId))
      .sort((a, b) => a.localeCompare(b));

    if (missing.length > 0) {
      throw new Error(
        `The license report is missing ${missing.length} packaged dependency entries from ${archivePath}:\n${missing.join("\n")}`,
      );
    }

    console.log(
      `Verified LICENSE, THIRD-PARTY-LICENSES.txt, and ${packagedDependencyIds.size} packaged dependencies in ${archivePath}.`,
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

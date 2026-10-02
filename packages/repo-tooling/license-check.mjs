// SPDX-License-Identifier: MIT
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import licensee from "licensee";
import { workspaceDirectories } from "./config.mjs";
import { isInside, readJson } from "./runtime.mjs";

export async function checkLicenses(root) {
  try {
    if (typeof root !== "string" || !root) {
      throw new TypeError(
        "checkLicenses requires an explicit repository root.",
      );
    }
    root = realpathSync(resolve(root));
    const configuration = readJson(resolve(root, ".licensee.json"));
    const privateDirectories = new Set(
      [
        root,
        ...workspaceDirectories(root).map((directory) =>
          resolve(root, directory),
        ),
      ]
        .filter(
          (directory) =>
            readJson(resolve(directory, "package.json")).private === true,
        )
        .map((directory) => realpathSync(directory)),
    );

    configuration.filterPackages = (dependencies) => {
      const sourceAncestors = new Set();
      for (const dependency of dependencies) {
        if (!dependency.isLink) continue;
        for (
          let ancestor = dependency.target?.parent;
          ancestor;
          ancestor = ancestor.parent
        ) {
          sourceAncestors.add(ancestor);
        }
      }
      return dependencies.filter((dependency) => {
        const directory = dependency.realpath ?? dependency.path;
        if (typeof directory !== "string" || !directory) {
          throw new Error("Installed package is missing its path.");
        }
        // Arborist inserts empty ancestor nodes for external link targets.
        // They represent source directories, not installed dependencies.
        if (
          sourceAncestors.has(dependency) &&
          !isInside(root, directory) &&
          !dependency.isLink &&
          dependency.package &&
          Object.keys(dependency.package).length === 0 &&
          dependency.edgesIn?.size === 0 &&
          dependency.edgesOut?.size === 0
        ) {
          return false;
        }
        if (privateDirectories.has(resolve(directory))) return false;
        if (
          typeof dependency.package?.name !== "string" ||
          !dependency.package.name
        ) {
          throw new Error(
            `Installed package is missing its name: ${directory}`,
          );
        }
        if (typeof dependency.version !== "string" || !dependency.version) {
          throw new Error(
            `Installed package is missing its version: ${directory}`,
          );
        }
        return true;
      });
    };

    const results = await new Promise((accept, reject) => {
      licensee(configuration, root, (error, dependencies) => {
        if (error) reject(error);
        else accept(dependencies);
      });
    });
    const rejected = results
      .flatMap((dependency) => [dependency, ...(dependency.duplicates ?? [])])
      .filter((dependency) => !dependency.approved);
    for (const dependency of rejected) {
      const terms =
        typeof dependency.license === "string"
          ? dependency.license
          : "missing or invalid license metadata";
      console.error(
        `${dependency.name}@${dependency.version}: NOT APPROVED (${terms})\n  ${dependency.path}`,
      );
    }
    return rejected.length ? 1 : 0;
  } catch (error) {
    console.error(
      `License check failed: ${error instanceof Error ? error.message : error}`,
    );
    return 1;
  }
}

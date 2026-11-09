// SPDX-License-Identifier: MIT
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

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
    // npm joins complaints as `"<range>" from <location>` and names the
    // root package "the root project". A complaint that cannot be read
    // keeps the problem fatal.
    const requirers = node.invalid
      .split(/, (?=")/)
      .map((complaint) => complaint.match(/^"[^"]*" from (.+)$/)?.[1]);
    let optional = requirers.length > 0 && requirers.every(Boolean);
    for (const location of optional ? requirers : []) {
      const directory = location === "the root project" ? "." : location;
      // Only the root and workspaces install their devDependencies.
      const installsDevDependencies = !directory
        .split(/[\\/]/)
        .includes("node_modules");
      let manifest;
      try {
        manifest = await readJson(
          join(repositoryRoot, directory, "package.json"),
        );
      } catch {
        optional = false;
        break;
      }
      const isOptionalPeer =
        manifest.peerDependenciesMeta?.[name]?.optional === true &&
        manifest.dependencies?.[name] === undefined &&
        manifest.optionalDependencies?.[name] === undefined &&
        (!installsDevDependencies ||
          manifest.devDependencies?.[name] === undefined);
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

export async function dependencyTreeProblems(
  repositoryRoot,
  tree,
  { name = tree.name, parent = tree.name } = {},
) {
  const problems = new Set();
  const collectProblems = (node, name, parent) => {
    if (!node || node.extraneous === true) return;
    for (const problem of node.problems ?? []) {
      if (!problem.startsWith("extraneous:")) problems.add(problem);
    }
    if (node.missing === true && !node.problems?.length) {
      problems.add(`missing: ${name}, required by ${parent}`);
    }
    if (node.invalid && !node.problems?.length) {
      problems.add(`invalid: ${name}@${node.version} ${node.path}`);
    }
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      collectProblems(child, childName, `${name}@${node.version}`);
    }
  };
  collectProblems(tree, name, parent);

  // npm 11 does not install optional peers, yet still reports a package that
  // another dependency brought in as "invalid" when its version is outside an
  // optional peer range. That package is not the peer, so only an invalid
  // package that some dependant actually requires is fatal.
  const optionalPeerOnly = await invalidOnlyAsOptionalPeer(
    repositoryRoot,
    tree,
  );
  const fatalProblems = [...problems].filter(
    (problem) => !optionalPeerOnly.has(problem),
  );
  return fatalProblems;
}

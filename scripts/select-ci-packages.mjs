// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const docsName = "@sasakiuri/saika-docs";
const knowledgeName = "@sasakiuri/nilay-knowledge";
export const platformRunners = [
  "ubuntu-latest",
  "windows-latest",
  "macos-latest",
];
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
export const usesElectron = (pkg) =>
  dependencyFields.some((field) => Boolean(pkg[field]?.electron));
// These tools are verified in the text job and do not affect package builds.
const textToolingInputs = new Set([
  "scripts/lint-text.mjs",
  "scripts/lint-text.test.mjs",
  "scripts/pre-release-check.sh",
  "scripts/pre-release-check.test.mjs",
  "scripts/dependabot-policy.test.mjs",
  ".github/dependabot.yml",
  ".github/workflows/dependabot-auto-merge.yml",
  ".textlintignore",
]);

const stableJson = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );

// Resolve installed locations, not package names: different consumers can use
// different versions of the same dependency, including nested npm aliases.
function dependencyLocation(packages, from, name) {
  let directory = from;
  while (true) {
    const candidate = posix.join(directory, "node_modules", name);
    if (packages[candidate]) return candidate;
    if (!directory) return undefined;
    directory = posix.dirname(directory);
    if (directory === ".") directory = "";
  }
}

export function affectedByLockfile(previous, current, workspaces) {
  const fallback = (reason) => ({ all: true, packages: [], reason });
  if (
    ![previous, current].every(
      (lock) => lock?.lockfileVersion === 3 && lock.packages?.[""],
    )
  )
    return fallback(
      "Lockfile narrowing requires npm lockfile v3 with a root package.",
    );
  const metadata = ({ packages: _packages, ...rest }) => rest;
  if (stableJson(metadata(previous)) !== stableJson(metadata(current)))
    return fallback("Shared lockfile metadata changed.");
  if (stableJson(previous.packages[""]) !== stableJson(current.packages[""]))
    return fallback(
      "Root dependency or toolchain declarations changed in the lockfile.",
    );

  const locations = new Set([
    ...Object.keys(previous.packages),
    ...Object.keys(current.packages),
  ]);
  if (
    [...locations].some(
      (location) =>
        location &&
        (posix.isAbsolute(location) ||
          location
            .split("/")
            .some((part) => !part || part === "." || part === "..")),
    )
  )
    return fallback(
      "Unsupported installed dependency location in the lockfile.",
    );
  const changed = [...locations].filter(
    (location) =>
      stableJson(previous.packages[location]) !==
      stableJson(current.packages[location]),
  );
  const reverse = new Map();
  const edge = (from, to) => {
    if (!reverse.has(to)) reverse.set(to, new Set());
    reverse.get(to).add(from);
  };
  for (const lock of [previous, current]) {
    for (const [location, pkg] of Object.entries(lock.packages)) {
      if (pkg.link) {
        if (!lock.packages[pkg.resolved])
          return fallback(`Unresolved workspace link: ${location}.`);
        edge(location, pkg.resolved);
        continue;
      }
      for (const field of dependencyFields) {
        for (const name of Object.keys(pkg[field] ?? {})) {
          const resolved = dependencyLocation(lock.packages, location, name);
          if (resolved) edge(location, resolved);
          else if (
            field !== "optionalDependencies" &&
            !pkg.optionalDependencies?.[name] &&
            !(
              field === "peerDependencies" &&
              pkg.peerDependenciesMeta?.[name]?.optional
            )
          )
            return fallback(
              `Unresolved dependency ${name} from ${location || "root"}.`,
            );
        }
      }
    }
  }
  const owners = new Map(workspaces.map((pkg) => [pkg.directory, pkg.name]));
  const selected = new Set();
  for (const location of changed) {
    const pending = [location];
    const visited = new Set();
    let owned = false;
    while (pending.length) {
      const dependency = pending.pop();
      if (visited.has(dependency)) continue;
      visited.add(dependency);
      if (dependency === "")
        return fallback(
          `Changed resolved dependency reaches shared root tooling: ${location}.`,
        );
      if (owners.has(dependency)) {
        selected.add(owners.get(dependency));
        owned = true;
      }
      pending.push(...(reverse.get(dependency) ?? []));
    }
    if (!owned)
      return fallback(
        `No confident workspace owner for changed lockfile entry: ${location}.`,
      );
  }
  return {
    all: false,
    packages: [...selected].sort(),
    reason: `Lockfile: ${changed.length} changed resolved entries affect ${selected.size} workspace(s).`,
  };
}

export function e2eMatrix(packages, runners) {
  return packages.flatMap((pkg) =>
    !pkg.scripts?.["test:e2e"]
      ? []
      : runners.flatMap((os) => {
          const shards = pkg.name === knowledgeName ? 2 : 1;
          return Array.from({ length: shards }, (_, index) => ({
            package: pkg.name,
            directory: pkg.directory,
            os,
            shard: index + 1,
            shards,
            electron: usesElectron(pkg),
            installBrowsers: Boolean(pkg.scripts?.["test:install"]),
          }));
        }),
  );
}

export function selectCiPackages(files, current, previous = current, lockfile) {
  const graph = [...previous, ...current];
  const selected = new Set();
  let all = false;
  const reasons = [];
  const text = files.some(
    (file) =>
      /\.(md|txt)$/.test(file) ||
      /(^|\/)package(?:-lock)?\.json$/.test(file) ||
      /(^|\/)\.textlintrc(?:\.[^/]+)?$/.test(file) ||
      file === "scripts/check-english-only.mjs" ||
      textToolingInputs.has(file),
  );
  const infrastructure = files.some(
    (file) =>
      file.startsWith(".github/") ||
      file.startsWith(".husky/") ||
      file.endsWith(".sh") ||
      /(^|\/)(Dockerfile(?:\.[^/]+)?|\.shellcheckrc|\.?hadolint\.ya?ml|\.?zizmor\.ya?ml)$/.test(
        file,
      ) ||
      ["scripts/lint-infra.mjs", ".gitignore", ".gitattributes"].includes(file),
  );
  for (const file of files) {
    // Package Markdown and assets are build inputs, including website content.
    const owners = graph.filter((pkg) => file.startsWith(`${pkg.directory}/`));
    if (file === "package-lock.json") {
      const impact = lockfile ?? {
        all: true,
        packages: [],
        reason: "Lockfile revisions unavailable; checking every workspace.",
      };
      all ||= impact.all;
      for (const name of impact.packages) selected.add(name);
      reasons.push(impact.reason);
    } else if (owners.length) {
      for (const pkg of owners) selected.add(pkg.name);
    } else if (file.startsWith("packages/")) {
      all = true;
      reasons.push(`Unknown workspace input: ${file}.`);
    } else if (
      file.startsWith(".github/workflows/docs") ||
      /^(docker\/|\.devcontainer\/|compose[^/]*\.ya?ml$)/.test(file) ||
      ["Makefile", ".dockerignore"].includes(file)
    ) {
      selected.add(docsName);
    } else if (
      textToolingInputs.has(file) ||
      file === "scripts/lint-infra.mjs"
    ) {
      // Their dedicated checks cover these repository tools.
    } else if (
      file === ".github/workflows/ci.yml" ||
      file.startsWith(".github/actions/") ||
      file.startsWith("scripts/")
    ) {
      all = true;
      reasons.push(`Shared CI/tooling input: ${file}.`);
    } else if (
      /\.(md|txt)$/.test(file) ||
      /^(docs\/|\.github\/|\.changeset\/|\.vscode\/|\.husky\/)/.test(file) ||
      [
        "LICENSE",
        ".git-blame-ignore-revs",
        "codecov.yml",
        "osv-scanner.toml",
      ].includes(file)
    ) {
      // Repository documentation and metadata retain the shared/security checks.
    } else {
      // Root lock files, configuration, and unknown shared inputs affect everyone.
      all = true;
      reasons.push(`Shared root input: ${file}.`);
    }
  }

  if (all) for (const pkg of graph) selected.add(pkg.name);
  let changed;
  do {
    changed = false;
    for (const pkg of graph) {
      if (
        !selected.has(pkg.name) &&
        dependencyFields.some((field) =>
          Object.keys(pkg[field] ?? {}).some((name) => selected.has(name)),
        )
      ) {
        selected.add(pkg.name);
        changed = true;
      }
    }
  } while (changed);

  const packages = current
    .filter((pkg) => selected.has(pkg.name) && pkg.name !== docsName)
    .sort((a, b) => a.name.localeCompare(b.name));
  const build = packages.some((pkg) =>
    ["build", "test", "test:coverage", "test:e2e", "size-limit"].some(
      (task) => pkg.scripts?.[task],
    ),
  );
  const electron = packages.some(usesElectron);
  const knowledge = packages.some((pkg) => pkg.name === knowledgeName);
  const os = electron || knowledge ? platformRunners : ["ubuntu-latest"];
  const e2e = e2eMatrix(packages, os);
  return {
    text: all || text,
    infrastructure,
    ci: packages.length > 0,
    build,
    docs: current.some(
      (pkg) => pkg.name === docsName && selected.has(pkg.name),
    ),
    electron,
    knowledge,
    e2e: e2e.length > 0,
    e2eMatrix: e2e,
    packages: packages.map((pkg) => pkg.name),
    os,
    reasons,
  };
}

export function readGitWorkspaces(ref, cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const root = JSON.parse(git("show", `${ref}:package.json`));
  if (JSON.stringify(root.workspaces) !== JSON.stringify(["packages/*"])) {
    throw new Error(
      "CI package selection must be updated for these workspace patterns.",
    );
  }
  const files = git(
    "ls-tree",
    "-r",
    "--name-only",
    ref,
    "--",
    "packages",
  ).split("\n");
  const packages = files
    .filter((file) => /^packages\/[^/]+\/package\.json$/.test(file))
    .map((file) => ({
      ...JSON.parse(git("show", `${ref}:${file}`)),
      directory: file.slice(0, -"/package.json".length),
    }));
  if (
    !packages.length ||
    new Set(packages.map((pkg) => pkg.name)).size !== packages.length
  ) {
    throw new Error("Expected unique named workspaces.");
  }
  for (const pkg of packages) {
    if (
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(
        pkg.name ?? "",
      ) ||
      !/^packages\/[a-z0-9][a-z0-9._-]*$/i.test(pkg.directory)
    ) {
      throw new Error(`Unsupported workspace: ${pkg.directory}`);
    }
  }
  return packages;
}

export function planForRevision(base, head, cwd = process.cwd()) {
  if (![base, head].every((ref) => /^[a-f0-9]{40}$/.test(ref ?? ""))) {
    throw new Error("Expected explicit base and head commit SHAs.");
  }
  const current = readGitWorkspaces(head, cwd);
  if (/^0+$/.test(base)) {
    return {
      ...selectCiPackages(["package.json"], current, []),
      infrastructure: true,
    };
  }
  const previous = readGitWorkspaces(base, cwd);
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head, "--"],
    { cwd, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  let lockfile;
  if (files.includes("package-lock.json")) {
    try {
      const readLock = (ref) =>
        JSON.parse(
          execFileSync("git", ["show", `${ref}:package-lock.json`], {
            cwd,
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          }),
        );
      lockfile = affectedByLockfile(readLock(base), readLock(head), [
        ...previous,
        ...current,
      ]);
    } catch {
      lockfile = {
        all: true,
        packages: [],
        reason:
          "Lockfile revision missing or invalid; checking every workspace.",
      };
    }
  }
  return selectCiPackages(files, current, previous, lockfile);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const base = event.pull_request?.base?.sha ?? event.before;
  const plan = planForRevision(base, process.env.GITHUB_SHA);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  for (const [key, value] of Object.entries(plan)) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${key}=${JSON.stringify(value)}\n`,
    );
  }
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## CI scope\n\nPackages: ${plan.packages.join(", ") || "none"}\n\nText and tooling: ${plan.text}\n\nInfrastructure: ${plan.infrastructure}\n\nDocs: ${plan.docs}\n\nBuild runners: ${plan.build ? plan.os.join(", ") : "none"}\n\nE2E jobs: ${plan.e2eMatrix.length}\n\nSelection reasons:\n${plan.reasons.map((reason) => `- ${reason}`).join("\n") || "- Changed workspace files and their transitive consumers."}\n`,
    );
  }
}

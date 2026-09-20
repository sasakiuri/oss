// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const docsName = "@sasakiuri/saika-docs";
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
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

export function selectCiPackages(files, current, previous = current) {
  const graph = [...previous, ...current];
  const selected = new Set();
  let all = false;
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
    if (owners.length) {
      for (const pkg of owners) selected.add(pkg.name);
    } else if (file.startsWith("packages/")) {
      all = true;
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
      // Root lockfiles, configuration, and unknown shared inputs affect everyone.
      all = true;
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
  const electron = packages.some((pkg) =>
    dependencyFields.some((field) => pkg[field]?.electron),
  );
  return {
    text: all || text,
    infrastructure,
    ci: packages.length > 0,
    build,
    docs: current.some(
      (pkg) => pkg.name === docsName && selected.has(pkg.name),
    ),
    electron,
    packages: packages.map((pkg) => pkg.name),
    os: electron
      ? ["ubuntu-latest", "windows-latest", "macos-latest"]
      : ["ubuntu-latest"],
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
  return selectCiPackages(files, current, previous);
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
      `## CI scope\n\nPackages: ${plan.packages.join(", ") || "none"}\n\nText and tooling: ${plan.text}\n\nInfrastructure: ${plan.infrastructure}\n\nDocs: ${plan.docs}\n\nBuild runners: ${plan.build ? plan.os.join(", ") : "none"}\n`,
    );
  }
}

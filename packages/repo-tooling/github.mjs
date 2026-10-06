// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readJson, upstreamRoot } from "./runtime.mjs";
import { packageScopes } from "./config.mjs";

const templateDirectory = ".github/ISSUE_TEMPLATE";
const pullRequestTemplate = ".github/PULL_REQUEST_TEMPLATE.md";
const packageLabelPrefix = "Package: ";
const managedLabelPrefixes = ["Cat: ", packageLabelPrefix, "Status: "];
const sharedPackageOptions = [
  "Repository / CI / development environment",
  "Multiple packages / unsure",
];
const packageOptions =
  /(\n {4}id: package\n(?: {4}attributes:\n| {6}.*\n)*? {6}options:\n)(?: {8}- .*\n)+/g;
const contactLinks = /^contact_links:\n(?: {2}.*\n)*/m;
const changesetItem = /^- \[ \] A changeset .*\n/m;

function renderIssueForm(root, filename, contents) {
  const options = [...packageScopes(root), ...sharedPackageOptions]
    .map((option) => `        - ${option}\n`)
    .join("");
  const matches = contents.match(packageOptions)?.length ?? 0;
  if (matches !== 1)
    throw new Error(
      `${filename} must contain exactly one package dropdown, found ${matches}`,
    );
  return contents.replace(packageOptions, (_, head) => head + options);
}

// Templates are shared verbatim except for repository-specific facts: package
// choices follow commit scopes, contact links point to the public checkout,
// and the changeset reminder applies only where changesets are configured.
export function createGitHubTemplates(root) {
  const templates = new Map();
  for (const name of readdirSync(resolve(upstreamRoot, templateDirectory))) {
    const filename = `${templateDirectory}/${name}`;
    let contents = readFileSync(resolve(upstreamRoot, filename), "utf8");
    if (contents.includes("\n    id: package\n"))
      contents = renderIssueForm(root, filename, contents);
    if (name === "config.yml" && root !== upstreamRoot)
      contents = contents.replace(contactLinks, "");
    templates.set(filename, contents);
  }
  let contents = readFileSync(
    resolve(upstreamRoot, pullRequestTemplate),
    "utf8",
  );
  if (!existsSync(resolve(root, ".changeset/config.json")))
    contents = contents.replace(changesetItem, "");
  templates.set(pullRequestTemplate, contents);
  return templates;
}

export function unmanagedTemplates(root) {
  const directory = resolve(root, templateDirectory);
  if (!existsSync(directory)) return [];
  const managed = createGitHubTemplates(root);
  return readdirSync(directory)
    .map((name) => `${templateDirectory}/${name}`)
    .filter((filename) => !managed.has(filename));
}

export function createLabels(
  root,
  shared = readJson(resolve(upstreamRoot, ".github/labels.json")),
) {
  for (const label of shared)
    if (label.name.startsWith(packageLabelPrefix))
      throw new Error(
        `Package labels derive from packages/*: remove ${label.name} from .github/labels.json`,
      );
  const labels = [
    ...shared,
    ...packageScopes(root).map((scope) => ({
      name: `${packageLabelPrefix}${scope} 📦`,
      color: "c5def5",
      description: `${scope} package`,
    })),
  ];
  const names = labels.map((label) => label.name.toLowerCase());
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) throw new Error(`Duplicate label: ${duplicate}`);
  return labels;
}

function runGh(root, arguments_) {
  const result = spawnSync("gh", arguments_, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status)
    throw new Error(
      `gh ${arguments_.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`,
    );
  return result.stdout;
}

// Creates and updates every defined label, then deletes managed-prefix labels
// that are no longer defined. Deleting a label removes it from issues and PRs.
export function syncLabels(root, { dryRun = false, gh = runGh } = {}) {
  const desired = createLabels(root);
  const current = new Map(
    JSON.parse(
      gh(root, [
        "label",
        "list",
        "--limit",
        "1000",
        "--json",
        "name,color,description",
      ]),
    ).map((label) => [label.name.toLowerCase(), label]),
  );
  const operations = [];
  for (const { name, color, description } of desired) {
    const existing = current.get(name.toLowerCase());
    if (!existing)
      operations.push([
        "create",
        name,
        [
          "label",
          "create",
          name,
          "--color",
          color,
          "--description",
          description,
        ],
      ]);
    else if (
      existing.name !== name ||
      existing.color.toLowerCase() !== color.toLowerCase() ||
      existing.description !== description
    )
      operations.push([
        "update",
        name,
        [
          "label",
          "edit",
          existing.name,
          ...(existing.name !== name ? ["--name", name] : []),
          "--color",
          color,
          "--description",
          description,
        ],
      ]);
  }
  const defined = new Set(desired.map((label) => label.name.toLowerCase()));
  for (const { name } of current.values())
    if (
      managedLabelPrefixes.some((prefix) =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      ) &&
      !defined.has(name.toLowerCase())
    )
      operations.push(["delete", name, ["label", "delete", name, "--yes"]]);
  for (const [action, name, arguments_] of operations) {
    console.log(`${dryRun ? "Would " : ""}${action}: ${name}`);
    if (!dryRun) gh(root, arguments_);
  }
  if (!operations.length) console.log("Labels are up to date");
  return operations.map(([action, name]) => [action, name]);
}

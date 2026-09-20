// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import istanbul from "istanbul-lib-coverage";
import picomatch from "picomatch";

const slash = (path) => path.split(sep).join("/");
const inside = (root, path) => {
  const local = relative(root, path);
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
};
const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

// Read paths from Git's NUL-delimited output, never from quoted patch headers.
export function changedFiles(root, base, head = "HEAD") {
  const baseCommit = git(
    root,
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${base}^{commit}`,
  ).trim();
  const headCommit = git(
    root,
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${head}^{commit}`,
  ).trim();
  const ancestor = git(root, "merge-base", baseCommit, headCommit).trim();
  const names = git(
    root,
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    ancestor,
    headCommit,
    "--",
  ).split("\0");
  const result = new Map();
  for (let index = 0; index < names.length - 1;) {
    const status = names[index++];
    const oldPath = names[index++];
    const path = status.startsWith("R") ? names[index++] : oldPath;
    if (!/^[AMRT]/u.test(status)) continue;
    const paths = [...new Set([oldPath, path])].map(
      (item) => `:(literal)${item}`,
    );
    const patch = git(
      root,
      "diff",
      "--unified=0",
      "--find-renames",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      ancestor,
      headCommit,
      "--",
      ...paths,
    );
    const lines = new Set();
    for (const match of patch.matchAll(
      /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu,
    )) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let offset = 0; offset < count; offset++) lines.add(start + offset);
    }
    if (lines.size) result.set(path, lines);
  }
  return result;
}

export async function coverageScope(directory) {
  // Resolve through the workspace: Docs and desktop packages may use different Vitest versions.
  const require = createRequire(resolve(directory, "package.json"));
  const { resolveConfig } = await import(
    pathToFileURL(require.resolve("vitest/node")).href
  );
  const resolved = await resolveConfig({ root: directory });
  // Vitest 5 returns the resolved Vite config; Vitest 4 returns both configs.
  const coverage = (resolved.vitestConfig ?? resolved.test).coverage;
  if (
    !coverage.include?.length ||
    !coverage.include.every((pattern) => typeof pattern === "string")
  ) {
    throw new Error(
      `${directory}: test.coverage.include must explicitly define the coverage scope.`,
    );
  }
  const json = coverage.reporter.find(([name]) => name === "json");
  if (!json)
    throw new Error(
      `${directory}: add the json coverage reporter before checking changed lines.`,
    );
  const included = picomatch(coverage.include, { dot: true });
  const excluded = picomatch(coverage.exclude, { dot: true });
  return {
    directory,
    report: resolve(
      directory,
      coverage.reportsDirectory,
      json[1].file ?? "coverage-final.json",
    ),
    includes(path) {
      const absolute = resolve(path);
      const local = slash(relative(directory, absolute));
      return (
        inside(directory, absolute) &&
        included(local) &&
        !excluded(local) &&
        !excluded(slash(absolute))
      );
    },
    typescript: require("typescript"),
  };
}

export function hasChangedRuntime(source, file, lines, ts) {
  // Type-only modules, re-export barrels and comments have no instrumentable statements.
  const emitted = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      removeComments: true,
    },
  }).outputText;
  const program = ts.createSourceFile(
    file,
    emitted,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if (
    !program.statements.some(
      (statement) =>
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement) &&
        !ts.isEmptyStatement(statement),
    )
  ) {
    return false;
  }
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source,
  );
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token >= ts.SyntaxKind.FirstTriviaToken &&
      token <= ts.SyntaxKind.LastTriviaToken
    )
      continue;
    const first =
      parsed.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1;
    const last =
      parsed.getLineAndCharacterOfPosition(scanner.getTextPos() - 1).line + 1;
    for (let line = first; line <= last; line++)
      if (lines.has(line)) return true;
  }
  return false;
}

export function readCoverage(report, directory) {
  const raw = JSON.parse(readFileSync(report, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${report}: expected an Istanbul coverage object.`);
  const files = new Map();
  for (const [path, entry] of Object.entries(raw)) {
    if (!isAbsolute(path) || !inside(directory, path) || entry?.path !== path) {
      throw new Error(
        `${report}: coverage path does not match this workspace: ${path}`,
      );
    }
    const coverage = istanbul.createFileCoverage(entry);
    const ids = Object.keys(coverage.statementMap);
    if (
      ids.length !== Object.keys(coverage.s).length ||
      ids.some((id) => {
        const count = coverage.s[id];
        const location = coverage.statementMap[id];
        return (
          !Number.isFinite(count) ||
          count < 0 ||
          !Number.isInteger(location?.start?.line) ||
          location.start.line < 1 ||
          !Number.isInteger(location?.end?.line) ||
          location.end.line < location.start.line
        );
      })
    ) {
      throw new Error(
        `${report}: invalid statement counters or locations in ${path}`,
      );
    }
    files.set(resolve(path), coverage.getLineCoverage());
  }
  return files;
}

export function measureChangedCoverage({
  changed,
  scope,
  root,
  sourceFor = (file) => readFileSync(file, "utf8"),
}) {
  const relevant = [...changed].flatMap(([path, lines]) => {
    const file = resolve(root, path);
    return scope.includes(file) &&
      hasChangedRuntime(sourceFor(file), file, lines, scope.typescript)
      ? [{ file, path, lines }]
      : [];
  });
  if (!relevant.length) return { covered: 0, total: 0, missed: [], files: 0 };
  // A missing, empty or foreign report must never turn a source change into a passing no-op.
  const coverage = readCoverage(scope.report, scope.directory);
  let covered = 0;
  let total = 0;
  const missed = [];
  for (const { file, path, lines } of relevant) {
    const measured = coverage.get(file);
    if (!measured || !Object.keys(measured).length)
      throw new Error(
        `${path}: changed runtime file is missing coverage measurements.`,
      );
    for (const [rawLine, count] of Object.entries(measured)) {
      const line = Number(rawLine);
      if (!lines.has(line)) continue;
      total++;
      if (count > 0) covered++;
      else missed.push(`${path}:${line}`);
    }
  }
  return { covered, total, missed, files: relevant.length };
}

export async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      packages: { type: "string" },
      minimum: { type: "string", default: "80" },
    },
  });
  if (!values.base?.trim())
    throw new Error(
      "Usage: node scripts/coverage-diff-check.mjs --base REF [--packages JSON] [--minimum 80]",
    );
  const minimum = Number(values.minimum);
  if (
    !values.minimum.trim() ||
    !Number.isFinite(minimum) ||
    minimum < 0 ||
    minimum > 100
  )
    throw new Error("--minimum must be between 0 and 100.");
  const root = git(process.cwd(), "rev-parse", "--show-toplevel").trim();
  if (
    git(
      root,
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${values.head}^{commit}`,
    ).trim() !== git(root, "rev-parse", "HEAD").trim()
  ) {
    throw new Error(
      "--head must match the checkout used to generate coverage.",
    );
  }
  const packages = readdirSync(resolve(root, "packages"), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(root, "packages", entry.name, "package.json")),
    )
    .map((entry) => {
      const directory = resolve(root, "packages", entry.name);
      return {
        directory,
        ...JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")),
      };
    });
  const selected =
    values.packages === undefined
      ? packages.map((pkg) => pkg.name)
      : JSON.parse(values.packages);
  if (
    !Array.isArray(selected) ||
    new Set(selected).size !== selected.length ||
    selected.some((name) => !packages.some((pkg) => pkg.name === name))
  ) {
    throw new Error(
      "--packages must be a JSON array of unique workspace names.",
    );
  }
  const changed = changedFiles(root, values.base, values.head);
  let ok = true;
  for (const name of selected) {
    const pkg = packages.find((item) => item.name === name);
    if (!pkg.scripts?.["test:coverage"]) {
      console.log(
        `${name}: no test:coverage script; outside the configured coverage scope.`,
      );
      continue;
    }
    const scope = await coverageScope(pkg.directory);
    const result = measureChangedCoverage({ changed, scope, root });
    if (!result.total) {
      console.log(
        `${name}: no changed executable lines in the configured coverage scope (${result.files} changed runtime files verified).`,
      );
      continue;
    }
    const percent = (100 * result.covered) / result.total;
    console.log(
      `${name}: changed-line coverage ${percent.toFixed(2)}% (${result.covered}/${result.total}); required ${minimum}%.`,
    );
    if (percent < minimum) {
      ok = false;
      for (const missed of result.missed) console.error(`Uncovered: ${missed}`);
    }
  }
  return ok ? 0 : 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

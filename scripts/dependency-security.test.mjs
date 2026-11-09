// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Exercise the actual dependency used by the installed style and glob tooling.
const require = createRequire(import.meta.url);
const stylelintRequire = createRequire(require.resolve("stylelint"));
const micromatchPath = stylelintRequire.resolve("micromatch");
const micromatch = stylelintRequire("micromatch");
const braces = createRequire(micromatchPath)("braces");
const docsRequire = createRequire(
  new URL("../packages/saika-docs/package.json", import.meta.url),
);
const jestRequire = createRequire(docsRequire.resolve("jest-config"));
const merge = jestRequire("deepmerge");
const katex = createRequire(docsRequire.resolve("rehype-katex"))("katex");
const laneRequire = createRequire(
  new URL("../packages/saika-lane/package.json", import.meta.url),
);
const appBuilderRequire = createRequire(
  createRequire(laneRequire.resolve("electron-builder")).resolve(
    "app-builder-lib",
  ),
);
const eslintConfigRequire = createRequire(
  new URL("../packages/eslint-config/package.json", import.meta.url),
);
const typescriptEstreeRequire = createRequire(
  createRequire(eslintConfigRequire.resolve("typescript-eslint")).resolve(
    "@typescript-eslint/typescript-estree",
  ),
);

function makeDirectoryTree(root, depth) {
  if (depth === 0) return;
  for (const name of ["d0", "d1", "d2", "d3"]) {
    const directory = join(root, name);
    fs.mkdirSync(directory);
    makeDirectoryTree(directory, depth - 1);
  }
}

test("Jest file discovery matches files and stops reading directories after an abort", async () => {
  const { glob, globSync } = jestRequire("glob");
  const root = fs.mkdtempSync(join(tmpdir(), "glob-abort-"));
  try {
    makeDirectoryTree(root, 3);
    assert.deepEqual(globSync("d0/d1/*", { cwd: root, posix: true }).sort(), [
      "d0/d1/d0",
      "d0/d1/d1",
      "d0/d1/d2",
      "d0/d1/d3",
    ]);

    let reads = 0;
    let pendingReads = 0;
    let onReadsSettled = () => {};
    const controller = new AbortController();
    const readdir = (...args) => {
      const callback = args.pop();
      reads += 1;
      pendingReads += 1;
      controller.abort(new Error("stop walking"));
      fs.readdir(...args, (...result) => {
        pendingReads -= 1;
        callback(...result);
        if (pendingReads === 0) onReadsSettled();
      });
    };
    await assert.rejects(
      glob("**", {
        cwd: root,
        signal: controller.signal,
        fs: { ...fs, readdir },
      }),
      /stop walking/,
    );
    const readsAtRejection = reads;
    // Let every started read call back; a walk that ignores the abort reads further directories from those callbacks.
    for (;;) {
      while (pendingReads > 0) {
        await new Promise((resolve) => {
          onReadsSettled = resolve;
        });
      }
      const readsBeforeTurn = reads;
      await new Promise((resolve) => setImmediate(resolve));
      if (pendingReads === 0 && reads === readsBeforeTurn) break;
    }
    assert.equal(reads, readsAtRejection);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packaging and lint pattern matching keep ordinary results and bound '**/..' expansion", () => {
  const amplified =
    Array.from({ length: 16 }, (_, index) => `x${index}/**/..`).join("/") +
    "/y";
  for (const { Minimatch } of [
    appBuilderRequire("minimatch"),
    typescriptEstreeRequire("minimatch"),
  ]) {
    // electron-builder matches its file patterns with `dot: true`.
    const files = new Minimatch("dist/**/*", { dot: true });
    assert.equal(files.match("dist/main/.env"), true);
    assert.equal(files.match("dist", true), true);
    assert.equal(files.match("src/main.ts"), false);
    const excluded = new Minimatch("!**/node_modules/**", { dot: true });
    assert.equal(excluded.negate, true);
    assert.equal(excluded.match("app/node_modules/pkg/index.js"), false);
    assert.equal(excluded.match("app/dist/index.js"), true);
    assert.throws(
      () => new Minimatch(amplified, { optimizationLevel: 2 }),
      /too many patterns/,
    );
  }
});

test("Jest globals merge nested settings and concatenate arrays without mutating inputs", () => {
  const preset = { settings: { enabled: true, tags: ["preset"] } };
  const project = { settings: { label: "project", tags: ["project"] } };
  const merged = merge(preset, project);
  assert.deepEqual(merged, {
    settings: { enabled: true, label: "project", tags: ["preset", "project"] },
  });
  merged.settings.tags.push("later");
  assert.deepEqual(preset.settings.tags, ["preset"]);
  assert.deepEqual(project.settings.tags, ["project"]);
});

test("the Jest merge dependency rejects prototype poisoning in source and target objects", () => {
  const payload = () =>
    JSON.parse('{"__proto__":{"unexpectedFlag":true},"value":1}');
  const results = [
    merge(Object.create(null), payload()),
    merge(payload(), {}),
    merge(payload(), payload()),
    ...[null, undefined, false, 0, ""].map(
      (placeholder) =>
        merge({ settings: placeholder }, { settings: payload() }).settings,
    ),
    merge({}, { settings: [payload()] }).settings[0],
  ];
  for (const result of results) {
    assert.equal(result.value, 1);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.hasOwn(result, "__proto__"), false);
    assert.equal(result.unexpectedFlag, undefined);
  }
  assert.equal(Object.prototype.unexpectedFlag, undefined);
});

test("KaTeX ignores inherited trust settings while preserving explicit trusted rendering", () => {
  const expression = String.raw`\href{https://example.com/}{x}`;
  const inherited = katex.renderToString(
    expression,
    Object.create({ trust: true }),
  );
  assert.doesNotMatch(inherited, /<a\b/);
  assert.match(katex.renderToString(expression, { trust: true }), /<a\b/);
  assert.match(katex.renderToString("x^2"), /class="katex"/);
});

test("glob and brace expansion retain ordinary file matching behavior", () => {
  assert.deepEqual(braces.expand("src/{app,lib}/{a,b}.js"), [
    "src/app/a.js",
    "src/app/b.js",
    "src/lib/a.js",
    "src/lib/b.js",
  ]);
  assert.deepEqual(braces.expand("{01..05..2}"), ["01", "03", "05"]);
  assert.deepEqual(braces.expand("{a,{b,c}}"), ["a", "b", "c"]);
  assert.deepEqual(braces.expand("\\{a,b\\}"), ["{a,b}"]);
  assert.equal(
    braces.stringify(braces.parse("(src/{app,lib})")),
    "(src/{app,lib})",
  );
  assert.deepEqual(
    micromatch(
      ["src/a.js", "src/b.ts", "src/c.css", "test/a.js"],
      "src/*.{js,ts}",
    ),
    ["src/a.js", "src/b.ts"],
  );
});

test("deep string inputs fail with a depth diagnostic before stack exhaustion", () => {
  for (const pattern of [
    "{".repeat(4000) + "x" + "}".repeat(4000),
    "(".repeat(4000) + "x" + ")".repeat(4000),
    "{(".repeat(2000) + "x" + ")}".repeat(2000),
    "{".repeat(4000),
  ]) {
    for (const method of ["parse", "compile", "expand", "stringify"]) {
      for (const maxDepth of [undefined, Infinity, NaN, 10000]) {
        assert.throws(() => braces[method](pattern, { maxDepth }), {
          name: "SyntaxError",
          message: /exceeds max depth/,
        });
      }
    }
  }
});

test("caller limits preserve shallow nesting and reject the next depth", () => {
  assert.deepEqual(braces.expand("{a,b}", { maxDepth: 1 }), ["a", "b"]);
  for (const maxDepth of [1, 1.5]) {
    assert.throws(() => braces.parse("{a,{b,c}}", { maxDepth }), {
      name: "SyntaxError",
      message: /exceeds max depth/,
    });
  }
});

function deepAst() {
  const root = { type: "root", nodes: [] };
  let parent = root;
  for (let depth = 0; depth < 4000; depth++) {
    const child = { type: "paren", nodes: [], parent };
    parent.nodes.push(child);
    parent = child;
  }
  parent.nodes.push({ type: "text", value: "x", parent });
  return root;
}

test("direct AST traversal cannot bypass the nesting guard", () => {
  for (const method of ["compile", "expand", "stringify"]) {
    assert.throws(() => braces[method](deepAst()), {
      name: "RangeError",
      message: /exceeds max depth/,
    });
  }
});

test("invalid length options cannot bypass the input size limit", () => {
  const pattern = "x".repeat(10001);
  assert.throws(() => braces.parse(pattern, { maxLength: Infinity }), {
    name: "SyntaxError",
    message: /exceeds max characters/,
  });
  assert.throws(() => braces.parse(pattern, { maxLength: NaN }), {
    name: "RangeError",
    message: /maxLength/,
  });
});

test("numeric expansion keeps the existing range size guard", () => {
  assert.throws(() => braces.expand("{1..1000000000}"), {
    name: "RangeError",
    message: /range limit/,
  });
});

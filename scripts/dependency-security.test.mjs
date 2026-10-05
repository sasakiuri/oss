// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

// Exercise the actual dependency used by the installed style and glob tooling.
const require = createRequire(import.meta.url);
const stylelintRequire = createRequire(require.resolve("stylelint"));
const micromatchPath = stylelintRequire.resolve("micromatch");
const micromatch = stylelintRequire("micromatch");
const braces = createRequire(micromatchPath)("braces");

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

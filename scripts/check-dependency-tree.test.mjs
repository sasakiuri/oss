// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { dependencyTreeProblems } from "./dependency-tree-problems.mjs";

test("a clean dependency tree passes", async () => {
  assert.deepEqual(
    await dependencyTreeProblems("/unused", {
      name: "root",
      version: "1.0.0",
      dependencies: { example: { version: "1.0.0" } },
    }),
    [],
  );
});

test("extraneous nodes and aggregate extraneous problems are ignored", async () => {
  assert.deepEqual(
    await dependencyTreeProblems("/unused", {
      name: "root",
      problems: ["extraneous: example@1.0.0 /unused/example"],
      dependencies: {
        example: {
          extraneous: true,
          invalid: true,
          dependencies: { absent: { missing: true } },
        },
      },
    }),
    [],
  );
});

test("missing dependencies and peer problems fail even without npm problem summaries", async () => {
  assert.deepEqual(
    await dependencyTreeProblems("/unused", {
      name: "root",
      version: "1.0.0",
      dependencies: {
        absent: { missing: true },
        peer: {
          problems: ["peer dep missing: peer@^1, required by consumer@1.0.0"],
        },
      },
    }),
    [
      "missing: absent, required by root@1.0.0",
      "peer dep missing: peer@^1, required by consumer@1.0.0",
    ],
  );
});

async function invalidFixture(t, manifests) {
  const root = await mkdtemp(join(tmpdir(), "dependency-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, manifest] of Object.entries(manifests)) {
    const directory = join(root, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  }
  const problem = `invalid: example@2.0.0 ${join(root, "node_modules/example")}`;
  const node = (name) => ({
    version: "2.0.0",
    path: join(root, "node_modules/example"),
    invalid: `"^1.0.0" from node_modules/${name}`,
    problems: [problem],
  });
  const tree = {
    name: "root",
    problems: [problem],
    dependencies: Object.fromEntries(
      Object.keys(manifests).map((name) => [
        name,
        {
          version: "1.0.0",
          dependencies: { example: node(name) },
        },
      ]),
    ),
  };
  return { root, tree, problem };
}

test("an invalid package required by a real dependency fails", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {
    consumer: { dependencies: { example: "^1.0.0" } },
  });
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("an invalid package referenced only by optional peer ranges passes", async (t) => {
  const { root, tree } = await invalidFixture(t, {
    consumer: {
      peerDependencies: { example: "^1.0.0" },
      peerDependenciesMeta: { example: { optional: true } },
    },
  });
  assert.deepEqual(await dependencyTreeProblems(root, tree), []);
});

test("an optional peer conflict also reported by a real dependency fails", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {
    optional: {
      peerDependencies: { example: "^1.0.0" },
      peerDependenciesMeta: { example: { optional: true } },
    },
    required: { dependencies: { example: "^1.0.0" } },
  });
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("one invalid node with optional and required peer complaints fails", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {
    optional: {
      peerDependencies: { example: "^1.0.0" },
      peerDependenciesMeta: { example: { optional: true } },
    },
    required: { peerDependencies: { example: "^1.0.0" } },
  });
  tree.dependencies.optional.dependencies.example.invalid +=
    ', "^1.0.0" from node_modules/required';
  delete tree.dependencies.required;
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("selected license subtrees retain fallback names and exclude unrelated root problems", async () => {
  const tree = {
    name: "root",
    problems: ["missing: unrelated, required by root"],
    dependencies: { workspace: { version: "1.0.0", missing: true } },
  };
  assert.deepEqual(
    await dependencyTreeProblems("/unused", tree.dependencies.workspace, {
      name: "workspace",
      parent: tree.name,
    }),
    ["missing: workspace, required by root"],
  );
});

test("an optional peer marker does not excuse an actual optional dependency", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {
    consumer: {
      optionalDependencies: { example: "^1.0.0" },
      peerDependenciesMeta: { example: { optional: true } },
    },
  });
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("unreadable requirer manifests and unparseable invalid reasons fail closed", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, { consumer: {} });
  const node = tree.dependencies.consumer.dependencies.example;
  node.invalid = '"^1.0.0" from node_modules/absent';
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
  node.invalid = true;
  delete node.problems;
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

const optionalPeer = {
  peerDependencies: { example: "^1.0.0" },
  peerDependenciesMeta: { example: { optional: true } },
};

test("a root project requirement next to an optional peer complaint fails", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {
    consumer: optionalPeer,
  });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { example: "^1.0.0" } }),
  );
  const node = tree.dependencies.consumer.dependencies.example;
  node.invalid = `"^1.0.0" from the root project, ${node.invalid}`;
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("a workspace devDependency is a real requirement even with an optional peer marker", async (t) => {
  const { root, tree, problem } = await invalidFixture(t, {});
  await mkdir(join(root, "packages/workspace"), { recursive: true });
  await writeFile(
    join(root, "packages/workspace/package.json"),
    JSON.stringify({ ...optionalPeer, devDependencies: { example: "^1.0.0" } }),
  );
  tree.dependencies.workspace = {
    version: "1.0.0",
    dependencies: {
      example: {
        version: "2.0.0",
        path: join(root, "node_modules/example"),
        invalid: '"^1.0.0" from packages/workspace',
        problems: [problem],
      },
    },
  };
  assert.deepEqual(await dependencyTreeProblems(root, tree), [problem]);
});

test("an installed package's devDependency does not override its optional peer marker", async (t) => {
  const { root, tree } = await invalidFixture(t, {
    consumer: { ...optionalPeer, devDependencies: { example: "^1.0.0" } },
  });
  assert.deepEqual(await dependencyTreeProblems(root, tree), []);
});

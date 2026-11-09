// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { repositoryFiles } from "../files.mjs";
import { formatRepository } from "../format.mjs";

test("formatting checks tracked and new files with nested config and ignores", async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "format-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", root]);
  const files = {
    ".gitignore": "ignored.js\n",
    ".prettierignore": "root-generated.js\n",
    ".prettierrc.json": '{"singleQuote":false}\n',
    "tracked.js": "const value=1\n",
    "new.js": "const fresh=2\n",
    "ignored.js": "invalid {",
    "root-generated.js": "invalid {",
    ".local/notes.js": "invalid {",
    "packages/app/.prettierrc.json": '{"singleQuote":true}\n',
    "packages/app/.prettierignore": "generated.js\n",
    "packages/app/generated.js": "invalid {",
    "packages/app/index.js": 'const label="local"\n',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(resolve(root, file), text);
  }
  execFileSync("git", ["add", "tracked.js"], { cwd: root });
  symlinkSync("tracked.js", resolve(root, "linked.js"));
  assert.ok(repositoryFiles(root).includes("tracked.js"));
  assert.ok(repositoryFiles(root).includes("new.js"));
  assert.ok(!repositoryFiles(root).includes(".local/notes.js"));
  assert.ok(!repositoryFiles(root).includes("linked.js"));
  assert.equal(await formatRepository(root), 1);
  assert.equal(
    readFileSync(resolve(root, "tracked.js"), "utf8"),
    files["tracked.js"],
  );
  assert.equal(await formatRepository(root, { write: true }), 0);
  assert.equal(await formatRepository(root), 0);
  assert.equal(
    readFileSync(resolve(root, "packages/app/index.js"), "utf8"),
    "const label = 'local';\n",
  );
  assert.equal(
    readFileSync(resolve(root, "root-generated.js"), "utf8"),
    "invalid {",
  );
  assert.equal(
    readFileSync(resolve(root, "packages/app/generated.js"), "utf8"),
    "invalid {",
  );
});

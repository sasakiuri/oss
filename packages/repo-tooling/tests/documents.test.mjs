// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { checkDocuments } from "../documents.mjs";

function fixture(t, files) {
  const root = mkdtempSync(resolve(tmpdir(), "document-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, value] of Object.entries(files)) {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(resolve(root, file), value);
  }
  return root;
}

test("Markdown links resolve references, encoded paths, images, directories and duplicate headings", (t) => {
  const root = fixture(t, {
    "README.md":
      "# Title\n\n[guide][g]\n\n[g]: docs/guide%20one.md#見出し-1\n\n![image](docs/image.svg)\n\n[folder](docs/#intro)\n\n[web](https://example.invalid/missing)\n\n```md\n[example](missing.md)\n```\n",
    "docs/README.md": "# Intro\n",
    "docs/guide one.md": "# Guide\n\n## 見出し\n\n## 見出し\n",
    "docs/image.svg": "<svg/>",
  });
  assert.deepEqual(
    checkDocuments(root, ["README.md", "docs/guide one.md"]),
    [],
  );
});

test("missing titles, files, images and headings fail with source locations", (t) => {
  const root = fixture(t, {
    "README.md":
      "Text\r\n\n[link](missing.md)\n\n![image](missing.png)\n\n[anchor](#absent)\n",
  });
  const errors = checkDocuments(root, ["README.md"]);
  assert.equal(errors.length, 5);
  assert.ok(
    errors.some((error) => error.includes("README.md:3: missing local target")),
  );
  assert.ok(errors.some((error) => error.includes("missing heading #absent")));
});

test("malformed URLs and links outside the checkout fail while explicit HTML anchors work", (t) => {
  const root = fixture(t, {
    "README.md":
      '# Title\n\n<a id="custom"></a>\n\n[ok](#custom)\n\n[bad](%FF.md)\n\n[outside](../README.md)\n',
  });
  assert.deepEqual(
    checkDocuments(root, ["README.md"]).map((error) => error.split(": ")[1]),
    ["invalid URL encoding %FF.md", "missing local target ../README.md"],
  );
});

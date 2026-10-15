// SPDX-License-Identifier: MIT
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";
import { expect, it } from "vitest";

import { STATIC_ASSET_PATHS } from "../src/http/assets.ts";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

it("serves exactly the public files, with index.html at the root", () => {
  const files = readdirSync(publicDirectory, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile());
  expect(STATIC_ASSET_PATHS).toEqual(
    new Set(
      files.map((entry) => {
        const name = relative(
          publicDirectory,
          join(entry.parentPath, entry.name),
        );
        return name === "index.html" ? "/" : `/${name}`;
      }),
    ),
  );
});

it("allows every module imported by the browser entry point", () => {
  const bundle = buildSync({
    absWorkingDir: publicDirectory,
    entryPoints: ["app.js"],
    bundle: true,
    write: false,
    metafile: true,
  });
  for (const input of Object.keys(bundle.metafile!.inputs))
    expect(STATIC_ASSET_PATHS).toContain(`/${input}`);
});

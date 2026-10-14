// SPDX-License-Identifier: MIT
import { readdirSync } from "node:fs";

import { expect, it } from "vitest";

import { STATIC_ASSET_PATHS } from "../src/http/assets.ts";

it("serves exactly the public files, with index.html at the root", () => {
  const files = readdirSync(new URL("../public/", import.meta.url), {
    recursive: true,
  });
  expect(STATIC_ASSET_PATHS).toEqual(
    new Set(files.map((name) => (name === "index.html" ? "/" : `/${name}`))),
  );
});

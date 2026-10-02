// SPDX-License-Identifier: MIT
import { fileURLToPath } from "node:url";
import { createLintStagedConfig } from "./packages/repo-tooling/config.mjs";

export default createLintStagedConfig(
  fileURLToPath(new URL(".", import.meta.url)),
);

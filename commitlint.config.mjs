// SPDX-License-Identifier: MIT
import { fileURLToPath } from "node:url";
import { createCommitlintConfig } from "./packages/repo-tooling/config.mjs";

export default createCommitlintConfig(
  fileURLToPath(new URL(".", import.meta.url)),
);

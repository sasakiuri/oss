// SPDX-License-Identifier: MIT
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "saika-lane",
        "eslint-config",
        "prettier-config",
        "stylelint-config",
        "typescript-config",
        "repo",
      ],
    ],
    "scope-empty": [2, "never"],
    "scope-case": [2, "always", "kebab-case"],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "chore",
        "ci",
        "revert",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};

export default config;

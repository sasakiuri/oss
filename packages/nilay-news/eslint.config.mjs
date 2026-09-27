// SPDX-License-Identifier: MIT
import eslintConfig from "@sasakiuri/eslint-config";
import vitest from "@sasakiuri/eslint-config/vitest";

export default [
  {
    ignores: [
      "public/**",
      ".local/**",
      ".wrangler/**",
      ".venv/**",
      ".venv-workers/**",
      "python_modules/**",
    ],
  },
  ...eslintConfig,
  vitest,
];

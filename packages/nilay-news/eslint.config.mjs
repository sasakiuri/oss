// SPDX-License-Identifier: MIT
import eslintConfig from "@sasakiuri/eslint-config";
import vitest from "@sasakiuri/eslint-config/vitest";

export default [
  {
    ignores: [
      "public/**",
      "playwright-report/**",
      "test-results/**",
      ".local/**",
      ".wrangler/**",
    ],
  },
  ...eslintConfig,
  vitest,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/parameter-properties": [
        "error",
        { prefer: "class-property" },
      ],
    },
  },
];

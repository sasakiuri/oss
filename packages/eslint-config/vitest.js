// SPDX-License-Identifier: MIT
import vitest from "@vitest/eslint-plugin";

export default {
  name: "@sasakiuri/vitest",
  files: ["**/*.test.{ts,tsx}"],
  plugins: { vitest },
  rules: {
    "vitest/no-focused-tests": "error",
    "vitest/no-disabled-tests": "error",
    "vitest/valid-expect": "error",
    "vitest/valid-describe-callback": "error",
    "vitest/no-identical-title": "error",
  },
};

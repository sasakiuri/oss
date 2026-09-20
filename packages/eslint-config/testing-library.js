// SPDX-License-Identifier: MIT
import testingLibrary from "eslint-plugin-testing-library";

export default {
  name: "@sasakiuri/testing-library-react",
  files: ["**/*.test.{ts,tsx}"],
  plugins: { "testing-library": testingLibrary },
  rules: {
    "testing-library/await-async-events": "error",
    "testing-library/await-async-queries": "error",
    "testing-library/await-async-utils": "error",
    "testing-library/no-promise-in-fire-event": "error",
    "testing-library/no-wait-for-side-effects": "error",
  },
};

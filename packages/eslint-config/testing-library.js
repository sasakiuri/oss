// SPDX-License-Identifier: MIT
import testingLibrary from "eslint-plugin-testing-library";

export default {
  name: "@sasakiuri/testing-library-react",
  files: ["**/*.test.{ts,tsx}"],
  plugins: { "testing-library": testingLibrary },
  // Only identify utilities imported from Testing Library; application helpers
  // also use names such as renderToStaticMarkup, debug, and fireEvent.
  settings: { "testing-library/utils-module": "off" },
  rules: {
    ...testingLibrary.configs["flat/react"].rules,
    "testing-library/no-debugging-utils": "error",
    // SVG, print layout, and hydration tests also assert DOM structure.
    "testing-library/no-node-access": "off",
    "testing-library/no-container": "off",
    // Async act flushes effects from IPC and hydration as well as render calls.
    "testing-library/no-unnecessary-act": "off",
    // Several runners disable globals or require cleanup before restoring timers.
    "testing-library/no-manual-cleanup": "off",
    "testing-library/await-async-events": "error",
    "testing-library/await-async-queries": "error",
    "testing-library/await-async-utils": "error",
    "testing-library/no-promise-in-fire-event": "error",
    "testing-library/no-wait-for-side-effects": "error",
  },
};

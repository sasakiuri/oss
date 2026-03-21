// SPDX-License-Identifier: MIT
/** @type {import('stylelint').Config} */
const config = {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-standard-scss",
    "stylelint-config-recess-order",
  ],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "layer",
          "apply",
          "config",
          "variants",
          "responsive",
          "screen",
        ],
      },
    ],

    "function-no-unknown": [
      true,
      {
        ignoreFunctions: ["theme", "screen"],
      },
    ],

    "scss/at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "layer",
          "apply",
          "config",
          "variants",
          "responsive",
          "screen",
        ],
      },
    ],

    "selector-max-specificity": "0,4,0",
    "max-nesting-depth": 3,
    "color-hex-length": "short",
    "declaration-no-important": null,
    "no-empty-source": null,
    "custom-property-pattern": null,
    "selector-class-pattern": null,
    "scss/dollar-variable-pattern": null,
    "property-no-vendor-prefix": [
      true,
      {
        ignoreProperties: ["appearance", "backdrop-filter"],
      },
    ],
    "value-no-vendor-prefix": [
      true,
      {
        ignoreValues: ["box", "inline-box"],
      },
    ],
  },

  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/out/**",
  ],
};

export default config;

// SPDX-License-Identifier: MIT
const config = {
  // saika-lane (source + tests: ESLint + Prettier)
  "packages/saika-lane/{src,tests}/**/*.{ts,tsx}": (filenames) => [
    `eslint --max-warnings 0 --fix ${filenames.join(" ")}`,
    `prettier --write ${filenames.join(" ")}`,
  ],

  // saika-lane (config files + e2e: Prettier only)
  "packages/saika-lane/{e2e,scripts}/**/*.{ts,tsx}": (filenames) => [
    `prettier --write ${filenames.join(" ")}`,
  ],
  "packages/saika-lane/*.{ts,mjs,cjs}": (filenames) => [
    `eslint --max-warnings 0 --fix ${filenames.join(" ")}`,
    `prettier --write ${filenames.join(" ")}`,
  ],

  // Shared config packages
  "packages/eslint-config/**/*.js": (filenames) => [
    `prettier --write ${filenames.join(" ")}`,
  ],
  "packages/prettier-config/**/*.js": (filenames) => [
    `prettier --write ${filenames.join(" ")}`,
  ],
  "packages/stylelint-config/**/*.js": (filenames) => [
    `prettier --write ${filenames.join(" ")}`,
  ],

  // Shared config packages (JSON/MD)
  "packages/{eslint-config,prettier-config,stylelint-config,typescript-config}/**/*.{json,md}":
    (filenames) => [`prettier --write ${filenames.join(" ")}`],

  // Root config files
  "*.{js,mjs,cjs,ts,json,md,yml,yaml}": (filenames) => [
    `prettier --write ${filenames.join(" ")}`,
  ],
};

export default config;

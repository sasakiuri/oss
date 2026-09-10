// SPDX-License-Identifier: MIT
import path from "node:path";

const config = {
  "*.{md,txt}": () => "npm run lint:text",
  "packages/saika-docs/**/*.{ts,tsx,mjs,cjs,json,md,css,scss,yml,yaml}": () =>
    "npm run lint:prettier --workspace=@sasakiuri/saika-docs",
  "packages/saika-docs/**/*.{ts,tsx,mjs,cjs}": () => [
    "npm run lint:eslint --workspace=@sasakiuri/saika-docs",
    "npm run typecheck --workspace=@sasakiuri/saika-docs",
  ],
  "packages/saika-docs/**/*.{css,scss}": () =>
    "npm run lint:styles --workspace=@sasakiuri/saika-docs",
  "packages/saika-docs/**/*.md": () =>
    "npm run lint:text --workspace=@sasakiuri/saika-docs",
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
  "*.{js,mjs,cjs,ts,json,md,yml,yaml}": (filenames) => {
    // The documentation workspace checks formatting with its own ignore file.
    const files = filenames.filter(
      (filename) =>
        !path
          .relative(process.cwd(), filename)
          .split(path.sep)
          .join("/")
          .startsWith("packages/saika-docs/"),
    );
    return files.length ? [`prettier --write ${files.join(" ")}`] : [];
  },
};

export default config;

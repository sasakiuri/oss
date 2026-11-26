# @sasakiuri/eslint-config

Shared ESLint flat config for TypeScript projects.

## Installation

```bash
npm install -D @sasakiuri/eslint-config eslint
```

## Usage

Create `eslint.config.mjs` in your project root:

```js
import eslintConfig from "@sasakiuri/eslint-config";

export default eslintConfig;
```

### Test quality checks

Opt in to framework-specific presets for TypeScript tests:

```js
import eslintConfig from "@sasakiuri/eslint-config";
import vitest from "@sasakiuri/eslint-config/vitest";
import testingLibrary from "@sasakiuri/eslint-config/testing-library";

export default [
  ...eslintConfig,
  vitest,
  { ...testingLibrary, files: ["tests/renderer/**/*.test.{ts,tsx}"] },
];
```

The Vitest preset rejects focused or disabled tests, conditional assertions without
an explicit nonzero `expect.assertions(n)` count, invalid assertions and
describe callbacks, and duplicate test titles. The React
Testing Library preset checks asynchronous queries, events, and utilities, and
rejects side effects inside retrying `waitFor` callbacks.

Both presets default to `**/*.test.{ts,tsx}`. Override `files` to match the tests
run by each framework, including JavaScript tests when needed. Keep Playwright
and `node:test` files outside the Vitest scope. Existing users of the default
configuration retain their current rule set.

### Next.js

Next.js applications add the `eslint-config-next` rules after the default
configuration. Install `eslint-config-next` 16 in the application:

```js
import eslintConfig from "@sasakiuri/eslint-config";
import next, { accessibility } from "@sasakiuri/eslint-config/next";

export default [
  ...eslintConfig,
  ...next,
  { ...accessibility, files: ["src/**/*.tsx"] },
];
```

`next` contains the Core Web Vitals and TypeScript configurations of
`eslint-config-next`. Use `coreWebVitals` instead to keep the default
configuration's TypeScript rule levels. Both leave the TypeScript plugin to the
default configuration, because Next.js can resolve another copy of it.
`accessibility` enables every recommended `jsx-a11y` rule, where Next.js enables
only a few, for `**/*.{jsx,tsx}` by default.

## Features

- **TypeScript support** via `typescript-eslint`
- **Import ordering** -- alphabetical, grouped by builtin/external/internal
- **Unused import removal** via `eslint-plugin-unused-imports`
- **Prettier integration** -- `eslint-config-prettier` disables conflicting rules
- Sensible ignores for `node_modules`, `dist`, `build`, `.next`, `coverage`

## Peer Dependencies

- `eslint` >= 9.0.0

## License

MIT

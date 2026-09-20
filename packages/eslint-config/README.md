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

The Vitest preset rejects focused or disabled tests, invalid assertions and
describe callbacks, and duplicate test titles. The React
Testing Library preset checks asynchronous queries, events, and utilities, and
rejects side effects inside retrying `waitFor` callbacks.

Both presets default to `**/*.test.{ts,tsx}`. Override `files` to match the tests
run by each framework, including JavaScript tests when needed. Keep Playwright
and `node:test` files outside the Vitest scope. Existing users of the default
configuration retain their current rule set.

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

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

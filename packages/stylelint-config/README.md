# @sasakiuri/stylelint-config

Shared Stylelint configuration for SCSS and Tailwind CSS projects.

## Installation

```bash
npm install -D @sasakiuri/stylelint-config stylelint
```

## Usage

Create `.stylelintrc.js` in your project root:

```js
export default {
  extends: "@sasakiuri/stylelint-config",
};
```

## Features

- **Standard CSS + SCSS** via `stylelint-config-standard-scss`
- **Property ordering** via `stylelint-config-recess-order`
- **Tailwind CSS support** -- `@tailwind`, `@apply`, `@layer`, `@screen`, `theme()` recognized
- Max nesting depth: 3
- Max selector specificity: `0,4,0`
- Short lowercase hex colors enforced

## Peer Dependencies

- `stylelint` >= 16

## License

MIT

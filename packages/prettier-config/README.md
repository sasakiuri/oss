# @sasakiuri/prettier-config

Shared Prettier configuration.

## Installation

```bash
npm install -D @sasakiuri/prettier-config prettier
```

## Usage

Add to your `package.json`:

```json
{
  "prettier": "@sasakiuri/prettier-config"
}
```

### With Tailwind CSS

Install the Tailwind plugin as an additional dependency:

```bash
npm install -D prettier-plugin-tailwindcss
```

Then import the Tailwind-enhanced config:

```js
// prettier.config.mjs
import { tailwind } from "@sasakiuri/prettier-config";

export default tailwind;
```

## Key Settings

| Setting         | Value  |
| --------------- | ------ |
| Print width     | 120    |
| Quotes          | Single |
| Semicolons      | Yes    |
| Trailing commas | All    |
| Tab width       | 2      |
| End of line     | LF     |

## License

MIT

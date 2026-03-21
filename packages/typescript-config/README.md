# @sasakiuri/typescript-config

Shared TypeScript configurations.

## Installation

```bash
npm install -D @sasakiuri/typescript-config
```

## Available Configs

| Config         | Target | Use Case                                 |
| -------------- | ------ | ---------------------------------------- |
| `base.json`    | ES2017 | General TypeScript projects              |
| `vite.json`    | ES2020 | Vite-based apps (extends base)           |
| `nextjs.json`  | ES2017 | Next.js apps (extends base)              |
| `laravel.json` | ESNext | Laravel + Inertia.js apps (extends base) |

## Usage

In your `tsconfig.json`:

```json
{
  "extends": "@sasakiuri/typescript-config/vite.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

## Key Settings (base)

- **Strict mode** enabled
- **noUncheckedIndexedAccess** -- catches unsafe index access
- **noImplicitReturns** -- all code paths must return
- **noFallthroughCasesInSwitch** -- prevents switch fallthrough
- **Bundler module resolution**
- **isolatedModules** -- safe for transpile-only tools

## License

MIT

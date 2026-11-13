# @sasakiuri/eslint-config

## 2.0.0

### Major Changes

- [#222](https://github.com/sasakiuri/oss/pull/222) [`16e85dc`](https://github.com/sasakiuri/oss/commit/16e85dcc8d0f01e1d5826b1d78b1df645549806d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Enable the recommended Vitest and React Testing Library rules in the shared test presets. Existing consumers must fix newly reported test lint errors, including tests without assertions and debugging utilities, before adopting the new major version. Retain the documented exceptions for DOM structure, explicit cleanup, and asynchronous effects.

  Recognize Tailwind CSS directives in the shared Stylelint rules and preserve the application mount selector's existing specificity.

### Minor Changes

- [#101](https://github.com/sasakiuri/oss/pull/101) [`beaa035`](https://github.com/sasakiuri/oss/commit/beaa035d03e1590f065670d91adb5e9d223e8640) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Add optional Vitest and React Testing Library presets that catch skipped or focused tests, conditional assertions without explicit assertion counts, invalid assertions, and missing asynchronous waits.

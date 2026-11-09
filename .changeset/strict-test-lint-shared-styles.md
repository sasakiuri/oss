---
"@sasakiuri/eslint-config": major
"@sasakiuri/stylelint-config": patch
---

Enable the recommended Vitest and React Testing Library rules in the shared test presets. Existing consumers must fix newly reported test lint errors, including tests without assertions and debugging utilities, before adopting the new major version. Retain the documented exceptions for DOM structure, explicit cleanup, and asynchronous effects.

Recognize Tailwind CSS directives in the shared Stylelint rules and preserve the application mount selector's existing specificity.

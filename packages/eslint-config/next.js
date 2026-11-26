// SPDX-License-Identifier: MIT
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

// The base configuration owns the TypeScript plugin; Next.js can resolve
// another copy, which ESLint would reject as a redefinition.
function withoutTypeScriptPlugin(config) {
  if (!config.plugins?.["@typescript-eslint"]) return config;
  const { "@typescript-eslint": _typescript, ...plugins } = config.plugins;
  return { ...config, plugins };
}

export const coreWebVitals = nextVitals.map(withoutTypeScriptPlugin);

// eslint-config-next registers jsx-a11y but enables only a few of its rules.
const jsxA11y = nextVitals.find((config) => config.plugins?.["jsx-a11y"])
  .plugins["jsx-a11y"];

export const accessibility = {
  name: "@sasakiuri/next/accessibility",
  files: ["**/*.{jsx,tsx}"],
  rules: jsxA11y.flatConfigs.recommended.rules,
};

export default [
  ...coreWebVitals,
  ...nextTypeScript.map(withoutTypeScriptPlugin),
];

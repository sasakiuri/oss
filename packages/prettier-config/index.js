// SPDX-License-Identifier: MIT
const baseConfig = {
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  singleAttributePerLine: false,
  htmlWhitespaceSensitivity: "css",
  printWidth: 120,
  tabWidth: 2,
  endOfLine: "lf",
  overrides: [
    {
      files: "**/*.yml",
      options: {
        tabWidth: 2,
      },
    },
  ],
};

export default baseConfig;

export const tailwind = {
  ...baseConfig,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindFunctions: ["clsx", "cn"],
};

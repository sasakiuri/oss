// SPDX-License-Identifier: MIT
const config = {
  extends: ['@sasakiuri/stylelint-config'],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['theme', 'plugin', 'custom-variant', 'apply'] }],
    'scss/at-rule-no-unknown': [true, { ignoreAtRules: ['theme', 'plugin', 'custom-variant', 'apply'] }],
    'import-notation': 'string',
  },
};
export default config;

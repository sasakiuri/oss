// SPDX-License-Identifier: MIT
// Textlint's configuration loader evaluates JavaScript as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shared = require('../../.textlintrc.json');

module.exports = {
  plugins: {},
  filters: {},
  rules: {
    ...shared.rules,
    '@textlint-ja/no-insert-dropping-sa': true,
    '@textlint-ja/no-synonyms': true,
    'ja-hiragana-fukushi': true,
    'ja-hiragana-hojodoushi': true,
    'ja-no-inappropriate-words': true,
    'ja-no-orthographic-variants': true,
    'ja-no-redundant-expression': true,
    'ja-unnatural-alphabet': true,
    'jis-charset': true,
    'no-doubled-joshi': true,
    'no-mixed-zenkaku-and-hankaku-alphabet': true,
    'no-start-duplicated-conjunction': true,
    'no-surrogate-pair': true,
    'prefer-tari-tari': true,
    'preset-ja-spacing': {
      'ja-space-between-half-and-full-width': false,
    },
    'preset-ja-technical-writing': true,
    'preset-japanese': true,
    'use-si-units': true,
  },
};

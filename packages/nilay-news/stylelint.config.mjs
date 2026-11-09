// SPDX-License-Identifier: MIT
export default {
  extends: ["@sasakiuri/stylelint-config"],
  // The standalone DOM uses stable element IDs and :has() for reading layouts.
  rules: { "selector-max-specificity": "1,4,1" },
};

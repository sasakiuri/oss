#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

# Reject missing/empty plans rather than reporting a successful empty test run.
suites=$(jq -ce 'if type == "array" and length > 0 then .[] else error("Expected E2E suites") end' <<< "$CI_E2E_SUITES_JSON")
failed=()
while IFS= read -r suite; do
  # Native Windows jq emits CRLF. Strip its line-ending CR in Bash, independent
  # of jq version, while keeping the JSON content and jq failures intact.
  suite=${suite%$'\r'}
  package=$(jq -er '.package' <<< "$suite")
  package=${package%$'\r'}
  shard=$(jq -er '"\(.shard)/\(.shards)"' <<< "$suite")
  shard=${shard%$'\r'}
  CI_PACKAGES_JSON=$(jq -c '[.package]' <<< "$suite")
  CI_PACKAGES_JSON=${CI_PACKAGES_JSON%$'\r'}
  export CI_PACKAGES_JSON
  echo "::group::E2E $package ($shard)"
  if npm run ci:packages -- test:e2e --shard "$shard"; then
    echo "E2E passed: $package ($shard)"
  else
    failed+=("$package ($shard)")
  fi
  echo "::endgroup::"
done <<< "$suites"

if ((${#failed[@]})); then
  printf 'E2E failed: %s\n' "${failed[@]}" >&2
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    printf -- '- E2E failed: %s\n' "${failed[@]}" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi

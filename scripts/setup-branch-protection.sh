#!/usr/bin/env bash
# setup-branch-protection.sh
# Configure GitHub Branch Rulesets for sasakiuri/oss via gh CLI.
# Idempotent: updates existing rulesets or creates new ones.
#
# Usage:
#   ./scripts/setup-branch-protection.sh [--dry-run]

set -euo pipefail

OWNER_REPO="sasakiuri/oss"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight: verify gh authentication
# ---------------------------------------------------------------------------
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI is not authenticated. Run 'gh auth login' first."
  exit 1
fi
echo "gh authentication OK"

# ---------------------------------------------------------------------------
# Helper: create or update a ruleset
# ---------------------------------------------------------------------------
upsert_ruleset() {
  local name="$1"
  local payload="$2"

  # Check if ruleset already exists
  existing_id=$(
    gh api -H "Accept: application/vnd.github+json" \
      "/repos/${OWNER_REPO}/rulesets" 2>/dev/null \
    | jq -r --arg name "$name" '.[] | select(.name == $name) | .id // empty'
  ) || true

  if [[ "$DRY_RUN" == "true" ]]; then
    if [[ -n "$existing_id" ]]; then
      echo "[DRY-RUN] Would update ruleset '${name}' (id=${existing_id}) with payload:"
    else
      echo "[DRY-RUN] Would create ruleset '${name}' with payload:"
    fi
    echo "$payload" | jq .
    return 0
  fi

  if [[ -n "$existing_id" ]]; then
    echo "Updating ruleset '${name}' (id=${existing_id})..."
    echo "$payload" | gh api --method PUT \
      -H "Accept: application/vnd.github+json" \
      "/repos/${OWNER_REPO}/rulesets/${existing_id}" \
      --input -
    echo "Ruleset '${name}' updated."
  else
    echo "Creating ruleset '${name}'..."
    echo "$payload" | gh api --method POST \
      -H "Accept: application/vnd.github+json" \
      "/repos/${OWNER_REPO}/rulesets" \
      --input -
    echo "Ruleset '${name}' created."
  fi
}

# ===========================================================================
# 1. protect-1.x  (default / release branch)
# ===========================================================================
upsert_ruleset "protect-1.x" '{
  "name": "protect-1.x",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/1.x"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Lint & Checks" },
          { "context": "Build & Test (ubuntu-latest)" },
          { "context": "Build & Test (windows-latest)" },
          { "context": "Build & Test (macos-latest)" },
          { "context": "validate" },
          { "context": "dependency-review" },
          { "context": "Analyze (javascript-typescript)" },
          { "context": "gitleaks" }
        ]
      }
    }
  ],
  "bypass_actors": []
}'

# ===========================================================================
# 2. protect-canary  (next development branch)
# ===========================================================================
upsert_ruleset "protect-canary" '{
  "name": "protect-canary",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/canary"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Lint & Checks" },
          { "context": "Build & Test (ubuntu-latest)" },
          { "context": "Build & Test (windows-latest)" },
          { "context": "Build & Test (macos-latest)" }
        ]
      }
    }
  ],
  "bypass_actors": []
}'

# ===========================================================================
# 3. lock-main  (read-only archive branch)
# ===========================================================================
upsert_ruleset "lock-main" '{
  "name": "lock-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "update"
    }
  ],
  "bypass_actors": []
}'

echo ""
echo "All rulesets processed."

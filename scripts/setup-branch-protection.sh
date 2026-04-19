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
# Pre-flight: verify default branch is the expected one.
# The "1.x" ruleset targets ~DEFAULT_BRANCH, and legacy "protect-1.x" cleanup
# runs afterwards. Abort if default branch has already moved to a newer
# release so we do not silently relocate protection to an unintended branch.
# ---------------------------------------------------------------------------
EXPECTED_DEFAULT_BRANCH="1.x"
ACTUAL_DEFAULT_BRANCH=$(gh api -H "Accept: application/vnd.github+json" "/repos/${OWNER_REPO}" --jq '.default_branch')
if [[ "$ACTUAL_DEFAULT_BRANCH" != "$EXPECTED_DEFAULT_BRANCH" ]]; then
  echo "ERROR: default branch is '${ACTUAL_DEFAULT_BRANCH}', expected '${EXPECTED_DEFAULT_BRANCH}'." >&2
  echo "Update EXPECTED_DEFAULT_BRANCH and review the 1.x ruleset before rerunning." >&2
  exit 1
fi
echo "default branch check OK (${ACTUAL_DEFAULT_BRANCH})"

# ---------------------------------------------------------------------------
# Helper: delete a ruleset by name if it exists (used for renames)
# ---------------------------------------------------------------------------
delete_ruleset_if_exists() {
  local name="$1"

  local list_json
  if ! list_json=$(gh api -H "Accept: application/vnd.github+json" "/repos/${OWNER_REPO}/rulesets?includes_parents=false"); then
    echo "ERROR: failed to list rulesets while searching for '${name}'" >&2
    exit 1
  fi

  local existing_id
  existing_id=$(echo "$list_json" | jq -r --arg name "$name" '.[] | select(.name == $name) | .id // empty')

  if [[ -z "$existing_id" ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would delete legacy ruleset '${name}' (id=${existing_id})"
    return 0
  fi

  echo "Deleting legacy ruleset '${name}' (id=${existing_id})..."
  gh api --method DELETE \
    -H "Accept: application/vnd.github+json" \
    "/repos/${OWNER_REPO}/rulesets/${existing_id}"
  echo "Legacy ruleset '${name}' deleted."
}

# ---------------------------------------------------------------------------
# Helper: create or update a ruleset
# ---------------------------------------------------------------------------
upsert_ruleset() {
  local name="$1"
  local payload="$2"

  # Check if ruleset already exists. Abort on API failure so a transient
  # listing error never results in an accidental duplicate ruleset.
  local list_json
  if ! list_json=$(gh api -H "Accept: application/vnd.github+json" "/repos/${OWNER_REPO}/rulesets?includes_parents=false"); then
    echo "ERROR: failed to list rulesets while upserting '${name}'" >&2
    exit 1
  fi

  local existing_id
  existing_id=$(echo "$list_json" | jq -r --arg name "$name" '.[] | select(.name == $name) | .id // empty')

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
      "/repos/${OWNER_REPO}/rulesets?includes_parents=false" \
      --input -
    echo "Ruleset '${name}' created."
  fi
}

# ===========================================================================
# 1. 1.x  (default / release branch)
# ---------------------------------------------------------------------------
# Ruleset name matches the existing deployed ruleset so `upsert_ruleset` finds
# and updates it in place.
#
# require_code_owner_review is intentionally false here. Rationale:
#
# 1. The Dependabot auto-merge workflow approves via secrets.GITHUB_TOKEN
#    (actor: github-actions[bot]), which satisfies
#    required_approving_review_count but cannot act as a CODEOWNERS
#    reviewer. Enforcing code-owner review would permanently block
#    auto-merge for the safe dependency groups that are supposed to be
#    hands-off.
# 2. This repository currently has a single write-access user (@sasakiuri)
#    who is also the sole code owner (see .github/CODEOWNERS). With only
#    one eligible code owner, the practical difference between "any
#    approving review" and "code-owner approving review" is zero for
#    human PRs.
#
# If a second maintainer is ever granted write access, re-enable this and
# solve Dependabot approval via a GitHub App that is listed in CODEOWNERS.
#
# No bypass_actors: break-glass should be an explicit, auditable action taken
# via the GitHub UI rather than a permanent role-based bypass.
# ===========================================================================

upsert_ruleset "1.x" '{
  "name": "1.x",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "CI Required" },
          { "context": "validate" },
          { "context": "dependency-review" },
          { "context": "Analyze (javascript-typescript)" },
          { "context": "gitleaks" }
        ]
      }
    }
  ],
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ]
}'
# NOTE: actor_id 5 is the built-in Admin repository role. Granting it
# "always" bypass preserves break-glass merges for the sole maintainer
# (see require_code_owner_review rationale above). Remove this block the
# moment a second maintainer joins and a dedicated GitHub App handles bot
# approvals.

# Clean up the legacy ruleset name from an earlier revision of this script.
# Runs AFTER the replacement above is confirmed so the default branch is
# never left unprotected mid-run. Safe no-op when the legacy ruleset does
# not exist.
delete_ruleset_if_exists "protect-1.x"

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
          { "context": "CI Required" }
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

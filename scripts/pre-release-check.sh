#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# pre-release-check.sh — Comprehensive pre-release verification for OSS monorepo
#
# Usage:
#   scripts/pre-release-check.sh [OPTIONS]
#
# Options:
#   --fix              Run auto-fixable checks in fix mode
#   --skip-ci          Skip CI checks
#   --skip-security    Skip security checks
#   --skip-git         Skip git history checks
#   --skip-publishing  Skip package publishing checks
#   --skip-docs        Skip documentation checks
#   --skip-versions    Skip version/metadata checks
#   --ci               CI mode (no color, turbo --no-color)
#
# Exit codes:
#   0  All checks passed (warnings are acceptable)
#   1  One or more checks failed
#
# Note: Make this script executable with `chmod +x scripts/pre-release-check.sh`
# ============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
FIX_MODE=false
SKIP_CI=false
SKIP_SECURITY=false
SKIP_GIT=false
SKIP_PUBLISHING=false
SKIP_DOCS=false
SKIP_VERSIONS=false
CI_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix)             FIX_MODE=true ;;
    --skip-ci)         SKIP_CI=true ;;
    --skip-security)   SKIP_SECURITY=true ;;
    --skip-git)        SKIP_GIT=true ;;
    --skip-publishing) SKIP_PUBLISHING=true ;;
    --skip-docs)       SKIP_DOCS=true ;;
    --skip-versions)   SKIP_VERSIONS=true ;;
    --ci)              CI_MODE=true ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
if [[ "$CI_MODE" == true ]] || [[ "${NO_COLOR:-}" != "" ]]; then
  C_GREEN=""
  C_RED=""
  C_YELLOW=""
  C_BOLD=""
  C_RESET=""
else
  C_GREEN=$'\033[0;32m'
  C_RED=$'\033[0;31m'
  C_YELLOW=$'\033[0;33m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
fi

TURBO_COLOR_FLAG=""
if [[ "$CI_MODE" == true ]]; then
  TURBO_COLOR_FLAG="--no-color"
fi

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
declare -a RESULT_CATEGORIES=()
declare -a RESULT_NAMES=()
declare -a RESULT_STATUSES=()  # PASS | FAIL | WARN

TMPDIR_CHECK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CHECK"' EXIT

# Record a check result
# Usage: record_result "Category" "Check Name" "PASS|FAIL|WARN"
record_result() {
  RESULT_CATEGORIES+=("$1")
  RESULT_NAMES+=("$2")
  RESULT_STATUSES+=("$3")
}

# Run a check function, capture output, print only on non-PASS
# Usage: run_check "Category" "Check Name" check_function_name
run_check() {
  local category="$1"
  local name="$2"
  local func="$3"
  local outfile="$TMPDIR_CHECK/${func}.out"

  CHECK_STATUS="PASS"
  local func_rc=0
  "$func" > "$outfile" 2>&1 || func_rc=$?

  # If the function crashed without setting CHECK_STATUS, mark as FAIL
  if [[ $func_rc -ne 0 ]] && [[ "$CHECK_STATUS" == "PASS" ]]; then
    CHECK_STATUS="FAIL"
    echo "Check function exited with code $func_rc" >> "$outfile"
  fi

  local status="$CHECK_STATUS"
  record_result "$category" "$name" "$status"

  case "$status" in
    PASS) printf "  ${C_GREEN}PASS${C_RESET}  %s / %s\n" "$category" "$name" ;;
    FAIL) printf "  ${C_RED}FAIL${C_RESET}  %s / %s\n" "$category" "$name"
          sed 's/^/        /' "$outfile" ;;
    WARN) printf "  ${C_YELLOW}WARN${C_RESET}  %s / %s\n" "$category" "$name"
          sed 's/^/        /' "$outfile" ;;
  esac
}

# ============================================================================
# CHECK FUNCTIONS
# Each function prints diagnostic output to stdout/stderr (captured by run_check)
# and sets CHECK_STATUS to PASS, FAIL, or WARN.
# ============================================================================

# ---------------------------------------------------------------------------
# Category 1: CI Checks
# ---------------------------------------------------------------------------

check_typescript() {
  if ! npx turbo typecheck $TURBO_COLOR_FLAG 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_eslint() {
  if [[ "$FIX_MODE" == true ]]; then
    if ! npx turbo fix $TURBO_COLOR_FLAG 2>&1; then
      CHECK_STATUS="FAIL"
    fi
  else
    if ! npx turbo lint $TURBO_COLOR_FLAG 2>&1; then
      CHECK_STATUS="FAIL"
    fi
  fi
}

check_build() {
  if ! npx turbo build $TURBO_COLOR_FLAG 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_unit_tests() {
  if ! npx turbo test $TURBO_COLOR_FLAG 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_depcruise() {
  if ! npx turbo depcruise $TURBO_COLOR_FLAG 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_license() {
  if ! npm run license-check 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_cspell() {
  if ! npm run cspell 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_knip() {
  if ! npm run knip 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_bundle_size() {
  if ! npx turbo size-limit $TURBO_COLOR_FLAG 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_syncpack() {
  if ! npm run syncpack 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_osv_scanner() {
  if ! command -v osv-scanner &>/dev/null; then
    echo "osv-scanner binary not found — skipping"
    CHECK_STATUS="WARN"
    return
  fi
  if ! osv-scanner --recursive --config=osv-scanner.toml ./ 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

check_gitleaks() {
  if ! command -v gitleaks &>/dev/null; then
    echo "gitleaks binary not found — skipping"
    CHECK_STATUS="WARN"
    return
  fi
  if ! gitleaks detect --source . --no-banner 2>&1; then
    CHECK_STATUS="FAIL"
  fi
}

# ---------------------------------------------------------------------------
# Category 2: Security
# ---------------------------------------------------------------------------

check_hardcoded_secrets() {
  local pattern='(password|passwd|secret|token|api_key|apikey|api\.key|auth_token|access_key|private_key)\s*[:=]'
  local exclude_pattern='(\.d\.ts:|interface |type |z\.(string|object|enum)|schema|// |/\*|package-lock\.json|\.test\.|\.spec\.|Token<|token:|token,)'

  local hits
  hits=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' \
    "$pattern" . \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=coverage \
    --exclude-dir=.git --exclude-dir=release --exclude='package-lock.json' 2>/dev/null || true)

  if [[ -n "$hits" ]]; then
    hits=$(echo "$hits" | grep -Ev "$exclude_pattern" || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "Potential hardcoded secrets found:"
    echo "$hits"
    CHECK_STATUS="FAIL"
  fi
}

check_internal_urls() {
  local pattern='(/mnt/|/home/[a-z]|\\\\wsl|192\.168\.|10\.[0-9]+\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.)'

  local hits
  hits=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' \
    --include='*.md' --include='*.ps1' --include='*.sh' --include='*.yml' --include='*.yaml' \
    "$pattern" . \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.turbo \
    --exclude-dir=.git --exclude-dir=release --exclude='package-lock.json' \
    --exclude='pre-release-check.sh' 2>/dev/null || true)

  # Exclude documentation placeholders (e.g., <Distro>, <path-to-oss>)
  if [[ -n "$hits" ]]; then
    hits=$(echo "$hits" | grep -Ev '(<Distro>|<path|<your|<user|CLAUDE\.md)' || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "Internal URLs/paths found:"
    echo "$hits"
    CHECK_STATUS="FAIL"
  fi
}

check_personal_info() {
  local email_pattern='[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
  local exclude_pattern='(@users\.noreply\.github\.com|@example\.com|@test\.com|@t\.com|THIRD-PARTY-LICENSES|\.test\.ts:|\.spec\.ts:|tests/|pre-release-check\.sh)'

  local hits
  hits=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md' \
    "$email_pattern" . \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.turbo \
    --exclude-dir=.git --exclude-dir=release --exclude='package-lock.json' 2>/dev/null || true)

  if [[ -n "$hits" ]]; then
    hits=$(echo "$hits" | grep -Ev "$exclude_pattern" || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "Potential personal information (email addresses) found:"
    echo "$hits"
    CHECK_STATUS="FAIL"
  fi
}

check_japanese_text() {
  # Scans all of packages/saika-lane/src/ (main, renderer, preload, shared)
  # Excludes tests/ — test file i18n is a separate checklist item
  local hits
  hits=$(grep -rPn '[\p{Hiragana}\p{Katakana}\p{Han}]' \
    --include='*.ts' --include='*.tsx' --include='*.css' \
    packages/saika-lane/src/ \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=tests 2>/dev/null || true)

  if [[ -n "$hits" ]]; then
    local count
    count=$(echo "$hits" | wc -l)
    echo "Japanese text found in $count locations (i18n incomplete):"
    echo "$hits" | head -20
    if [[ "$count" -gt 20 ]]; then
      echo "  ... and $((count - 20)) more"
    fi
    CHECK_STATUS="FAIL"
  fi
}

check_npm_audit() {
  local audit_output
  audit_output=$(npm audit --omit=dev --json 2>&1 || true)

  local high_critical
  high_critical=$(node -e "
    try {
      const d = JSON.parse(process.argv[1]);
      const v = d.metadata && d.metadata.vulnerabilities ? d.metadata.vulnerabilities : {};
      const hc = (v.high || 0) + (v.critical || 0);
      const mod = v.moderate || 0;
      console.log(hc + ':' + mod);
    } catch {
      console.log('ERROR');
    }
  " "$audit_output" 2>/dev/null || echo "ERROR")

  if [[ "$high_critical" == "ERROR" ]]; then
    echo "npm audit failed or returned non-JSON output"
    echo "$audit_output" | head -10
    CHECK_STATUS="WARN"
  else
    local hc_count="${high_critical%%:*}"
    local mod_count="${high_critical##*:}"

    if [[ "$hc_count" -gt 0 ]]; then
      echo "npm audit found high/critical vulnerabilities (high+critical: $hc_count)"
      echo "$audit_output" | head -40
      CHECK_STATUS="FAIL"
    elif [[ "$mod_count" -gt 0 ]]; then
      echo "npm audit found moderate vulnerabilities (moderate: $mod_count)"
      CHECK_STATUS="WARN"
    fi
  fi
}

check_electron_security() {
  local main_file="packages/saika-lane/src/main/main.ts"
  if [[ ! -f "$main_file" ]]; then
    echo "Electron main file not found: $main_file"
    CHECK_STATUS="FAIL"
    return
  fi

  local failures=()

  # Check nodeIntegration: false
  if ! grep -q 'nodeIntegration:\s*false' "$main_file"; then
    if grep -q 'nodeIntegration:\s*true' "$main_file"; then
      failures+=("nodeIntegration is set to true (must be false)")
    else
      failures+=("nodeIntegration: false not found")
    fi
  fi

  # Check contextIsolation: true
  if ! grep -q 'contextIsolation:\s*true' "$main_file"; then
    if grep -q 'contextIsolation:\s*false' "$main_file"; then
      failures+=("contextIsolation is set to false (must be true)")
    else
      failures+=("contextIsolation: true not found")
    fi
  fi

  # Check sandbox: true
  if ! grep -q 'sandbox:\s*true' "$main_file"; then
    if grep -q 'sandbox:\s*false' "$main_file"; then
      failures+=("sandbox is set to false (must be true)")
    else
      failures+=("sandbox: true not found")
    fi
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    echo "Electron security settings issues in $main_file:"
    for f in "${failures[@]}"; do
      echo "  - $f"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_publish_workflow() {
  local workflow=".github/workflows/publish.yml"
  if [[ ! -f "$workflow" ]]; then
    return
  fi

  local has_inactive
  has_inactive=$(grep -i 'inactive\|disabled\|do not use' "$workflow" 2>/dev/null || true)
  local has_auto_trigger
  has_auto_trigger=$(grep -E '^\s+(push|schedule|release|pull_request):' "$workflow" 2>/dev/null || true)

  if [[ -n "$has_inactive" ]] && [[ -n "$has_auto_trigger" ]]; then
    echo "publish.yml is marked as inactive but has automatic triggers:"
    echo "$has_auto_trigger" | sed 's/^/  /'
    CHECK_STATUS="WARN"
  fi
}

check_mqtt_credential_leak() {
  local hits
  hits=$(grep -rEn 'mqtts?://[^@/]+@' \
    --include='*.ts' --include='*.tsx' --include='*.js' \
    packages/ \
    --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null || true)

  if [[ -n "$hits" ]]; then
    echo "MQTT URLs with embedded credentials found:"
    echo "$hits"
    CHECK_STATUS="FAIL"
    return
  fi

  # Check if MQTT connection code strips/validates userinfo from URLs
  local mqtt_service="packages/saika-lane/src/main/modules/mqtt/infra/MqttClientService.ts"
  if [[ -f "$mqtt_service" ]]; then
    if ! grep -qE '(sanitize|mask|strip|redact|userinfo|credential)' "$mqtt_service" 2>/dev/null; then
      echo "MqttClientService.ts does not appear to sanitize credentials from broker URLs"
      echo "URLs with userinfo (mqtt://user:pass@host) may leak to logs and UI"
      CHECK_STATUS="WARN"
    fi
  fi
}

check_actions_pinning() {
  local hits
  hits=$(grep -rEn 'uses:\s+[^#]*@v[0-9]' .github/workflows/ 2>/dev/null || true)

  if [[ -n "$hits" ]]; then
    local count
    count=$(echo "$hits" | wc -l)
    echo "GitHub Actions using floating version tags instead of SHA pins ($count):"
    echo "$hits" | head -20
    if [[ "$count" -gt 20 ]]; then
      echo "  ... and $((count - 20)) more"
    fi
    CHECK_STATUS="FAIL"
  fi
}

# ---------------------------------------------------------------------------
# Category 3: Git History
# ---------------------------------------------------------------------------

check_author_email() {
  local emails
  emails=$(git log --format='%ae' | sort -u)

  local bad_emails=()
  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    if [[ "$email" != *"@users.noreply.github.com" ]]; then
      bad_emails+=("$email")
    fi
  done <<< "$emails"

  if [[ ${#bad_emails[@]} -gt 0 ]]; then
    echo "Non-GitHub-noreply author emails found in git history:"
    for e in "${bad_emails[@]}"; do
      echo "  - $e"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_tracked_files() {
  local tracked
  tracked=$(git ls-files -- CLAUDE.md '**/CLAUDE.md' .claude/ claude/ .env '.env.local' '.env.*.local' 2>/dev/null || true)

  if [[ -n "$tracked" ]]; then
    echo "Files that should not be tracked in a public release:"
    echo "$tracked" | sed 's/^/  /'
    CHECK_STATUS="FAIL"
  fi
}

# ---------------------------------------------------------------------------
# Category 4: Package Publishing
# ---------------------------------------------------------------------------

check_publish_config() {
  local failures=()

  for pkg_json in packages/*/package.json; do
    local result
    result=$(node -e "
      const pkg = require('./' + process.argv[1]);
      if (pkg.private === true) {
        process.stdout.write('OK');
      } else {
        process.stdout.write('MISSING');
      }
    " "$pkg_json" 2>/dev/null || echo "ERROR")

    if [[ "$result" == "MISSING" ]]; then
      failures+=("$pkg_json: missing private: true")
    elif [[ "$result" == "ERROR" ]]; then
      failures+=("$pkg_json: failed to parse")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    echo "private:true issues:"
    for f in "${failures[@]}"; do
      echo "  - $f"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_private_true() {
  local failures=()

  for pkg_json in package.json packages/*/package.json; do
    if [[ ! -f "$pkg_json" ]]; then
      failures+=("$pkg_json: file not found")
      continue
    fi

    local is_private
    is_private=$(node -e "
      const pkg = require('./' + process.argv[1]);
      process.stdout.write(pkg.private === true ? 'YES' : 'NO');
    " "$pkg_json" 2>/dev/null || echo "ERROR")

    if [[ "$is_private" != "YES" ]]; then
      failures+=("$pkg_json: private is not true")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    echo "private:true issues:"
    for f in "${failures[@]}"; do
      echo "  - $f"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_npmrc_registry() {
  if [[ ! -f .npmrc ]]; then
    # No .npmrc — that's fine
    return
  fi

  local private_registries
  private_registries=$(grep -i 'registry' .npmrc 2>/dev/null | grep -v 'registry.npmjs.org' || true)

  if [[ -n "$private_registries" ]]; then
    echo "Private registries found in .npmrc:"
    echo "$private_registries" | sed 's/^/  /'
    CHECK_STATUS="FAIL"
  fi
}

check_changeset_access() {
  local config=".changeset/config.json"
  if [[ ! -f "$config" ]]; then
    echo ".changeset/config.json not found"
    CHECK_STATUS="WARN"
    return
  fi

  local access
  access=$(node -e "
    const c = require('./$config');
    process.stdout.write(c.access || '(not set)');
  " 2>/dev/null || echo "ERROR")

  if [[ "$access" == "ERROR" ]]; then
    echo "Failed to parse $config"
    CHECK_STATUS="WARN"
  elif [[ "$access" != "restricted" ]] && [[ "$access" != "public" ]]; then
    echo "Changeset access is '$access' — expected 'restricted' or 'public'"
    CHECK_STATUS="WARN"
  elif [[ "$access" == "restricted" ]]; then
    echo "Changeset access is 'restricted' — change to 'public' if npm publishing is intended"
    CHECK_STATUS="WARN"
  fi
}

check_license_consistency() {
  local result
  result=$(node -e "
    const fs = require('fs');
    const path = require('path');
    const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const rootLicense = rootPkg.license || '(not set)';
    const dirs = fs.readdirSync('packages', { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const mismatches = [];
    for (const dir of dirs) {
      const pkgPath = path.join('packages', dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const license = pkg.license || '(not set)';
      if (license !== rootLicense) {
        mismatches.push(dir + ': ' + license + ' (root: ' + rootLicense + ')');
      }
    }
    if (mismatches.length > 0) {
      console.log('FAIL');
      mismatches.forEach(m => console.log(m));
    } else {
      console.log('OK');
    }
  " 2>/dev/null)

  if [[ "$(echo "$result" | head -1)" == "FAIL" ]]; then
    echo "License inconsistencies found:"
    echo "$result" | tail -n +2 | sed 's/^/  /'
    CHECK_STATUS="FAIL"
  fi
}

check_package_licenses() {
  local missing=()

  for pkg_dir in packages/*/; do
    if [[ ! -f "${pkg_dir}LICENSE" ]]; then
      missing+=("$(basename "$pkg_dir")")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Packages missing LICENSE file:"
    for p in "${missing[@]}"; do
      echo "  - packages/$p/"
    done
    CHECK_STATUS="FAIL"
  fi
}

# ---------------------------------------------------------------------------
# Category 5: Documentation
# ---------------------------------------------------------------------------

check_required_root_files() {
  local required_files=(LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md)
  local missing=()

  for f in "${required_files[@]}"; do
    if [[ ! -f "$f" ]]; then
      missing+=("$f")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing required root files:"
    for f in "${missing[@]}"; do
      echo "  - $f"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_package_readmes() {
  local missing=()

  for pkg_dir in packages/*/; do
    local pkg_name
    pkg_name=$(basename "$pkg_dir")
    if [[ ! -f "${pkg_dir}README.md" ]]; then
      missing+=("$pkg_name")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Packages missing README.md:"
    for p in "${missing[@]}"; do
      echo "  - packages/$p/"
    done
    CHECK_STATUS="FAIL"
  fi
}

check_coc_contact() {
  if [[ ! -f CODE_OF_CONDUCT.md ]]; then
    echo "CODE_OF_CONDUCT.md not found"
    CHECK_STATUS="WARN"
    return
  fi

  local noreply_hits
  noreply_hits=$(grep -i 'noreply' CODE_OF_CONDUCT.md 2>/dev/null || true)

  if [[ -n "$noreply_hits" ]]; then
    echo "CODE_OF_CONDUCT.md uses a noreply email address:"
    echo "$noreply_hits" | sed 's/^/  /'
    echo "This may not function as a real contact channel for incident reporting"
    CHECK_STATUS="WARN"
  fi
}

# ---------------------------------------------------------------------------
# Category 6: Version / Metadata
# ---------------------------------------------------------------------------

check_shared_config_versions() {
  local result
  result=$(node -e "
    const fs = require('fs');
    const path = require('path');
    const configs = ['eslint-config', 'prettier-config', 'stylelint-config', 'typescript-config'];
    const versions = {};
    for (const c of configs) {
      const pkgPath = path.join('packages', c, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        versions[c] = '(not found)';
        continue;
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      versions[c] = pkg.version || '(not set)';
    }
    const vals = Object.values(versions);
    const unique = [...new Set(vals)];
    if (unique.length > 1) {
      console.log('FAIL');
      for (const [k, v] of Object.entries(versions)) {
        console.log(k + ': ' + v);
      }
    } else {
      console.log('OK');
    }
  " 2>/dev/null)

  if [[ "$(echo "$result" | head -1)" == "FAIL" ]]; then
    echo "Shared config versions are inconsistent:"
    echo "$result" | tail -n +2 | sed 's/^/  /'
    CHECK_STATUS="FAIL"
  fi
}

check_security_md_versions() {
  if [[ ! -f SECURITY.md ]]; then
    echo "SECURITY.md not found"
    CHECK_STATUS="WARN"
    return
  fi

  local saika_version
  saika_version=$(node -e "
    const pkg = require('./packages/saika-lane/package.json');
    process.stdout.write(pkg.version || '');
  " 2>/dev/null || true)

  if [[ -z "$saika_version" ]]; then
    echo "Could not read saika-lane version"
    CHECK_STATUS="WARN"
    return
  fi

  # Extract major.minor from saika-lane version (e.g., "0.1.0" -> "0.1")
  local major_minor="${saika_version%.*}"

  # Look for version patterns in SECURITY.md (e.g., "0.1.x", "1.0.0", "v1.0.0")
  local security_versions
  security_versions=$(grep -oE 'v?[0-9]+\.[0-9]+\.(x|[0-9]+)' SECURITY.md 2>/dev/null | sort -u || true)

  if [[ -z "$security_versions" ]]; then
    echo "No version patterns found in SECURITY.md"
    CHECK_STATUS="WARN"
    return
  fi

  # Check if saika-lane version (exact or wildcard) appears in SECURITY.md
  if ! echo "$security_versions" | grep -qE "^v?${major_minor}\.(x|[0-9]+)$"; then
    echo "saika-lane version ($saika_version) not found in SECURITY.md"
    echo "Versions in SECURITY.md: $(echo "$security_versions" | tr '\n' ' ')"
    CHECK_STATUS="WARN"
  fi
}

check_author_consistency() {
  local result
  result=$(node -e "
    const fs = require('fs');
    const path = require('path');
    const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const rootAuthor = typeof rootPkg.author === 'string' ? rootPkg.author : (rootPkg.author && rootPkg.author.name) || '(not set)';
    const dirs = fs.readdirSync('packages', { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const mismatches = [];
    for (const dir of dirs) {
      const pkgPath = path.join('packages', dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const author = typeof pkg.author === 'string' ? pkg.author : (pkg.author && pkg.author.name) || '(not set)';
      if (author !== rootAuthor) {
        mismatches.push(dir + ': ' + author + ' (root: ' + rootAuthor + ')');
      }
    }
    if (rootAuthor === '(not set)') {
      console.log('MISSING');
    } else if (mismatches.length > 0) {
      console.log('FAIL');
      mismatches.forEach(m => console.log(m));
    } else {
      console.log('OK');
    }
  " 2>/dev/null)

  local first_line
  first_line=$(echo "$result" | head -1)

  if [[ "$first_line" == "MISSING" ]]; then
    echo "Root package.json has no author field set"
    CHECK_STATUS="WARN"
  elif [[ "$first_line" == "FAIL" ]]; then
    echo "Author field inconsistencies:"
    echo "$result" | tail -n +2 | sed 's/^/  /'
    CHECK_STATUS="WARN"
  fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

echo ""
echo "${C_BOLD}Pre-release checks starting...${C_RESET}"
echo ""

# --- Category 1: CI ---
if [[ "$SKIP_CI" == false ]]; then
  echo "${C_BOLD}[CI]${C_RESET}"
  run_check "CI" "TypeScript"            check_typescript
  run_check "CI" "ESLint"                check_eslint
  run_check "CI" "Build"                 check_build
  run_check "CI" "Unit tests"            check_unit_tests
  run_check "CI" "Architecture"          check_depcruise
  run_check "CI" "License check"         check_license
  run_check "CI" "Spell check"           check_cspell
  run_check "CI" "Unused exports"        check_knip
  run_check "CI" "Bundle size"           check_bundle_size
  run_check "CI" "Syncpack"              check_syncpack
  echo ""
fi

# --- Category 2: Security ---
if [[ "$SKIP_SECURITY" == false ]]; then
  echo "${C_BOLD}[Security]${C_RESET}"
  run_check "Security" "OSV Scanner"           check_osv_scanner
  run_check "Security" "Gitleaks"              check_gitleaks
  run_check "Security" "Hardcoded secrets"     check_hardcoded_secrets
  run_check "Security" "Internal URLs/paths"   check_internal_urls
  run_check "Security" "Personal info leak"    check_personal_info
  run_check "Security" "npm audit"             check_npm_audit
  run_check "Security" "Electron security"     check_electron_security
  run_check "Security" "Actions SHA pinning"   check_actions_pinning
  run_check "Security" "MQTT credential leak" check_mqtt_credential_leak
  echo ""
fi

# --- Category 3: Git History ---
if [[ "$SKIP_GIT" == false ]]; then
  echo "${C_BOLD}[Git History]${C_RESET}"
  run_check "Git" "Author email"    check_author_email
  run_check "Git" "Tracked files"   check_tracked_files
  echo ""
fi

# --- Category 4: Package Publishing ---
if [[ "$SKIP_PUBLISHING" == false ]]; then
  echo "${C_BOLD}[Publishing]${C_RESET}"
  run_check "Publishing" "publishConfig"         check_publish_config
  run_check "Publishing" "private:true"           check_private_true
  run_check "Publishing" ".npmrc registry"        check_npmrc_registry
  run_check "Publishing" "Changeset access"       check_changeset_access
  run_check "Publishing" "License consistency"    check_license_consistency
  run_check "Publishing" "Package LICENSE files"  check_package_licenses
  run_check "Publishing" "Publish workflow"     check_publish_workflow
  echo ""
fi

# --- Category 5: Documentation ---
if [[ "$SKIP_DOCS" == false ]]; then
  echo "${C_BOLD}[Documentation]${C_RESET}"
  run_check "Docs" "Required root files"   check_required_root_files
  run_check "Docs" "Package READMEs"       check_package_readmes
  run_check "Docs" "Japanese text (i18n)"  check_japanese_text
  run_check "Docs" "CoC contact address"   check_coc_contact
  echo ""
fi

# --- Category 6: Version / Metadata ---
if [[ "$SKIP_VERSIONS" == false ]]; then
  echo "${C_BOLD}[Versions]${C_RESET}"
  run_check "Versions" "Shared config versions"   check_shared_config_versions
  run_check "Versions" "SECURITY.md versions"      check_security_md_versions
  run_check "Versions" "Author consistency"        check_author_consistency
  echo ""
fi

# ============================================================================
# SUMMARY TABLE
# ============================================================================

total=${#RESULT_STATUSES[@]}
passed=0
failed=0
warned=0

for s in "${RESULT_STATUSES[@]}"; do
  case "$s" in
    PASS) passed=$((passed + 1)) ;;
    FAIL) failed=$((failed + 1)) ;;
    WARN) warned=$((warned + 1)) ;;
  esac
done

# Find the max width for category and name columns
max_cat=8
max_name=5
for i in "${!RESULT_CATEGORIES[@]}"; do
  len=${#RESULT_CATEGORIES[$i]}
  [[ $len -gt $max_cat ]] && max_cat=$len
  len=${#RESULT_NAMES[$i]}
  [[ $len -gt $max_name ]] && max_name=$len
done

# Table width: 2 (indent) + max_cat + 2 (gap) + max_name + 2 (gap) + 6 (status) = total
table_width=$(( 2 + max_cat + 2 + max_name + 2 + 6 ))
[[ $table_width -lt 64 ]] && table_width=64

print_double_line() {
  printf '%0.s═' $(seq 1 "$table_width")
  echo ""
}

print_single_line() {
  printf '%0.s─' $(seq 1 "$table_width")
  echo ""
}

echo ""
print_double_line
printf "  ${C_BOLD}PRE-RELEASE CHECK SUMMARY${C_RESET}\n"
print_double_line
printf "  %-${max_cat}s  %-${max_name}s  %s\n" "Category" "Check" "Status"
print_single_line

for i in "${!RESULT_CATEGORIES[@]}"; do
  local_status="${RESULT_STATUSES[$i]}"
  case "$local_status" in
    PASS) color="$C_GREEN" ;;
    FAIL) color="$C_RED" ;;
    WARN) color="$C_YELLOW" ;;
    *)    color="" ;;
  esac
  printf "  %-${max_cat}s  %-${max_name}s  ${color}%s${C_RESET}\n" \
    "${RESULT_CATEGORIES[$i]}" "${RESULT_NAMES[$i]}" "$local_status"
done

print_single_line
printf "  Total: %d checks | ${C_GREEN}%d passed${C_RESET} | ${C_RED}%d failed${C_RESET} | ${C_YELLOW}%d warning${C_RESET}\n" \
  "$total" "$passed" "$failed" "$warned"
print_double_line
echo ""

if [[ "$failed" -gt 0 ]]; then
  echo "${C_RED}${C_BOLD}Pre-release checks FAILED.${C_RESET} Fix the issues above before releasing."
  exit 1
else
  echo "${C_GREEN}${C_BOLD}Pre-release checks PASSED.${C_RESET}"
  exit 0
fi

# Settings concurrency and authentication regressions

## Settings writes

`GET /api/state` includes an opaque `settings.revision` paired with its settings
snapshot. Submit that revision with only the fields intentionally changed:

```json
{
  "revision": "the revision from the displayed settings",
  "pollMinutes": 30
}
```

`POST /api/settings` rejects a missing, invalid, or stale revision with HTTP 409
and `code: "settings_conflict"`. Older clients must reload before saving. Do not
retry the same edits automatically with a new revision: first review the latest
settings and make an explicit decision about the intended changes. Re-enabling
automatic posting still verifies the Buffer account and checks unresolved posts
and scheduling constraints.

The UI keeps each form's original snapshot while status polling continues. A
conflict preserves unsaved inputs and offers an explicit reload action that
discards them. It never silently updates a form's revision or resubmits it. An
unchanged toggle or rubric is not sent with an unrelated edit.

A settings-specific token is stored separately from the portable settings data.
Settings changes, automatic safety stops, successful revision-checked writes,
and snapshot imports invalidate old tokens. Ordinary ingestion, review, source
status, and job updates do not. The token is checked again on every internal
transaction retry, and both the token and the write use the existing atomic
mutation fence. Legacy databases initialize their token once; the portable
snapshot format and settings fields are unchanged. Trusted internal scheduler
calls can still update settings without a browser token.

## Access key refresh

Requests with a cold or expired signing-key cache share one bounded JWKS fetch.
Each request then looks up its own key ID and verifies its own signature and
claims. A valid cached key remains usable during an unrelated refresh. Failed
or malformed refreshes do not make expired keys usable, and the existing
one-minute refresh throttle is retained. Token times and the selected key's
original expiry are checked again after asynchronous signature verification.
No authentication bypass or new credential setting is added.

## Repeatable checks

Run commands from the repository root with the pinned Node.js and npm versions:

```sh
npm run test -w @sasakiuri/nilay-news
npm run typecheck -w @sasakiuri/nilay-news
npm run lint -w @sasakiuri/nilay-news
npm run build -w @sasakiuri/nilay-news
npm run test:install -w @sasakiuri/nilay-news
npm run test:e2e -w @sasakiuri/nilay-news
```

The browser suite uses desktop and narrow Chromium viewports. It runs the real
Worker and D1 adapter in Miniflare with a fresh database for each test. Its
loopback-only test proxy signs fixture Access tokens and serves test signing
keys; production Access verification remains enabled. Buffer, Jev, and feed
responses are mocked by test-only modules. Unexpected outbound requests are
rejected. No production credentials, paid API calls, deployments, or real posts
are needed. Do not expose this test server outside the local test environment.

For local diagnostics only, `NILAY_BROWSER_EXECUTABLE` selects an already
installed Chromium executable when `CI` is unset. CI uses the repository-locked
Playwright browser. `NILAY_BROWSER_PORT` overrides the default loopback port 4179. Failure traces and screenshots are written to `test-results/`; the HTML
report is written to `playwright-report/`. These are generated artifacts, not
source code.

The two-tab regressions cover manual and automatic posting stops, changed-field
payloads, rubric conflicts, preserved edits, and an explicit reload before
re-enabling posting. Repository tests additionally force interleaved commits and
internal retries, including unrelated ingestion and no-op writes. Access tests
exercise mixed key IDs and signatures, shared failures, throttling, and expiry
while awaiting keys or signature verification.

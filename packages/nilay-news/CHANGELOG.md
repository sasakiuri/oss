# @sasakiuri/nilay-news

## 0.2.0

### Minor Changes

- [#137](https://github.com/sasakiuri/oss/pull/137) [`738f16c`](https://github.com/sasakiuri/oss/commit/738f16c91d37fb74615f97e69c241b7b7fcbe2c1) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Add Nilay News on Cloudflare Workers with D1 storage and Access authentication. Collect news for manual review or Jev classification, post selected articles to X through Buffer, and send operational alerts to Slack.

### Patch Changes

- [#170](https://github.com/sasakiuri/oss/pull/170) [`65bf924`](https://github.com/sasakiuri/oss/commit/65bf924c67ed7f67be63834efa42a139b735c00b) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Resolve Google News RSS intermediary links to validated publisher URLs before
  article ingestion. Cache successful resolutions, bound decoding requests, warn
  when an item cannot be resolved, and prevent unresolved Google links from being
  published. Existing publication history is not rewritten.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`0bfc9a9`](https://github.com/sasakiuri/oss/commit/0bfc9a93dcb265c600c6e50021e25b110ac8212e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Continue accepted Buffer posts through bounded durable read-only checks and expose sanitized API and channel quota observations.

- [#150](https://github.com/sasakiuri/oss/pull/150) [`8ca353e`](https://github.com/sasakiuri/oss/commit/8ca353e99e94a10b6ea2afda519d3f4a0f9f2925) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Remove abort listeners when HTTP operations settle so streamed body reads retain a bounded number of listeners. Preserve byte limits, redirect validation, deadlines, and non-blocking cancellation.

- [#186](https://github.com/sasakiuri/oss/pull/186) [`f4eece2`](https://github.com/sasakiuri/oss/commit/f4eece2397b807939f63b70ffc6171a0fbbdd799) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Filter articles by classification and duplicate judgment, and apply saving,
  dismissal, restoration, or manual publication approval to selected results.
  Record manual approval separately from Jev judgments and honor it during posting,
  while retaining freshness, sending-window, existing-post, and concurrency checks.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`f9406c5`](https://github.com/sasakiuri/oss/commit/f9406c5d84b2ced768d916cfa1e562e567d8c538) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Reject stale settings saves with a settings-specific revision, preserve conflicting form edits, and send only intentionally changed fields. Share in-flight Access signing-key refreshes without weakening authentication, expiry, or refresh throttling. Add isolated Worker/D1 browser regressions for concurrent settings edits and posting safety stops.

- [#177](https://github.com/sasakiuri/oss/pull/177) [`dc838ce`](https://github.com/sasakiuri/oss/commit/dc838ce7c5185eece0bb968b69a211a17026d3be) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Resolve stored Google News intermediary links when previewing and preparing new
  posts, and publish their validated destination URLs without requiring article
  recollection. Preserve article IDs, review decisions, and existing post history;
  prevent duplicate publication of known publisher-URL aliases, and keep temporary
  decoding waits retryable under the existing request limits.

- [#186](https://github.com/sasakiuri/oss/pull/186) [`7360946`](https://github.com/sasakiuri/oss/commit/7360946fbecaa57dcdf00629fd1a157ff270b46e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Allow individual and bulk dismissal of articles that failed before a post draft
  was prepared, clearing the failed record atomically. Provide an error-clearing
  action for retrying those articles, including existing Google News URL failures,
  while keeping automatic posting disabled until explicitly restarted and
  preserving reconciliation for submitted or uncertain posts.

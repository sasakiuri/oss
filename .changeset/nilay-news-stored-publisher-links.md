---
"@sasakiuri/nilay-news": patch
---

Resolve stored Google News intermediary links when previewing and preparing new
posts, and publish their validated destination URLs without requiring article
recollection. Preserve article IDs, review decisions, and existing post history;
prevent duplicate publication of known publisher-URL aliases, and keep temporary
decoding waits retryable under the existing request limits.

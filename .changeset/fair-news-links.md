---
"@sasakiuri/nilay-news": patch
---

Resolve Google News RSS intermediary links to validated publisher URLs before
article ingestion. Cache successful resolutions, bound decoding requests, warn
when an item cannot be resolved, and prevent unresolved Google links from being
published. Existing publication history is not rewritten.

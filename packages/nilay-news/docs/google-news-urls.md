# Google News publisher URLs

Google RSS entry links are intermediary URLs, not publisher article URLs.
After collection and freshness filtering, and before article identity is chosen
by ingestion, Nilay News resolves those links to validated public HTTP(S)
publisher URLs. Ordinary feed links are unchanged. The original Google link is
kept as `metadata.googleNewsUrl` for attribution, not as evidence of a retrieved
article body. Items resolving to the same URL are deduplicated.

Legacy IDs with an embedded URL are decoded locally using their variable-length
field. Current opaque IDs require a metadata-page GET and a single-article
Google decoding RPC. This is an undocumented protocol, not a supported Google
API. Format changes, challenges, consent pages, and rate limits can prevent
resolution. No publisher page is fetched and no publisher homepage is substituted.

## Request policy

The existing four-hour Google RSS collection interval and thirty-minute RSS
host interval are unchanged. Resolving article links is a separate, narrowly
scoped exception requested for this feature: only the Google RSS article page
with fixed Japanese locale parameters and the single decoding RPC are allowed.
The existing search-feed robots exception does **not** cover these additional
requests; this policy does not imply permission from Google. No arbitrary Google
URL, caller-supplied RPC, cookie, authorization header, or redirect is forwarded.

Resolution is sequential, with a durable lease and at least three seconds
between requests. Each collection or publication tick may issue at most forty
decoding requests and starts no further request after ninety seconds. Publication
also retains its existing 45-second soft limit for starting another post.
Individual requests time out after eight seconds; page and RPC responses are
limited to 1 MB and 100 kB. Successful mappings are cached for seven days.
Failed IDs wait one hour before retry; HTTP 401/403 pauses decoding for a day,
HTTP 429 for at least an hour, and network/5xx errors for at least fifteen
minutes. `Retry-After` can extend these waits. A feed-host cooldown also stops
decoding requests. Waiting for a lease, request budget, or cooldown does not
renew the failed-ID cache. Cached mappings and local legacy decoding need no
new request. Collection timers and requests observe its cancellation signal.

Collection failures produce a visible warning and exclude the unresolved item,
not the other successfully resolved items. A subsequent collection can retry
while the article still qualifies for the normal freshness window. The request
budget can therefore limit coverage; the warning must not be treated as success
for every feed entry.

## Existing data and publication

Stored Google links do not require recollection or dismissal to become posts.
The publication preflight resolves the first candidate and previews the exact
publisher-URL draft without changing articles, reviews, settings, or post
records. This check may update the bounded resolution cache, host lease, and
rate records. A final revision check rejects business-state changes during the
lookup. Ordinary inbox reads never decode every saved link.

Automatic publication resolves only its selected article before reserving a
new post. The URL repair and draft reservation use the same optimistic mutation
fence: concurrent settings, reviews, or claims are re-read before committing.
The stored article ID and manual/analysis decisions are preserved, and the
original link is retained as attribution. An article without a source key adopts publisher
URL identity only if no other article owns it; existing aliases are not merged
or deleted. New posts use the destination URL in both the draft and the exact
Buffer payload. An unresolved Google link is never used as a fallback.

A publisher URL without source keys with another known post record or an article marked
posted is excluded from new automatic publication. This also covers a repaired
legacy ID and a separately recollected publisher ID. The final send check
rechecks known URL aliases, eligibility, claim ownership, and exact text.
Explicit source-key notices on a shared page remain distinct.

A temporary decoding wait leaves automatic posting enabled and creates no
failed post; a later tick retries under the same limits. An actual decoding
failure retains the existing fail-closed publication behavior: no send, a
visible failed record, and automatic posting disabled. A failure before a draft
is prepared can be dismissed directly, individually or in bulk. Dismissal clears
the failed record in the same transaction. Alternatively, use 投稿エラーを解除
to keep the article for another attempt, then check the connection and candidate
in settings before enabling publication again. Clearing the error rechecks that
the record still proves a failure before sending; it cannot clear an uncertain
or submitted post. Neither dismissal nor clearing an error enables posting.

Already submitted, unknown, failed, or published post records are not rewritten
or automatically retried. In particular, posts already sent to Buffer or X keep
their exact text and confirmation history. When the previous release has already
created a failed draft record with empty text and no remote posting identifiers,
the same dismissal and error-clearing controls are available without checking
Buffer or X. Records with prepared text or remote identifiers still require
posting-result reconciliation. Explicitly enabling publication again allows URL
resolution on the next attempt without deleting or recollecting the article.
Old historical Google links whose destination has never been resolved are not
silently rewritten; check their posting history before approving a newly
collected duplicate. Existing automation settings are never enabled by this fix.

## Deployment and validation

Deploy the feed Worker before the main Worker, as in the normal deployment
workflow. No D1 migration, dependency, secret, or new service binding is required.
Mappings and throttling use the existing expiring records and host leases.

Deterministic tests cover both URL formats, unsafe destinations, malformed RPC
responses, cancellation, durable caches and rate limits, bounded regional
transport, collection ingestion, preflight, stored-link publication, aliases,
concurrent updates, time boundaries, and preserved publication history. These
tests do not assert availability of Google's undocumented service from a
production region.

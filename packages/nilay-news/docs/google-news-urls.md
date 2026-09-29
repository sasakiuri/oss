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
between requests. Each collection may issue at most forty decoding requests and
starts no further request after ninety seconds. Individual requests time out
after eight seconds; page and RPC responses are limited to 1 MB and 100 kB.
Successful mappings are cached for seven days. Failed IDs wait one hour before
retry; HTTP 401/403 pauses decoding for a day, HTTP 429 for at least an hour,
and network/5xx errors for at least fifteen minutes. `Retry-After` can extend
these waits. A feed-host cooldown also stops decoding requests. Cached mappings
and local legacy decoding need no new request. All timers and requests observe
the collection cancellation signal.

Failures produce a visible collection warning and exclude the unresolved item,
not the other successfully resolved items. A subsequent collection can retry
while the article still qualifies for the normal freshness window. The request
budget can therefore limit coverage; the warning must not be treated as success
for every feed entry.

## Existing data and deployment

Deploy the feed Worker before the main Worker, as in the normal deployment
workflow. No D1 migration, dependency, secret, or new service binding is required.
Mappings and throttling use the existing expiring records and host leases.

Existing article identities, reviews, and submitted/published posts are not
rewritten. In particular, this change does not edit posts already sent to Buffer
or X. A previously stored Google intermediary URL can no longer generate a new
publication draft; resolve or dismiss such old entries before automatic posting.
A blocked draft can pause the existing posting queue until it is reviewed.
Fresh articles collected again use publisher-URL identity; check already-posted
legacy entries before approving a newly collected duplicate. This intentionally
avoids silently merging or rewriting publication history.

## Validation

Deterministic tests cover both URL formats, unsafe destinations, malformed RPC
responses, cancellation, durable caches and rate limits, bounded regional
transport, collection ingestion, and the publication guard. These tests do not
assert availability of Google's undocumented service from a production region.

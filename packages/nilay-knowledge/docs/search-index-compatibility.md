# Search index compatibility

## Format is not content age

The existing `/search-index.json` and `/pdf-search-index.json` routes remain
**v1 compatibility endpoints**. Their response body is still the validated JSON
array consumed by already-open pages. The initial rollout adds response headers,
not a new envelope or renamed required fields:

- `X-Nilay-Search-Format: 1` declares the decoder contract.
- `X-Nilay-Search-Revision` is the hexadecimal SHA-256 digest of that endpoint's
  exact UTF-8 JSON body. It identifies content, not an editorial review date,
  publication date, deployment identifier or evidence of correctness.

The shared response helper validates documents and duplicate destinations before
publishing them. No clock or environment variable contributes to the revision.
The same document array produces the same body and revision on a rebuild. A
content change can change the revision without changing the format.

## Compatibility and retention

A v1 document retains its existing required fields, field types, destination
rules, and `articles`, `news` or `pdf` discriminator. Unknown additive fields are
accepted by the existing array validator. Adding optional fields is compatible;
changing a required field, adding an incompatible discriminator/destination, or
replacing the array with an object is not.

These two endpoints must not be repurposed for an incompatible v2 payload. A
future incompatible writer must use separately versioned endpoints and retain
working v1 compatibility output for old readers. Retain v1 for at least twelve
months after a v2 client is first released, and remove it only through an explicit
reviewed migration decision; no removal is scheduled by this change. Do not infer
that every reader has refreshed simply because a new deployment succeeded.

Old readers ignore the new headers and still decode the array. New readers accept
missing format metadata as the existing v1 response, including a rollback or
stale response from before this rollout. Compatible additive updates remain
usable. Missing metadata does not disable schema or destination validation.

An explicitly unsupported format is a distinct compatibility error. The worker
aborts its unread body and keeps the other target's healthy cache. The dialog
offers one explicit **page refresh** action rather than suggesting that endless
network retries can upgrade the decoder. The action preserves the latest input
and target, even if their shallow URL update has not yet flushed, and retains the
current pathname, unrelated query parameters and fragment. There is no automatic
refresh or retry loop. A persistently misconfigured server still displays the
error after a reader manually refreshes; it cannot be repaired client-side.

HTTP/network failures, malformed JSON and invalid v1 data remain retryable index
errors under the separate [search recovery policy](search-recovery.md). The
format header is a compatibility declaration, not a trust or integrity boundary.

## Freshness and independent loading

A successful index is retained for that worker's lifetime. PDF loading is still
lazy, and an empty PDF query does not download it. An article index loaded before
a compatible content update can coexist with a PDF index loaded afterward. The
two targets are independent catalogs, not an atomic cross-index snapshot; no
cross-target join or revision-equality assumption is made. Content revision
changes alone are not rejected. An explicit page refresh starts a new worker and
allows both catalogs to be loaded afresh when requested.

This strategy does not rely on platform deployment pinning. Custom worker fetches
are ordinary same-origin requests, and no deployment query parameter is claimed
to provide version routing on every host. A future pinning integration must state
its host requirements, retained-deployment window and expired-deployment fallback
separately. Hosting-level cache and noindex rules remain in place.

## Regression coverage

Controlled fixtures cover legacy arrays, additive fields, deterministic revisions,
new-reader/old-writer rollback responses, unsupported format headers, unchanged
schema validation, independently loaded revisions, target-isolated errors, and an
explicit browser refresh retaining query/target state. Tests do not perturb
production deployments or classify real documents as current or superseded.

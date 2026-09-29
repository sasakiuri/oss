# Search recovery boundaries

Article/news and PDF indexes have independent cached promises in one worker.
Opening article/news search preloads its index as before. Opening PDF search does
not preload or wait for the article index. An empty PDF query downloads neither
PDF data nor article data merely to initialize the dialog.

Network errors, HTTP failures, invalid JSON, schema failures and wrong-collection
data are recoverable index errors. Comlink transfers their `SearchIndexError`
name; the UI must not rely on the original subclass prototype crossing the worker
boundary. These errors discard only the failed index promise. The dialog retains
the worker, lets readers switch targets, and retries the failed target without
reloading the healthy index. A retry restores focus to the query input.

## Deadline and cancellation

Each index download has one 15-second deadline covering response headers and JSON
body consumption. Expiry aborts the fetch and rejects the shared attempt even if
a test transport ignores abort. Late responses cannot populate the index cache.
Timers are cleared after settlement. Concurrent requests for one index share one
attempt; the other index has its own deadline and can load independently.

Changing the query or target does not abort a shared download: another request
may need it, and successful data is reusable. Instead, the dialog invalidates old
search and pagination callbacks, including when the raw input changes before its
deferred value. Old initialization completions cannot replace the active target's
state. Failed downloads are retried only by a subsequent request or an explicit
retry, never by an automatic retry loop.

Worker construction, worker error/message-error events and unexpected RPC errors
remain fatal to that client. It is disposed and pending calls reject through the
existing worker-client lifetime boundary. Unmounting also disposes the worker.
Closing and reopening the dialog retains a healthy worker and shares any pending
initialization. This policy does not impose a timeout on synchronous search
ranking or claim that every kind of worker startup failure is a network timeout.

Regression coverage includes independent target failures, stalled headers and
bodies, shared attempts, late responses, target changes, explicit retry and focus,
as well as the existing pagination, keyboard, IME and worker lifetime suites.

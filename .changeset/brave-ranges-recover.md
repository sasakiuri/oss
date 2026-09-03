---
"@sasakiuri/saika-lane": minor
---

Add a durable Qualification timed-target recovery runner for official ISSF 8.8.1 decisions. Recovery windows use isolated timed-target acquisition, validate the Director snapshot against current Lane facts, and preserve starts, accepted shots, completion, and cancellation in an append-only SQLite audit without mutating the ordinary match series.

---
"@sasakiuri/nilay-news": patch
---

Remove abort listeners when HTTP operations settle so streamed body reads retain a bounded number of listeners. Preserve byte limits, redirect validation, deadlines, and non-blocking cancellation.

---
'@sasakiuri/saika-lane': patch
---

Calculate competition countdowns from their deadline so callback delays do not accumulate rounding errors. Preserve the original deadline when an absolute start command arrives between whole seconds.

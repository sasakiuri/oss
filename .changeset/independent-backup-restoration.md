---
'@sasakiuri/saika-director': patch
---

Restore saved capture sources independently so a slow first read cannot hold up Director startup or another event. Keep source errors visible and clear transient monitoring errors after successful polling.

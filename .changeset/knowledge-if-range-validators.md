---
'@sasakiuri/nilay-knowledge': patch
---

Prevent incorrect partial content responses for If-Range requests. The asset route retains its weak ETag and modification-date revalidation, but does not treat a file modification time as proof of a strong validator. Requests carrying If-Range now receive the complete representation unless an earlier cache condition produces 304; unconditional byte ranges remain supported.

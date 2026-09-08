---
'@sasakiuri/saika-lane': minor
'@sasakiuri/saika-director': minor
---

Preserve whether a target observation timestamp came from Lane reception, a device report, or an unknown source. Keep this evidence through database reloads and MQTT replay, and display its source in Director without changing scoring or clock-quality policies. Existing observations retain unknown provenance.

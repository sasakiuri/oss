---
'@sasakiuri/saika-lane': minor
'@sasakiuri/saika-director': minor
---

Lane reports its effective firing-window and shot timing settings in hardware heartbeats. Director shows these settings and checks them before timed target firing, including shoot-offs and authorized recovery. Operational profiles independently control whether firing-window enforcement, measured shot timing, and integrated physical signals are ignored, advisory, or required. The default is advisory; missing, disconnected, or expired reports cannot satisfy a required check.

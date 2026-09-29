---
"@sasakiuri/nilay-news": patch
---

Allow individual and bulk dismissal of articles that failed before a post draft
was prepared, clearing the failed record atomically. Provide an error-clearing
action for retrying those articles, including existing Google News URL failures,
while keeping automatic posting disabled until explicitly restarted and
preserving reconciliation for submitted or uncertain posts.

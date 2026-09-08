---
'@sasakiuri/saika-director': patch
---

Import UTF-8 delimited EST backup exports with explicit column names, comma/semicolon/tab separators, and point/comma decimals. Preserve keys and record the file hash and mapping with the comparison evidence. Reject ambiguous columns, invalid numbers, and inconsistent rows before comparison while keeping canonical import and comparison policies independent.

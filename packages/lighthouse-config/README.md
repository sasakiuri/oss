# @sasakiuri/lighthouse-config

Private workspace package containing the shared Lighthouse profiles, score
thresholds, and audit assertions used by Saika Docs and Nilay Knowledge.

Import the default export from `@sasakiuri/lighthouse-config` when configuring a
Lighthouse run. See the [site development guide](../../docs/reference-nextjs.md)
for the build and verification commands.

[Nilay Knowledge](../nilay-knowledge/README.md) overrides the shared thresholds to
require at least 95 for desktop performance and 100 for accessibility, best practices,
and SEO on both profiles. Mobile performance is reported against 95 without blocking
CI, following the shared profile policy. Its Linux CI runs the shared audit assertions
against seven representative pages and retains the Lighthouse reports for seven
days.

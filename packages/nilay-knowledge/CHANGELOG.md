# @sasakiuri/nilay-knowledge

## 0.2.0

### Minor Changes

- [#102](https://github.com/sasakiuri/oss/pull/102) [`9c19270`](https://github.com/sasakiuri/oss/commit/9c192708ba75d92d23db1986bf56e45b2e4d633f) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Import the committed Nilay Knowledge website and its history into the OSS workspace.

### Patch Changes

- [#121](https://github.com/sasakiuri/oss/pull/121) [`6ae9a50`](https://github.com/sasakiuri/oss/commit/6ae9a5010ec6e6a78b491f6e3d897f00e79642f7) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Improve keyboard navigation, dialog focus, image enlargement, reading semantics,
  contrast, reduced motion and narrow-screen layouts. Add accessibility regression
  checks for Chromium and Firefox.

- [#121](https://github.com/sasakiuri/oss/pull/121) [`6ae9a50`](https://github.com/sasakiuri/oss/commit/6ae9a5010ec6e6a78b491f6e3d897f00e79642f7) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Improve reading focus after navigation, enlarged-text layouts, theme selection, and search recovery. Repair article headings and fragment links, describe comparison illustrations, and associate complex table cells with their headers. Extend accessibility checks to every article and enlarged-text interactions.

- [#171](https://github.com/sasakiuri/oss/pull/171) [`94ea884`](https://github.com/sasakiuri/oss/commit/94ea884fd980b95d1b08e9b6c66e04f5ef750395) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Resolve relative authored img and picture source srcset candidates from their content asset directory. Preserve URL commas, candidate descriptors, absolute and data URLs, and authored responsive-image settings.

- [#167](https://github.com/sasakiuri/oss/pull/167) [`70c254d`](https://github.com/sasakiuri/oss/commit/70c254d4a7b6e90ed8ae2ce2c3920950531207ab) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Recognize eligible generated article category pages during local content link checking. Reuse the publication eligibility policy without accepting unknown or ineligible routes, and refresh targets when article classification or counts change.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`a3bd094`](https://github.com/sasakiuri/oss/commit/a3bd094c9a2cc619f00d23dc8c453326b6412a74) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Return explicit renderer capabilities for optional styles and code controls. Preserve server-rendered styles and existing enhancements without inferring features from serialized HTML or literal marker text.

- [#174](https://github.com/sasakiuri/oss/pull/174) [`345a08f`](https://github.com/sasakiuri/oss/commit/345a08f9a13c44c0f68d4df41b530e5fd32e7a1d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Report unknown frontmatter keys during authoring lint without changing runtime metadata stripping. Document the existing corpus inventory and a namespaced custom-field policy, and support checking a separate content directory.

- [#165](https://github.com/sasakiuri/oss/pull/165) [`7a35f6e`](https://github.com/sasakiuri/oss/commit/7a35f6eb118fcf077f1b953e20c5d27efaa085aa) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Prevent incorrect partial content responses for If-Range requests. The asset route retains its weak ETag and modification-date revalidation, but does not treat a file modification time as proof of a strong validator. Requests carrying If-Range now receive the complete representation unless an earlier cache condition produces 304; unconditional byte ranges remain supported.

- [#121](https://github.com/sasakiuri/oss/pull/121) [`a73cdd3`](https://github.com/sasakiuri/oss/commit/a73cdd3a21197fb6b68be97b2f2c110a49409b3c) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Use Radix Popover for SNS sharing and rehype-autolink-headings for article permalinks, preserving Japanese labels and encoded heading URLs. Add fast-check coverage for heading destinations and content URL resolution, and extend browser checks for share popover focus and positioning.

- [#121](https://github.com/sasakiuri/oss/pull/121) [`30d27fe`](https://github.com/sasakiuri/oss/commit/30d27fe8869bbdfe62ec71267930291ef01a80d6) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Reduce initial image and font transfers, move search indexing and queries into an on-demand worker, and wait for article images before printing through the page controls. Add reproducible browser performance measurements and loading regression checks.

- [#172](https://github.com/sasakiuri/oss/pull/172) [`deb1bb8`](https://github.com/sasakiuri/oss/commit/deb1bb86d61ac84b4c5e802367fddf78975896f7) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Apply a shared published-asset path contract to serving, PDF indexing and search validation, and image metadata. Diagnose hidden or invalid referenced assets before publishing unreachable search results, while preserving literal-percent filenames and missing-image fallback behavior.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`2e6b519`](https://github.com/sasakiuri/oss/commit/2e6b519fd6a7d39e1b0765f1360b0112b1a9ebd7) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Declare the search JSON format and deterministic content revision without changing legacy array responses. Distinguish incompatible formats from retryable index failures and preserve the latest query and target when readers explicitly refresh the page.

- [#176](https://github.com/sasakiuri/oss/pull/176) [`6cba23f`](https://github.com/sasakiuri/oss/commit/6cba23f565c92edea8f28eafbaed8fcfcc029cbe) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep article and PDF search failures independent, preserve healthy cached indexes during recovery, and bound index downloads with a shared request deadline. Preserve search focus and reject stale query, target, and pagination responses.

# Performance

## Lighthouse

Use the repository's Node.js version (22.22.2 or newer), install the Playwright
browsers, then run the production audit from the repository root:

```bash
npm run test:install --workspace=@sasakiuri/nilay-knowledge
npm run lhci --workspace=@sasakiuri/nilay-knowledge
# Reuse an existing production build and inspect a smaller selection:
npm run lhci:run --workspace=@sasakiuri/nilay-knowledge -- --profile=mobile --page=home,species --runs=3
npm run test:lighthouse --workspace=@sasakiuri/nilay-knowledge
npm run test:content-styles --workspace=@sasakiuri/nilay-knowledge
```

The runner starts and stops its own production server on an available localhost
port. It uses Playwright's Chromium and Lighthouse's standard simulated mobile
and desktop throttling; browser storage is cleared for each navigation. Run it
without simultaneous tests or builds. The Next.js image cache can be warm.

The default matrix covers home, article index, species guide (`1403693668`),
getting a gun (`1378038316`), news index, news detail (`20220128`), and about.
Each page/profile runs three times. Desktop median performance must reach 95;
mobile performance is reported against the same target without blocking CI,
following the shared profile policy. CPU variation and installed system fonts
affect mobile results, so compare repeated runs on the same host.
Accessibility, best practices, and SEO must reach 100 on both profiles.
Missing results (including mobile performance), runtime errors and shared
required-audit failures also fail the command. All runs produce JSON and HTML in
`.lighthouse.reports/`, with scores, metrics, failed audits and environment details
in `summary.json`. Use `--output-dir` to retain separate comparisons. These reports
are generated artifacts and are ignored by Git and formatting checks.

Linux CI runs this matrix after the existing E2E checks for affected Knowledge
changes and retains reports for seven days, including failed runs.

The optimizations retain original images for zoom and printing while serving
responsive versions for reading. Lazy images use their actual layout width where
supported; explicit sizes cover the reading columns otherwise. PhotoSwipe styles
load with the viewer. Math and code styles load only for content that uses them,
and articles without code blocks render without client Markdown controls.
The hero and first eager content image receive high fetch priority.
The article grid and its Markdown flex columns have explicit minimum widths to
avoid unnecessary content-width calculations.

Regression tests cover distant fragment links, browser text search, history
restoration, zoom, print retries, keyboard controls and both themes. Field-guide
cards retain their natural layout heights to keep distant navigation predictable.

Lighthouse scores are lab measurements and can vary between runs; compare repeated
runs on the same machine. They do not represent production Core Web Vitals or the
impact of a configured GA4 script, CDN, network latency or cold image optimization.
See [Lighthouse measurement variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md).

### September 21, 2026 follow-up: font selection and initial layout

The follow-up baseline was `f86da5b8` with the pre-existing home/search styling
edits present in both builds. Node.js 22.22.2, Lighthouse 13.4.1 and Chromium
153.0.8010.12 audited local production builds using the standard profiles and
three runs per page/profile. No builds or tests ran alongside Lighthouse.

| Page          | Mobile before | Mobile after | Desktop after |
| ------------- | ------------: | -----------: | ------------: |
| Home          |            97 |           98 |           100 |
| Article index |             — |           98 |           100 |
| Species guide |            82 |           95 |           100 |
| Getting a gun |            88 |           97 |           100 |
| News index    |             — |           99 |           100 |
| News detail   |             — |           99 |           100 |
| About         |             — |           98 |           100 |

Values are medians; a dash means that page was not remeasured in the follow-up
baseline. Accessibility, best practices and SEO scored 100 in every final run.
The final 42 audits passed without runner errors or warnings. Reports are retained
locally in `.lighthouse.current-before/` and `.lighthouse.followup-final/`.

Species-guide median total blocking time fell from 565 ms to 207 ms, and style/layout
work from 1,899 ms to 423 ms. Getting-a-gun total blocking time fell from 342 ms
to 31 ms. All final median CLS values were zero. These are lab results: species
performance scores were 76/82/88 before and 90/95/95 after, and its median CPU
benchmark index changed from 2,954 to 2,904. A 95 median is not a promise that every
run or device reaches 95; the shared mobile CI policy remains unchanged.

The system-font stack prioritizes installed Noto Japanese fonts immediately
after `system-ui`, before testing other platform-specific families. This avoids
repeated fallback font matching on hosts with Noto, without adding font downloads.
The original stack selected IPAGothic on this Linux host. Adding Noto at the end
changed the selected font, but still spent time checking unavailable families.
A fresh-browser comparison of Noto-last against Noto-first reduced species-guide
layout time from 150 ms to 78 ms while both selected Noto Sans CJK JP. This single
unthrottled diagnostic comparison is separate from the repeated Lighthouse
measurements. Benefits and glyph appearance depend on the reader's installed
fonts; they are not a guarantee for other platforms.

Image-enlargement links are now generated with the article HTML. Hydration
attaches delegated click/Space handling and button semantics without moving
every image into a new wrapper. Without JavaScript, the links open the original
images. Authored links and controls remain intact, and `picture` elements retain
their sources. The viewer still uses the original or selected responsive source.

Header and TOC offsets use ResizeObserver's border-box measurements. At their
default size, they retain the CSS offsets rather than writing inherited root
variables and invalidating styles throughout a long article. Resizing and text
enlargement still update the offsets. Cards keep their natural heights, including
offscreen entries, for fragment links, browser search, history and printing.

Validation includes 293 passing unit tests (five existing skips), all 234
Chromium/Firefox/320px browser checks, and 27 further browser checks after the
final font-priority adjustment. Type checking, package lint, a production build,
and the Lighthouse/content-style runner tests pass. Additional spell checks of
CSS and TypeScript report existing dictionary warnings outside the repository's
configured spell-check file scope; the new height-observer files pass.

### Earlier September 21, 2026 Lighthouse comparison

Lighthouse 13.4.1 and Chromium 153.0.8010.12 audited local production builds with
the standard profiles. Scores below are medians of three runs per page/profile.
The original baseline is commit `bb043669`. The final matrix used Node.js 22.22.2.

| Page          | Mobile before | Mobile after | Desktop after |
| ------------- | ------------: | -----------: | ------------: |
| Home          |            96 |           96 |           100 |
| Article index |            98 |           98 |           100 |
| Species guide |            89 |           85 |            99 |
| Getting a gun |            94 |           92 |           100 |
| News index    |            89 |           97 |           100 |
| News detail   |            97 |           99 |           100 |
| About         |            98 |          100 |           100 |

Desktop baseline medians were all 100. Accessibility, best practices, and SEO
remained 100 throughout both matrices. This does **not** demonstrate a uniform
performance-score improvement: the species guide and getting-a-gun page remain
below the mobile target. The species guide still lays out 1,870 DOM elements.
Its CPU benchmark index changed from 3,599 to 3,044 between these batches, so
timing differences cannot be attributed solely to these code changes. Home also
includes a concurrent design change and is not an isolated performance comparison.

A follow-up control rebuilt `bb043669` in an isolated worktree, audited the two
long articles three times, then immediately repeated the current build. Species
scores were 87/87/87 before and 86/84/91 after (medians 87 → 86); getting-a-gun
medians were 89 → 93. These repeated measurements still do not establish a
performance-score improvement for the species guide. Both batches
are retained locally in `.lighthouse-knowledge/control/` at the repository root
and `.lighthouse.confirmation/` in this package.

The full matrix reports are in `.lighthouse.reports/`. A subsequent whitespace
fix aligned the search shortcut's visible and accessible names; its experimental
Lighthouse audit is checked separately in `.lighthouse.search-name-check/` and
in all three Playwright browser projects.

Transfer sizes, including HTTP headers, provide a less timing-sensitive comparison:

| Resource                             |    Before |     After | Reduction |
| ------------------------------------ | --------: | --------: | --------: |
| Initial site CSS                     |  17,914 B |  12,557 B |     29.9% |
| Species guide initial images, mobile | 248,395 B | 116,386 B |     53.1% |
| Getting-a-gun initial images, mobile | 119,195 B |  19,588 B |     83.6% |

There are tradeoffs: responsive image attributes increase the species document
from 62,443 to 72,470 transferred bytes, and its observed script transfers grow
from 218,328 to 224,815 bytes. The image savings exceed these increases; a blanket
JavaScript-size reduction is not claimed. Browser tests preserve original-resolution
zoom/printing. Lighthouse median CLS remained unchanged for all seven pages.

## Browser benchmark

Run a production build and start the server, then measure from a second terminal:

```bash
npm run build --workspace=@sasakiuri/nilay-knowledge
npm run start --workspace=@sasakiuri/nilay-knowledge
# Second terminal; URL and repeat count are optional (defaults below).
npm run benchmark:browser --workspace=@sasakiuri/nilay-knowledge -- http://127.0.0.1:3000 3
```

Install Chromium first with the package's `test:install` command if needed. The
benchmark uses a fresh browser context for each route and repetition, a 390×844
viewport and device scale factor 1. It waits for initial network activity to settle,
then opens search and queries `申請`. Results are JSON. The server's image cache may
be warm; browser caches are empty. There is no CPU or network throttling.

`resourceBytes` counts resource response bodies after HTTP compression; it excludes
the navigation HTML and response headers. `scriptBytes` and `imageBytes` are subsets.
Long tasks are main-thread tasks longer than 50 ms. `searchInteractionMs` includes
Playwright input and waiting overhead as well as downloading and preparing search.
Compare repeated runs on the same machine and avoid running tests concurrently.
LCP and CLS here cover initial loading, not a real-user session.

## Earlier September 2026 browser comparison

The same Chromium harness, viewport and corpus were measured before and after the
changes (Chromium 153.0.8010.12). The baseline is one sample per route; the final
values are medians of three samples per route. These are local measurements, not
production Core Web Vitals or mobile-device timing guarantees. Decimal KB/MB are used below.

| Route                        | Initial resource bodies before |     After | Reduction |
| ---------------------------- | -----------------------------: | --------: | --------: |
| Home                         |                      919,518 B | 314,019 B |     65.8% |
| Article index                |                      969,240 B | 292,797 B |     69.8% |
| Species guide (`1403693668`) |                   11,585,886 B | 452,568 B |     96.1% |
| Getting a gun (`1378038316`) |                    2,264,052 B | 345,868 B |     84.7% |

The species guide initially fetched 94 images / 9,123,967 B. Reserving image space
and delaying offscreen images reduced this to 42 requests / 225,344 B in that
viewport. Browser lazy-loading margins vary. In the current implementation,
scrolling selects responsive images; zoom and printing load the original images. Home image bodies dropped from 156,689 B to 68,644 B with
responsive optimization. System fonts remove Japanese web-font downloads; glyph
appearance consequently follows the operating system.

Opening search previously caused a 298–367 ms main-thread task across these four
pages. With fetching, validation, MiniSearch indexing and query execution in a worker,
none of the twelve final samples recorded a search-related task over 50 ms. Indexing still
does work; it runs off the UI thread. The unchanged source JSON is 378,508 B
(98,898 B gzip). Shipping MiniSearch's prebuilt serialized index was rejected after
measurement: it was 1,448,822 B (323,446 B gzip), over three times the compressed
download size. Initial page loading still recorded occasional long tasks (up to
197 ms in these final samples); moving search off the main thread does not remove
HTML parsing, page layout or React hydration work.

The browser regression tests assert loading behavior instead of timing thresholds:
no worker/index request before searching, one reused worker afterward, responsive
home images, no web-font requests, and deferred article images with intrinsic
dimensions. Unit tests cover worker errors, retries, stale responses and image
metadata. Existing keyboard, theme, navigation, zoom and accessibility checks remain
part of the release checks. For printing, use the article's print button or shortcut
so image decoding finishes before the print dialog opens; the native browser menu
cannot await that asynchronous step.

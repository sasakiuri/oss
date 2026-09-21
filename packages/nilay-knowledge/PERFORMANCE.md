# Browser performance

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

## September 2026 local comparison

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
viewport. Browser lazy-loading margins vary; scrolling or printing still loads
the original images. Home image bodies dropped from 156,689 B to 68,644 B with
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

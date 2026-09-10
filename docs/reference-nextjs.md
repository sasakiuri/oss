# Next.js documentation site

Browse the Markdown files in `packages/saika-docs` in a web browser. The same package provides shared implementations for UI, data fetching, and validation for future Next.js development.

Use Node 22.22.2 and npm 10.9.4.

| Purpose                                                              | Command                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Initial setup                                                        | `make setup`                                                                     |
| Development                                                          | `make dev`                                                                       |
| Types, contracts, linting, prose, dependency direction, and coverage | `npm run check -w @sasakiuri/saika-docs`                                         |
| Install browsers                                                     | `npm run test:install -w @sasakiuri/saika-docs`                                  |
| Browser, accessibility, and visual regression tests                  | `make e2e`                                                                       |
| UI component tests                                                   | `npm run test:storybook -w @sasakiuri/saika-docs`                                |
| Performance measurement                                              | `npm run lhci -w @sasakiuri/saika-docs`                                          |
| Static site build                                                    | `npm run build:static -w @sasakiuri/saika-docs`                                  |
| Static site link checks                                              | `npm run test:static -w @sasakiuri/saika-docs`                                   |
| Offline browsing checks                                              | `npm run test:offline -w @sasakiuri/saika-docs -- --output=test-results/offline` |
| Distribution integrity                                               | `npm run artifact:verify -w @sasakiuri/saika-docs`                               |
| Reproducibility checks                                               | `npm run test:reproducible -w @sasakiuri/saika-docs`                             |
| Mutation testing                                                     | `npm run test:mutation -w @sasakiuri/saika-docs`                                 |
| Add a document                                                       | `npm run content:new -w @sasakiuri/saika-docs -- common/slug "Document title"`   |
| Printable HTML and PDF                                               | After building, run `npm run docs:pdf -w @sasakiuri/saika-docs`                  |
| PDF content checks                                                   | `npm run docs:verify -w @sasakiuri/saika-docs`                                   |
| Distribution archive                                                 | `npm run docs:package -w @sasakiuri/saika-docs`                                  |

Visit `/reference/` for forms, lists, dialogs, tabs, QR codes, and DOT diagrams. `/reference/material/` contains Material UI and Emotion examples. The input examples run in the browser.

Documents work without front matter. Optional `title`, `description`, `published`, `updated`, `tags`, and `image` fields are validated when provided. Dates must use `YYYY-MM-DD`, and images must refer to existing files under `public`. RSS is available at `/rss.xml/`, and the print view is at `/print/`.

## Editing documentation

Start with the [document index](../packages/saika-docs/INDEX.md) and [writing policy](../packages/saika-docs/CONTENT_POLICY.md#マニュアルと外部仕様の書き方). Keep routine steps in the operation guides and detailed values or formats in the linked references. Check screen labels and behaviour against the application source for the same version.

After editing, run `npm run content:generate -w @sasakiuri/saika-docs` to validate metadata, document links, and heading anchors. Run `npm run lint:text` and `npm run lint -w @sasakiuri/saika-docs` to check spacing, prose, and formatting. For a new guide, update the index, relevant entry links, and `src/entities/document/navigation.ts`. When moving a section, update incoming links and preserve its existing heading as a short pointer for saved URLs.

Regenerate the Japanese font subset after content generation, following [the font instructions](../packages/saika-docs/assets/fonts/SOURCE.txt). Build the site and inspect changed pages on desktop and mobile, including search and navigation. Refresh visual snapshots only after reviewing the rendered changes.

## Configuration and distribution

`.env.example` distinguishes public values from secrets. Sentry, Axiom, GTM, and Clarity are enabled only when configured. Sampling rates default to zero. Do not place secrets in `NEXT_PUBLIC_` variables. The Sentry build token can be supplied through a Docker secret mount.

`DOCS_OUTPUT` supports `server`, `standalone`, and `export`. Set `NEXT_PUBLIC_BASE_PATH` at build time. Static sites do not support dynamic API processing or in-app Basic authentication. With server output, Basic authentication protects all pages, APIs, and assets.

Static output includes per-page CSP hashes, a Service Worker, an SPDX file inventory, and a SHA-256 manifest. Integrity checks detect files changed, added, or deleted after verification. The Service Worker caches only published static documents and assets.

After publishing the static site, set the repository variable `DOCS_MONITOR_URL` to its public URL to enable scheduled monitoring. Checks cover certificate expiry, documents, the manifest, RSS, and the Service Worker.

PDF generation recreates the output directory. Distribution archives require coverage, browser, Storybook, and Lighthouse reports generated from the same source. Stale or missing results cannot be reused. The manual distribution workflow in CI can generate these in sequence. The PDF container includes WeasyPrint, Pandoc, Tectonic, and Graphviz.

Prose checks cover Markdown and text files, with an explicit baseline for findings in existing documents. New findings fail the check. CI does not update the baseline. The repository-wide Japanese/English spacing rule runs separately without baseline exceptions; see [Code Style](../CONTRIBUTING.md#code-style). Mobile Lighthouse performance is reported as an improvement target and displayed separately from the other quality criteria.

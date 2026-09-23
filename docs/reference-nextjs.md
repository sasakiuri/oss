# Next.js documentation site

Saika Docs serves the Markdown manuals in `packages/saika-docs` through Next.js. The `/reference/` pages demonstrate the site’s UI components, data fetching, and validation.

Use Node.js 24.16.0 and npm 11.13.0.

Docs-only setup uses `make setup` without running application install hooks. For
desktop development as well, run `npm ci` from the repository root; its install
hook rebuilds the shared Electron native modules once.

| Purpose                                                              | Command                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Initial setup                                                        | `make setup`                                                                            |
| Development                                                          | `make dev`                                                                              |
| Server build and start                                               | `npm run build -w @sasakiuri/saika-docs`, then `npm run start -w @sasakiuri/saika-docs` |
| Types, contracts, linting, prose, dependency direction, and coverage | `npm run check -w @sasakiuri/saika-docs`                                                |
| Install browsers                                                     | `npm run test:install -w @sasakiuri/saika-docs`                                         |
| Browser, accessibility, and visual regression tests                  | `make e2e`                                                                              |
| UI component tests                                                   | `npm run test:storybook -w @sasakiuri/saika-docs`                                       |
| Performance measurement                                              | `npm run lhci -w @sasakiuri/saika-docs`                                                 |
| Static site build                                                    | `npm run build:static -w @sasakiuri/saika-docs`                                         |
| Preview the static site                                              | `npm run preview -w @sasakiuri/saika-docs`                                              |
| Static site link checks                                              | `npm run test:static -w @sasakiuri/saika-docs`                                          |
| Offline browsing checks                                              | `npm run test:offline -w @sasakiuri/saika-docs -- --output=test-results/offline`        |
| Distribution integrity                                               | `npm run artifact:verify -w @sasakiuri/saika-docs`                                      |
| Reproducibility checks                                               | `npm run test:reproducible -w @sasakiuri/saika-docs`                                    |
| Mutation testing                                                     | `npm run test:mutation -w @sasakiuri/saika-docs`                                        |
| Add a document                                                       | `npm run content:new -w @sasakiuri/saika-docs -- common/slug "Document title"`          |
| Printable HTML and PDF                                               | After building, run `npm run docs:pdf -w @sasakiuri/saika-docs`                         |
| PDF content checks                                                   | `npm run docs:verify -w @sasakiuri/saika-docs`                                          |
| Distribution archive                                                 | `npm run docs:package -w @sasakiuri/saika-docs`                                         |

Development and server output use port 5175. Static output is written to `packages/saika-docs/out/` and previewed over HTTP on port 4175. Storybook uses port 6006, and browser tests start a production server on port 5178.

Visit `/reference/` for forms, lists, dialogs, tabs, QR codes, and DOT diagrams. `/reference/material/` contains Material UI and Emotion examples. The input examples run in the browser.

Documents work without front matter. Optional `title`, `description`, `published`, `updated`, `tags`, and `image` fields are validated when provided. Dates must use `YYYY-MM-DD`, and images must refer to existing files under `public`. RSS is available at `/rss.xml/`, and the print view is at `/print/`.

## Editing documentation

Start with the [document index](../packages/saika-docs/INDEX.md). Write steps in the order users perform them, using the application's screen and button labels. Keep detailed settings and data formats in the linked specifications. State hardware verification limits alongside the relevant feature.

Describe current behavior in the guides and user-visible changes in release notes. Keep implementation details in code and tests. Add to the [design notes](./adr/README.md) only when a tradeoff will matter to future maintenance.

Contributions must be available under the MIT License. Retain source links and required copyright and license notices for third-party material; see [Notices](../packages/saika-docs/NOTICE.md). Use sample data without personal information, credentials, or device identifiers.

`README.md` becomes a directory index, `INDEX.md` becomes `/documents/`, and other filenames become lowercase with underscores replaced by hyphens. Source and license links point to GitHub at `DOCS_SOURCE_REF`, which defaults to `1.x` and can select a branch, tag, or commit.

After editing, run `npm run content:generate -w @sasakiuri/saika-docs` to validate metadata, document links, and heading anchors. Run `npm run lint:text` and `npm run lint -w @sasakiuri/saika-docs` to check spacing, prose, and formatting. For a new guide, update the index, relevant entry links, and `src/entities/document/navigation.ts`. When moving a section, update incoming links and preserve its existing heading as a short pointer for saved URLs.

Regenerate the Japanese font subset after content generation, following [the font instructions](../packages/saika-docs/assets/fonts/SOURCE.txt). Build the site and inspect changed pages on desktop and mobile, including search and navigation. Refresh visual snapshots only after reviewing the rendered changes.

## Configuration and distribution

`.env.example` distinguishes public values from secrets. Sentry, Axiom, GTM, and Clarity are enabled only when configured. Sampling rates default to zero. Do not place secrets in `NEXT_PUBLIC_` variables. The Sentry build token can be supplied through a Docker secret mount.

`DOCS_OUTPUT` supports `server`, `standalone`, and `export`. Set `NEXT_PUBLIC_BASE_PATH` at build time. Static sites do not support dynamic API processing or in-app Basic authentication. With server output, Basic authentication protects all pages, APIs, and assets.

Static output includes per-page CSP hashes, a Service Worker, an SPDX file inventory, and a SHA-256 manifest. Integrity checks detect files changed, added, or deleted after verification. The Service Worker caches only published static documents and assets.

After publishing the static site, set the repository variable `DOCS_MONITOR_URL` to its public URL to enable scheduled monitoring. Checks cover certificate expiry, documents, the manifest, RSS, and the Service Worker.

PDF generation recreates the output directory. Distribution archives require coverage, browser, Storybook, and Lighthouse reports generated from the same source. Stale or missing results cannot be reused. The manual distribution workflow in CI can generate these in sequence. The PDF container includes WeasyPrint, Pandoc, Tectonic, and Graphviz.

Prose checks cover Markdown and text files, with an explicit baseline for findings in existing documents. New findings fail the check. CI does not update the baseline. The repository-wide Japanese/English spacing rule runs separately without baseline exceptions; see [Code Style](../CONTRIBUTING.md#code-style). Mobile Lighthouse performance is reported as an improvement target and displayed separately from the other quality criteria.

## API and HTTP load checks

`npm run api:check -w @sasakiuri/saika-docs` lints both OpenAPI files with Redocly, checks generated client types against `contracts/openapi.json`, and checks the generated Next.js route inventory against the route handlers. The lint configuration validates structure, references, operation IDs, paths, parameters, and examples without an ignore baseline. Use `api:lint` to run only definition linting.

`npm run test:load:smoke -w @sasakiuri/saika-docs` builds the production server, starts it on `127.0.0.1:5188`, and runs a pinned k6 Docker image. Docker host networking is required (Linux, or enabled in Docker Desktop); alternatively, set `K6_BINARY` to a locally installed k6 executable. Use `test:load:smoke:run` after an existing server build, including in CI. The smoke test performs five iterations with one virtual user and a one-second pause: ten GET requests across `/api/health/` and `/api/catalog/`. Every response must succeed and contain the expected data. Timing is reported without a machine-dependent smoke latency gate.

The catalog uses the generated manuals from the build. Both endpoints are static reads; the test does not call the telemetry write endpoint or the Upstash-backed rate limiter. Preview authentication uses the existing `DOCS_PREVIEW_AUTH=1`, `PREVIEW_AUTH_USER`, and `PREVIEW_AUTH_PASSWORD` variables. Local smoke respects the build's `NEXT_PUBLIC_BASE_PATH`; external targets must include their base path in `DOCS_LOAD_BASE_URL`. TLS verification stays enabled and redirects fail the response checks.

For a manually selected staging target, supply the workload and latency budget explicitly:

```bash
DOCS_LOAD_BASE_URL=https://your-staging-host.example/manuals \
DOCS_LOAD_RATE=5 DOCS_LOAD_DURATION=1m DOCS_LOAD_VUS=10 DOCS_LOAD_P95_MS=500 \
  npm run test:load -w @sasakiuri/saika-docs
```

These example values are not a service objective. Choose them for the target's capacity and agreed response-time budget. `DOCS_LOAD_RATE` is iterations per second, with two requests per iteration; `DOCS_LOAD_VUS` bounds the available concurrency. Load checks require zero failed requests, valid response data, no dropped iterations, and each endpoint's p95 below `DOCS_LOAD_P95_MS`. External load never runs automatically in CI. The CLI prints k6 metrics and exits unsuccessfully when a threshold fails.

# Nilay Knowledge

`@sasakiuri/nilay-knowledge` is the Next.js website at <https://knowledge.nilay.jp>.

Use Node 22.22.2 or newer and npm 10.9.4. Run commands from the repository root:

```bash
npm ci
npm run dev --workspace=@sasakiuri/nilay-knowledge
npm run lint --workspace=@sasakiuri/nilay-knowledge
npm run typecheck --workspace=@sasakiuri/nilay-knowledge
npm run test:coverage --workspace=@sasakiuri/nilay-knowledge
npm run build --workspace=@sasakiuri/nilay-knowledge
npm run start --workspace=@sasakiuri/nilay-knowledge
```

The development and production servers listen on port 3000. Build generates the
RSS feed and sitemap in `public/`, then builds Next.js into `.next/`. This committed
version uses a Next.js server, including `/api/og`; it does not export `out/`.
The inherited Firebase configuration is retained as historical configuration and
is not a deployment pipeline for this build. Hosting and DNS are unchanged by
this import.

Optional environment variables are `NEXT_PUBLIC_GA_MEASUREMENT_ID` and
`NEXT_PUBLIC_FACEBOOK_APP_ID`. Set them before building; Turbo includes both in
the build cache key. `ANALYZE=true npm run build --workspace=@sasakiuri/nilay-knowledge`
enables the bundle analyzer. The build downloads Noto Sans JP through `next/font`.

Articles and news live in `content/`; their committed public copies live in
`public/content/`. When editing content or assets, keep the public copies in sync.
Use `npm run new:article --workspace=@sasakiuri/nilay-knowledge -- "Title"` or
`npm run new:news --workspace=@sasakiuri/nilay-knowledge -- "Title"` to create entries.
The creation commands reserve a new directory before writing, add a numeric suffix
when the slug already exists, and write UTC timestamps. Article slugs use Unix
seconds; news slugs use the local calendar date.

## Content architecture

`app/` composes pages from server data and presentation components. Content access
is divided into explicit boundaries under `lib/content/`:

| Module                  | Responsibility                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `types.ts`              | Shared metadata, summary, source, rendered document and TOC contracts |
| `repository.ts`         | File enumeration, reads, metadata validation and publication ordering |
| `render.ts`, `paths.ts` | Markdown rendering, relative asset URLs and heading anchors           |
| `server.ts`             | Server-only Next.js adapter with request-scoped React memoization     |
| `metadata.ts`           | Canonical, Open Graph, Twitter and RSS discovery metadata             |
| `publication.ts`        | RSS and sitemap serialization from validated content                  |

The repository takes a content directory explicitly and has no dependency on
React or Markdown rendering. `list()` returns summaries without bodies or HTML;
`read()` and `listSources()` return validated Markdown sources. The server adapter
shares source reads between page metadata and detail rendering. The news page
loads summaries once and filters them into its existing categories. The curated
article index remains in `app/articles/page.tsx`.

The [metadata validator](lib/content/frontmatter.ts) requires `title`, `published` and `tags`. Dates accept `YYYY-MM-DD` or ISO
timestamps with a timezone, and invalid calendar dates fail validation. `updated`
and `image` are optional for both collections. Invalid metadata reports the source
file and field; I/O and parsing failures propagate. Slugs must be single URL
segments made of letters, digits, underscores and hyphens, starting with a letter
or digit. The server adapter treats invalid public route segments as missing
content, so metadata and detail pages return the normal not-found response.
The build generates detail pages from the enumerated content entries;
rebuild the production site after changing content.

Rendering operates on the parsed HTML tree. Relative links and images, including
Markdown references and embedded HTML, resolve under `/content/<type>/<slug>/`.
Code examples, URI schemes, root paths and fragment links keep their meaning.
The TOC uses the same heading IDs as the generated HTML, including repeated and
formatted headings. GitHub alerts are processed before soft line breaks. Raw HTML
is intentionally supported for trusted, reviewed repository content; this renderer
is not an upload or user-input sanitization boundary.

The feed and sitemap scripts use the same repository as pages. They resolve paths
from their own locations and also work when invoked directly from the repository
root. Sitemap detail entries use `updated ?? published`; static pages omit an
invented modification date. Public asset copies remain committed and require the
synchronization described above.

Regression tests exercise temporary content directories, the real Markdown
pipeline, all committed article TOC targets, feed/sitemap URL parity, metadata,
and content creation from a different working directory. Run package tests,
lint, typecheck and build after changing a content boundary.

## Import provenance

Imported only committed files from `sasakiuri/nilay` at
`cf622d7ce7b001dd0f4d9fd86138a2415fc03b82`, under `packages/knowledge.website/`.
The 34 commits affecting that directory retain their authors and timestamps;
paths are relocated and messages use Conventional Commits with the
`nilay-knowledge` scope. Each imported commit has a `Nilay-Commit` trailer with
its original hash. Original PR references are marked `nilay#` to distinguish
them from this repository. No uncommitted changes from Nilay were imported.
The 34 imported commits follow the existing OSS history in a linear sequence.
A final integration commit contains the workspace adjustments.

This private website package is versioned independently from the Saika suite.
It is not published to npm. Changesets can track future package changes.

## Licenses and content attribution

The software retains the original Nilay [MIT license](LICENSE). The package
metadata lists both MIT for the software and CC BY-SA 4.0 for the site text.

The original site footer states that its text, unless individually marked
otherwise, is published by Nilay under CC BY-SA 4.0. That attribution and all
individual content and asset notices are retained. The repository's MIT license
does not replace these existing content terms or individual image/PDF notices.
See [the original license notice](components/footer.tsx).

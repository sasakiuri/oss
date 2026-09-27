# Nilay News

A news inbox for hunting, wildlife management, and shooting sports, with publishing to X via [@NilayNews](https://x.com/NilayNews).
It collects RSS and government updates, supports manual review and Jev classification, and posts selected articles through Buffer.
The TypeScript app runs on Cloudflare Workers with D1 storage and Access authentication. Production uses the [Workers Paid plan](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

## Local development

Follow the [repository setup](../../CONTRIBUTING.md#development-setup).
After installing npm dependencies at the repository root, run:

```bash
cd packages/nilay-news
npm run dev:local
```

Open <http://localhost:4317>. Collection, search, and manual review work without API keys.
Local development uses the same Worker and a local D1 database. Optional integrations use `.dev.vars`; see [.dev.vars.example](.dev.vars.example).

## Checks

Run these commands from the package directory:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Tests include a local Worker, D1, and WebCrypto. External APIs use mock responses.
`build` runs a deployment dry run without uploading the Worker.

## Configuration and limits

- [sources.json](sources.json) defines sources, queries, and collection limits. Google News and CEEK queries run at least six hours apart, with at least 30 minutes between requests to the same host. Gazette collection is disabled.
- Collection follows robots.txt, except for exact Google News search RSS URLs explicitly marked with `robotsException`. The exception does not apply to redirects.
- Jev runs only on an explicit classification request. It sends article information and selection criteria to TypeSafe and incurs usage charges. It preserves manual review decisions.
- Automatic collection and posting are disabled by default. Posting is limited to one article per hour and stops on failure or an unknown outcome. Check Buffer and X before resuming. Stopping automation does not cancel posts already accepted by Buffer.
- [wrangler.jsonc](wrangler.jsonc) requires Access configuration before serving pages or APIs. The separate local entrypoint accepts only localhost requests. Keep deployment values and API keys out of Git.

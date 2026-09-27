# Nilay News

A news inbox for hunting, wildlife management, and shooting sports, with publishing to X via [@NilayNews](https://x.com/NilayNews).
It collects RSS and government updates, supports manual review and Jev classification, and posts selected articles through Buffer.
The TypeScript app runs on Cloudflare Workers with D1 storage and Access authentication. Production uses the [Workers Paid plan](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

## Local development

Follow the [repository setup](../../CONTRIBUTING.md#development-setup).
After installing npm dependencies at the repository root, run:

```bash
cd packages/nilay-news
npm run dev
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
- Jev runs on an explicit classification request, or automatically when automatic classification is enabled. It sends article information and selection criteria to TypeSafe and incurs usage charges. It preserves manual review decisions.
- Automatic classification is a separate setting that requires `TYPESAFE_API_KEY`. While no job runs, it queues never-classified articles, oldest first, in batches of at most 100 and at most the collection interval in minutes, and processes one per minute. Existing unclassified articles are included. Due automatic collection usually runs first, but one classification batch may follow each finished collection, so collection that takes longer than its interval cannot hold classification back indefinitely. Collection is not queued automatically while no source is enabled. Failed articles are retried only on explicit request, an interrupted automatic batch never sends an already classified article again, and any failed classification pauses automatic batches for one collection interval. Disabling it lets a started batch finish.
- Automatic collection, classification, and posting are disabled by default. Posting is limited to one article per hour and stops on failure or an unknown outcome. Check Buffer and X before resuming. Stopping automation does not cancel posts already accepted by Buffer.
- [wrangler.jsonc](wrangler.jsonc) requires Access configuration before serving pages or APIs. The separate local entrypoint accepts only localhost requests. Keep deployment values and API keys out of Git.

## Production deployment

[News deployment](../../.github/workflows/news-deployment.yml) deploys pushes to `1.x` that change this package, shared configs, root npm files, or the workflow. It can also be run manually on `1.x`.
A job without credentials runs the checks above. The deploy job then writes the ignored `wrangler.production.jsonc`, validates it, runs a dry run, applies D1 migrations, and deploys. Existing settings and jobs require the `0002_auto_analyze` and `0003_automatic_jobs` migrations before API and scheduled initialization can succeed.

Production uses the Worker's default [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) URL, `https://nilay-news.<account subdomain>.workers.dev`. It needs no custom domain or Cloudflare zone.
The generated config enables `workers_dev`, keeps preview URLs disabled, and has no `route` or `routes`. The tracked [wrangler.jsonc](wrangler.jsonc) keeps `workers_dev` disabled for offline use; any config that enables it must pass the complete deployment checks.

Before the first deployment, create the D1 database and a self-hosted [Access application](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) that covers the entire workers.dev hostname, with an Allow policy for the permitted email addresses. Deploying without it exposes the hostname to the Worker's own Access check only.
Configure the `nilay-news-production` GitHub environment and restrict it to `1.x`:

| Name                        | Kind     | Value                                                         |
| --------------------------- | -------- | ------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | Secret   | Account token for Workers deployment and D1; no zone access   |
| `CF_ACCESS_ALLOWED_EMAILS`  | Secret   | Comma-separated email addresses allowed by the Worker         |
| `CLOUDFLARE_ACCOUNT_ID`     | Variable | Cloudflare account ID                                         |
| `NILAY_NEWS_D1_DATABASE_ID` | Variable | D1 database UUID                                              |
| `NILAY_PUBLIC_ORIGIN`       | Variable | `https://nilay-news.<account subdomain>.workers.dev`, no path |
| `CF_ACCESS_TEAM_DOMAIN`     | Variable | `<team>.cloudflareaccess.com`                                 |
| `CF_ACCESS_AUD`             | Variable | Audience tag of the Access application for that hostname      |

Set optional integrations as Worker secrets with `wrangler secret put --config wrangler.production.jsonc`: `TYPESAFE_API_KEY`, `BUFFER_API_KEY`, `SLACK_WEBHOOK_URL`, and `BUFFER_CHANNEL_ID`. Deployment does not enable automatic collection, classification, or posting.

After deployment, a smoke check confirms that unauthenticated requests to `/`, `/app.js`, and `/api/state` redirect to this application's Access login. It does not sign in or request any other host, so it does not verify the Worker, D1, or disabled preview URLs. After the first deployment, sign in and confirm that the inbox and `/api/state` load.

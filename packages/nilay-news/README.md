# Nilay News

<!-- cspell:ignore Geospatial muni -->

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

- [sources.json](sources.json) defines sources, queries, and collection limits. Ordinary news feeds (Google News, CEEK, and Yahoo) run at least four hours apart; Google News and CEEK also keep at least 30 minutes between requests to the same host. The production collection interval is four hours. The fixed daily sources and the 鳥獣ニュース roundup retain their daily schedules.
- Sources with `"dailyAtJst": "11:00"` (the gazette, e-Gov, ministry and agency pages, bill indexes, and the shooting and gibier association feeds) are collected once a day starting at 11:00 JST, one source per minute in order, not all at once. The next run is always 11:00 the next day, even if a run started late. Once 11:00 has passed, a run the day missed is due immediately, but earlier days are not caught up. When automatic collection is enabled, the one-minute scheduler queues them independently of the collection interval. An idle automatic job yields to them between items, including between the articles of one classification run, and its remaining sources follow the daily ones. Manual jobs and jobs in progress are never interrupted. Manual collection also skips a daily source until its next 11:00 run. Other sources, including the 24-hour 鳥獣ニュース roundup, keep their rolling intervals, and regular automatic collection does not include daily sources.
- An RSS source with `"feedContent": "links"` collects each external link in an entry body as its own article, titled by the anchor text or the headline just before it; the entry itself, links back to the feed host, and unsafe URLs are not collected. The 鳥獣ニュース daily roundup uses this and runs at most once every 24 hours with up to 100 links. Linked pages are not fetched, so the roundup's title, URL, and date are kept only as metadata and the article date stays unknown.
- The official gazette (官報) source reads the homepage once a day at 11:00 JST and follows only the full daily TOCs (`/YYYYMMDD/YYYYMMDD.fullcontents.html`) of the three latest issue days it links. It saves up to 100 headlines from law, cabinet and ministerial orders, rules, notices (告示), and government reports (官庁報告), each linked to its official page with the issue date, edition, issue number, section, and page. Headlines that share a page are kept as separate articles. Notice pages, PDFs, and full text are never fetched, so only the TOC headline is stored. Public announcements (公告), personnel changes, Diet and Imperial Household items, and government procurement are excluded. Missing or malformed TOCs and unreadable headings appear as warnings. A day with no eligible headings gets a coverage note and no articles. Gazette requests never follow redirects, and older issues are not backfilled.
- Collection follows robots.txt, with exceptions only for sources explicitly marked with `robotsException`: exact Google News search RSS URLs, and, for the enabled gazette source, the exact HTTPS daily TOC URLs above. The user requested the gazette exception, and it does not mean the site granted permission. robots.txt is still read and its crawl delay applied. Exceptions never apply to redirects or any other URL, including notice pages, PDFs, and `/old/`.
- The MAFF press index (`maff-press`) is marked with `"robotsUnavailableStatus": 403`, because MAFF's robots.txt returns HTTP 403 without rules. RFC 9309 (section 2.3.1.3) lets a crawler treat a 4xx robots.txt as unavailable. Only this exact HTTPS URL, while enabled, uses that rule. It is collected once a day at 11:00 JST with at least 3 seconds between requests. The user requested this compatibility rule; it does not mean the site granted permission. Collection proceeds only when the 403 comes from `/robots.txt` directly, not after a redirect. Nothing is cached for the rest of the site, so any other MAFF URL is still refused and the host backs off. The index's own redirects are not followed. If robots.txt returns rules, they apply, including `Disallow` and crawl delays. Any other robots.txt failure stops collection as usual: 401, 429, 5xx, network errors, HTML, or unreadable text. A 403 on the page itself does the same. This rule does not clear an existing host block.
- Jev runs on an explicit classification request, or automatically when automatic classification is enabled. It sends article information and selection criteria to TypeSafe and incurs usage charges. It preserves manual review decisions.
- Automatic classification is a separate setting that requires `TYPESAFE_API_KEY`. While no job runs, it queues never-classified articles, oldest first, in batches of at most 100 and at most the collection interval in minutes. Each one-minute scheduler run classifies articles one at a time, up to 10. Its first item always starts, even after slow publication checks, so collection keeps its pace; no additional article starts once 45 seconds have passed since the run began, and an article already sent is not cancelled. This is an upper bound, not a guaranteed rate: API response time, a failure, a due 11:00 JST source, or another run holding the job ends the run early, and each run still collects at most one source. A manual job requested during a run is left for the next run, while a manual batch the run started with continues. Existing unclassified articles are included. Due automatic collection usually runs first, but one classification batch may follow each finished collection, so collection that takes longer than its interval cannot hold classification back indefinitely. Collection is not queued automatically while no source is enabled. Failed articles are retried only on explicit request, an interrupted automatic batch never sends an already classified article again, and any failed classification pauses automatic batches for one collection interval. Disabling it lets a started batch finish.
- Post hashtags are derived from stored article data whenever a draft is built, without extra requests or changes to stored articles. They come in this order: the original publisher (at most one), up to two places (normally a prefecture and a municipality), then at most two topics. The publisher comes from a ministry or association source's own name, the ministry in charge of an e-Gov item, a publisher label in a Google News, CEEK, or Yahoo headline, or a small list of known news sites. Aggregators and roundups are never tagged as publishers. Places and topics come from the headline, and the excerpt's first sentence adds to them only when it is not a keyword snippet or a roundup citation. Topics also use a current Jev topic. A publisher's name never supplies a place or topic. Anything the data does not state is left out, so a post can have no tags. Posts already stored keep their text.
- [src/data/municipalities.json](src/data/municipalities.json) holds prefecture and municipality names derived from the Geospatial Information Authority of Japan's [muni.js](https://maps.gsi.go.jp/js/muni.js), retrieved 2026-09-28. Wards of designated cities are merged into their city. See the GSI [terms of use](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html).
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

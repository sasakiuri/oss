// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, validateConfig } from "../scripts/check-config.ts";
import { checkProtected, PATHS } from "../scripts/deployment-smoke.ts";
import { productionConfig } from "../scripts/production-config.ts";

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  NILAY_NEWS_D1_DATABASE_ID: "1e2a3848-8722-45cd-b4d5-a9bcc49a11e4",
  NILAY_PUBLIC_ORIGIN: "https://nilay-news.example.workers.dev",
  CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  CF_ACCESS_AUD: "a".repeat(64),
  CF_ACCESS_ALLOWED_EMAILS: "reader@example.test, editor@example.test",
};
const template = () => loadConfig("wrangler.jsonc");

describe("production config", () => {
  it("fills the template into a config that passes deployment checks", () => {
    const original = JSON.stringify(template());
    const source = template();
    const config = productionConfig(source, ENV);
    expect(JSON.stringify(source)).toBe(original);
    expect(validateConfig(config, true)).toEqual([]);
    expect(config).toMatchObject({
      account_id: ENV.CLOUDFLARE_ACCOUNT_ID,
      name: "nilay-news",
      main: "src/worker.ts",
      workers_dev: true,
      preview_urls: false,
      assets: { binding: "ASSETS", run_worker_first: true },
      d1_databases: [
        { binding: "DB", database_id: ENV.NILAY_NEWS_D1_DATABASE_ID },
      ],
      vars: {
        STORAGE_BACKEND: "d1",
        NILAY_PUBLIC_ORIGIN: ENV.NILAY_PUBLIC_ORIGIN,
        CF_ACCESS_AUD: ENV.CF_ACCESS_AUD,
      },
    });
    expect(config).not.toHaveProperty("route");
    expect(config).not.toHaveProperty("routes");
  });
  it.each(Object.keys(ENV))("requires %s", (name) => {
    expect(() => productionConfig(template(), { ...ENV, [name]: " " })).toThrow(
      name,
    );
  });
  it.each([
    ["CLOUDFLARE_ACCOUNT_ID", "0123456789ABCDEF0123456789ABCDEF"],
    ["NILAY_NEWS_D1_DATABASE_ID", "00000000-0000-0000-0000-000000000000"],
    ["NILAY_NEWS_D1_DATABASE_ID", "nilay-news"],
    ["NILAY_PUBLIC_ORIGIN", "http://nilay-news.example.workers.dev"],
    ["NILAY_PUBLIC_ORIGIN", "https://nilay-news.example.workers.dev/"],
    ["NILAY_PUBLIC_ORIGIN", "https://nilay-news.example.workers.dev:8443"],
    ["NILAY_PUBLIC_ORIGIN", "https://news.example.test"],
    ["NILAY_PUBLIC_ORIGIN", "https://other-worker.example.workers.dev"],
    ["NILAY_PUBLIC_ORIGIN", "https://0123abcd-nilay-news.example.workers.dev"],
    ["NILAY_PUBLIC_ORIGIN", "https://nilay-news.a.b.workers.dev"],
    ["CF_ACCESS_TEAM_DOMAIN", "https://example.cloudflareaccess.com"],
    ["CF_ACCESS_TEAM_DOMAIN", "example.example.test"],
    ["CF_ACCESS_AUD", "a b"],
    ["CF_ACCESS_ALLOWED_EMAILS", "*@example.test"],
    ["CF_ACCESS_ALLOWED_EMAILS", "reader@example.test,"],
    // Passes the config pattern but fails the Worker's stricter Access check.
    ["CF_ACCESS_ALLOWED_EMAILS", "reader..name@example.test"],
  ])("rejects malformed %s (%s)", (name, value) => {
    expect(() =>
      productionConfig(template(), { ...ENV, [name]: value }),
    ).toThrow();
  });
  it("rejects templates that already target an account, route or public hostname", () => {
    for (const extra of [
      { account_id: ENV.CLOUDFLARE_ACCOUNT_ID },
      { routes: [] },
      { route: "news.example.test/*" },
      { workers_dev: true },
      { preview_urls: true },
    ])
      expect(() =>
        productionConfig({ ...(template() as object), ...extra }, ENV),
      ).toThrow(/unexpected shape/);
  });

  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });
  function write(env: Record<string, string>) {
    const directory = mkdtempSync(join(tmpdir(), "nilay-news-config-"));
    directories.push(directory);
    const output = join(directory, "wrangler.production.jsonc");
    const result = spawnSync(
      process.execPath,
      ["scripts/production-config.ts", output],
      { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" },
    );
    return { output, result };
  }
  it("writes a private config file that check-config accepts", () => {
    const { output, result } = write(ENV);
    expect(result.status).toBe(0);
    expect(statSync(output).mode & 0o077).toBe(0);
    expect(validateConfig(loadConfig(output), true)).toEqual([]);
    expect(readFileSync(output, "utf8")).toContain(ENV.CF_ACCESS_AUD);
  });
  it("fails without writing or echoing the allowed emails", () => {
    const { output, result } = write({
      ...ENV,
      CF_ACCESS_ALLOWED_EMAILS: "secret-reader@example.test,*",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/CF_ACCESS_ALLOWED_EMAILS/);
    expect(result.stderr).not.toContain("secret-reader");
    expect(() => statSync(output)).toThrow();
  });
});

describe("deployment smoke", () => {
  const settings = {
    origin: ENV.NILAY_PUBLIC_ORIGIN,
    teamDomain: ENV.CF_ACCESS_TEAM_DOMAIN,
    audience: ENV.CF_ACCESS_AUD,
  };
  const login = (
    host = "nilay-news.example.workers.dev",
    kid = ENV.CF_ACCESS_AUD,
  ) =>
    `https://${ENV.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/login/${host}?kid=${kid}&redirect_url=%2F`;
  function server(respond: (url: string) => Response) {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return Promise.resolve(respond(url));
    };
    return { requests, fetchImpl };
  }
  const redirect = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });

  it("passes when Access gates the page, assets and API", async () => {
    const { requests, fetchImpl } = server(() => redirect(login()));
    await expect(checkProtected(settings, fetchImpl)).resolves.toHaveLength(
      PATHS.length,
    );
    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      ...PATHS,
    ]);
    for (const { init } of requests) expect(init.redirect).toBe("manual");
  });
  it.each([
    ["the page is exposed", () => new Response("<main></main>")],
    [
      "the Worker is reached without Access",
      () => Response.json({ error: "denied" }, { status: 403 }),
    ],
    ["Access settings are missing", () => new Response(null, { status: 503 })],
    [
      "the redirect lacks a location",
      () => new Response(null, { status: 302 }),
    ],
    [
      "the redirect stays on the origin",
      () => redirect(`${ENV.NILAY_PUBLIC_ORIGIN}/login`),
    ],
    [
      "the redirect targets another team",
      () => redirect(login().replace("example.", "other.")),
    ],
    [
      "the redirect targets another application",
      () => redirect(login("other-worker.example.workers.dev")),
    ],
    [
      "the redirect uses another audience",
      () => redirect(login(undefined, "b".repeat(64))),
    ],
    [
      "the redirect is not HTTPS",
      () => redirect(login().replace("https:", "http:")),
    ],
  ])("fails when %s", async (_name, respond) => {
    await expect(
      checkProtected(settings, server(respond).fetchImpl),
    ).rejects.toThrow();
  });
  it("fails when only the API is left open", async () => {
    const { fetchImpl } = server((url) =>
      url.endsWith("/api/state")
        ? Response.json({ articles: [] })
        : redirect(login()),
    );
    await expect(checkProtected(settings, fetchImpl)).rejects.toThrow(
      "/api/state",
    );
  });
  it("rejects a non-canonical origin before sending requests", async () => {
    const { requests, fetchImpl } = server(() => redirect(login()));
    await expect(
      checkProtected(
        { ...settings, origin: `${ENV.NILAY_PUBLIC_ORIGIN}/` },
        fetchImpl,
      ),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

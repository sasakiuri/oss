// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { loadConfig, validateConfig } from "../scripts/check-config.ts";

const template = () =>
  loadConfig("wrangler.jsonc") as {
    [key: string]: unknown;
    vars: Record<string, string>;
    assets: Record<string, unknown>;
    d1_databases: Record<string, unknown>[];
  };
const ORIGIN = "https://nilay-news.example.workers.dev";
function production() {
  const config = template();
  config.workers_dev = true;
  config.d1_databases[0]!.database_id = "1e2a3848-8722-45cd-b4d5-a9bcc49a11e4";
  Object.assign(config.vars, {
    NILAY_PUBLIC_ORIGIN: ORIGIN,
    CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    CF_ACCESS_AUD: "a".repeat(64),
    CF_ACCESS_ALLOWED_EMAILS: "reader@example.test",
  });
  return config;
}

describe("production configuration", () => {
  it("accepts the private template for local checks but rejects an incomplete deployment", () => {
    expect(validateConfig(template())).toEqual([]);
    const errors = validateConfig(template(), true).join(" ");
    expect(errors).toMatch(/workers_dev/);
    expect(errors).toMatch(/placeholder/);
    expect(errors).toMatch(/CF_ACCESS_AUD/);
    expect(validateConfig(production(), true)).toEqual([]);
    expect(validateConfig(production())).toEqual([]);
  });
  it("applies the deployment checks to any config that enables workers.dev", () => {
    const errors = validateConfig({ ...template(), workers_dev: true });
    for (const name of [
      "placeholder",
      "NILAY_PUBLIC_ORIGIN",
      "CF_ACCESS_TEAM_DOMAIN",
      "CF_ACCESS_AUD",
      "CF_ACCESS_ALLOWED_EMAILS",
    ])
      expect(errors.join(" ")).toContain(name);
    const config = production();
    config.vars.CF_ACCESS_AUD = " ";
    expect(validateConfig(config).join(" ")).toMatch(/CF_ACCESS_AUD/);
  });
  it.each([true, null, undefined, "false"])(
    "requires preview_urls to be explicitly disabled (%j)",
    (value) => {
      expect(
        validateConfig({ ...production(), preview_urls: value }, true),
      ).not.toEqual([]);
      expect(
        validateConfig({ ...template(), preview_urls: value }),
      ).not.toEqual([]);
    },
  );
  it.each([false, null, undefined, "true"])(
    "requires workers_dev to be enabled for deployment (%j)",
    (value) => {
      expect(
        validateConfig({ ...production(), workers_dev: value }, true),
      ).not.toEqual([]);
    },
  );
  it.each([null, undefined, "false", 0])(
    "requires workers_dev to be an explicit boolean (%j)",
    (value) => {
      expect(validateConfig({ ...template(), workers_dev: value })).not.toEqual(
        [],
      );
    },
  );
  it.each([false, ["/api/*"], null])(
    "protects all assets with Access (%j)",
    (value) => {
      const config = production();
      config.assets.run_worker_first = value;
      expect(validateConfig(config, true)).not.toEqual([]);
    },
  );
  it.each([
    "BUFFER_API_KEY",
    "TYPESAFE_API_KEY",
    "SLACK_WEBHOOK_URL",
    "CLOUDFLARE_API_TOKEN",
  ])("rejects plaintext %s", (name) => {
    const config = production();
    config.vars[name] = "test-fixture";
    expect(validateConfig(config)).not.toEqual([]);
  });
  it("rejects remote databases, development entrypoints and security overrides", () => {
    const config = production();
    config.d1_databases[0]!.remote = true;
    expect(validateConfig(config)).not.toEqual([]);
    expect(
      validateConfig({ ...production(), main: "src/local-worker.ts" }),
    ).not.toEqual([]);
    expect(
      validateConfig({
        ...production(),
        env: { preview: { workers_dev: true } },
      }),
    ).not.toEqual([]);
    expect(
      validateConfig({ ...production(), unsafe: { bindings: [] } }),
    ).not.toEqual([]);
    expect(
      validateConfig({
        ...production(),
        build: { command: "python build.py" },
      }),
    ).not.toEqual([]);
  });
  it.each([
    { routes: [] },
    { routes: [{ pattern: "news.example.test", custom_domain: true }] },
    { routes: [{ pattern: "nilay-news.example.workers.dev/*" }] },
    { route: "news.example.test/*" },
  ])("rejects routes that could expose another origin (%j)", (extra) => {
    expect(validateConfig({ ...production(), ...extra }, true)).not.toEqual([]);
    expect(validateConfig({ ...template(), ...extra })).not.toEqual([]);
  });
  it.each([
    "http://nilay-news.example.workers.dev",
    "https://nilay-news.example.workers.dev/",
    "https://nilay-news.example.workers.dev:443",
    "https://nilay-news.example.workers.dev/app",
    "https://NILAY-NEWS.example.workers.dev",
    "https://user@nilay-news.example.workers.dev",
    // Preview URLs put a version or alias before the Worker name.
    "https://0123abcd-nilay-news.example.workers.dev",
    "https://staging-nilay-news.example.workers.dev",
    "https://other-worker.example.workers.dev",
    "https://nilay-news.workers.dev",
    "https://nilay-news.team.example.workers.dev",
    "https://nilay-news..workers.dev",
    "https://nilay-news.-example.workers.dev",
    "https://nilay-news.example-.workers.dev",
    "https://nilay-news.exa_mple.workers.dev",
    `https://nilay-news.${"a".repeat(64)}.workers.dev`,
    "https://nilay-news.example.workers.dev.example.test",
    "https://news.example.test",
    "",
  ])("requires the Worker's workers.dev origin, not %j", (origin) => {
    const config = production();
    config.vars.NILAY_PUBLIC_ORIGIN = origin;
    expect(validateConfig(config, true).join(" ")).toMatch(
      /NILAY_PUBLIC_ORIGIN/,
    );
  });
  it("binds the origin to the configured Worker name", () => {
    expect(
      validateConfig({ ...production(), name: "other-worker" }, true),
    ).not.toEqual([]);
    const config = { ...production(), name: "other-worker" };
    config.vars.NILAY_PUBLIC_ORIGIN =
      "https://other-worker.example.workers.dev";
    expect(validateConfig(config, true)).toEqual([]);
    for (const name of [undefined, "", "Nilay-News", "nilay.news"])
      expect(validateConfig({ ...production(), name }, true)).not.toEqual([]);
  });
  it.each(["assets", "vars", "d1_databases"])(
    "rejects malformed %s",
    (name) => {
      expect(
        validateConfig({ ...production(), [name]: null }, true),
      ).not.toEqual([]);
    },
  );
});

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
function production() {
  const config = template();
  config.d1_databases[0]!.database_id = "1e2a3848-8722-45cd-b4d5-a9bcc49a11e4";
  Object.assign(config.vars, {
    NILAY_PUBLIC_ORIGIN: "https://news.example.test",
    CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    CF_ACCESS_AUD: "a".repeat(64),
    CF_ACCESS_ALLOWED_EMAILS: "reader@example.test",
  });
  config.routes = [{ pattern: "news.example.test", custom_domain: true }];
  return config;
}

describe("production configuration", () => {
  it("accepts the private template for local checks but rejects an incomplete deployment", () => {
    expect(validateConfig(template())).toEqual([]);
    expect(validateConfig(template(), true).join(" ")).toMatch(/placeholder/);
    expect(validateConfig(template(), true).join(" ")).toMatch(/CF_ACCESS_AUD/);
    expect(validateConfig(production(), true)).toEqual([]);
  });
  it.each(["workers_dev", "preview_urls"])(
    "requires %s to be explicitly disabled",
    (name) => {
      for (const value of [true, null, undefined])
        expect(
          validateConfig({ ...production(), [name]: value }, true),
        ).not.toEqual([]);
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
    { pattern: "*.example.test/*" },
    { pattern: "other.example.test", custom_domain: true },
    { pattern: "news.example.test", custom_domain: false },
  ])("requires exactly the configured custom domain (%j)", (route) => {
    expect(
      validateConfig({ ...production(), routes: [route] }, true),
    ).not.toEqual([]);
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

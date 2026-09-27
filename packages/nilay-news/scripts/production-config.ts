// SPDX-License-Identifier: MIT
/** Write the ignored production Worker config from the tracked template and deployment environment. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Access } from "../src/access.ts";
import { isRecord } from "../src/text.ts";

import { loadConfig, validateConfig } from "./check-config.ts";

export const ENVIRONMENT = [
  "CLOUDFLARE_ACCOUNT_ID",
  "NILAY_NEWS_D1_DATABASE_ID",
  "NILAY_PUBLIC_ORIGIN",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ALLOWED_EMAILS",
] as const;

export function productionConfig(
  template: unknown,
  env: Partial<Record<string, string>>,
): Record<string, unknown> {
  const missing = ENVIRONMENT.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(`Missing deployment settings: ${missing.join(", ")}`);
  const account = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  if (!/^[a-f\d]{32}$/.test(account))
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a Cloudflare account ID");
  if (
    !isRecord(template) ||
    !isRecord(template.vars) ||
    !Array.isArray(template.d1_databases) ||
    !isRecord(template.d1_databases[0]) ||
    "account_id" in template ||
    template.workers_dev !== false ||
    validateConfig(template).length
  )
    throw new Error("The Worker template has an unexpected shape");
  const origin = env.NILAY_PUBLIC_ORIGIN ?? "";
  // Production serves only the default workers.dev hostname, never previews or routes.
  const config = {
    ...template,
    account_id: account,
    workers_dev: true,
    preview_urls: false,
    d1_databases: [
      {
        ...template.d1_databases[0],
        database_id: env.NILAY_NEWS_D1_DATABASE_ID,
      },
      ...template.d1_databases.slice(1),
    ],
    vars: {
      ...template.vars,
      NILAY_PUBLIC_ORIGIN: origin,
      CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN,
      CF_ACCESS_AUD: env.CF_ACCESS_AUD,
      CF_ACCESS_ALLOWED_EMAILS: env.CF_ACCESS_ALLOWED_EMAILS,
    },
  };
  const errors = validateConfig(config, true);
  if (errors.length) throw new Error(errors.join("\n"));
  // The Worker answers 503 for settings its own Access check rejects.
  let accepted = false;
  try {
    accepted =
      new Access(config.vars as Record<string, string>).origin === origin;
  } catch {
    accepted = false;
  }
  if (!accepted)
    throw new Error("The Worker rejects the Cloudflare Access settings");
  return config;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const config = productionConfig(loadConfig("wrangler.jsonc"), process.env);
    writeFileSync(
      process.argv[2] ?? "wrangler.production.jsonc",
      `${JSON.stringify(config, null, 2)}\n`,
      { mode: 0o600, flag: "w" },
    );
    console.log("Production Worker configuration written");
  } catch (error) {
    // Validation messages name settings, never their values.
    console.error(error instanceof Error ? error.message : "Invalid settings");
    process.exitCode = 1;
  }
}

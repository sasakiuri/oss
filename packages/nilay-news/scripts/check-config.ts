// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parse, type ParseError } from "jsonc-parser";

import { isRecord } from "../src/text.ts";

const ACCESS = [
  "NILAY_PUBLIC_ORIGIN",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ALLOWED_EMAILS",
];
const SECRETS = [
  "BUFFER_API_KEY",
  "TYPESAFE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "SLACK_WEBHOOK_URL",
];

export function loadConfig(path: string): unknown {
  const errors: ParseError[] = [];
  const config: unknown = parse(readFileSync(path, "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length) throw new Error("Invalid Worker JSONC configuration");
  return config;
}

export function validateConfig(config: unknown, deployment = false): string[] {
  if (!isRecord(config)) return ["Worker configuration must be an object"];
  const errors: string[] = [];
  for (const name of ["workers_dev", "preview_urls"])
    if (config[name] !== false) errors.push(`${name} must be explicitly false`);
  const assets = config.assets;
  if (
    !isRecord(assets) ||
    assets.binding !== "ASSETS" ||
    assets.run_worker_first !== true ||
    assets.directory !== "./public"
  ) {
    errors.push("ASSETS must serve ./public through run_worker_first=true");
  }
  if (config.main !== "src/worker.ts")
    errors.push("main must use the production src/worker.ts entrypoint");
  if ("build" in config || "base_dir" in config || "python_modules" in config)
    errors.push(
      "Custom staging and Python runtime configuration are not supported",
    );
  if (config.env)
    errors.push(
      "Use a separate complete config for each target, without env overrides",
    );
  if (config.route)
    errors.push("Use routes with an explicit custom_domain instead of route");
  if (config.unsafe) errors.push("unsafe binding overrides are not supported");
  const variables = isRecord(config.vars) ? config.vars : {};
  if (!isRecord(config.vars)) errors.push("vars must be an object");
  if (variables.STORAGE_BACKEND !== "d1")
    errors.push("STORAGE_BACKEND must be d1");
  if (SECRETS.some((name) => name in variables))
    errors.push("API credentials must use Worker secrets, not vars");
  for (const name of ACCESS) {
    const value = variables[name];
    if (typeof value !== "string")
      errors.push(`vars must include ${name} as a string`);
    else if (deployment && !value.trim())
      errors.push(`${name} must be configured before deployment`);
  }
  const databases = config.d1_databases;
  if (
    !Array.isArray(databases) ||
    databases.length !== 1 ||
    !isRecord(databases[0])
  ) {
    errors.push("Exactly one D1 database binding is required");
  } else {
    const db = databases[0];
    if (db.binding !== "DB") errors.push("D1 database binding must be DB");
    if (db.remote !== false)
      errors.push("D1 remote must be explicitly false for local development");
    if (db.migrations_dir !== "migrations")
      errors.push("D1 migrations_dir must be migrations");
    if (
      typeof db.database_id !== "string" ||
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(db.database_id)
    ) {
      errors.push("D1 database_id must be a UUID");
    } else if (deployment && /^0{8}(?:-0{4}){3}-0{12}$/.test(db.database_id))
      errors.push("Replace the placeholder D1 database_id before deployment");
  }
  if (deployment) {
    const origin = variables.NILAY_PUBLIC_ORIGIN;
    let host: string | undefined;
    if (typeof origin === "string") {
      try {
        const url = new URL(origin);
        if (
          url.protocol === "https:" &&
          origin === `https://${url.hostname}` &&
          /^[a-z0-9.-]+$/.test(url.hostname)
        )
          host = url.hostname;
      } catch {
        /* Report the invalid origin below. */
      }
    }
    if (!host)
      errors.push(
        "NILAY_PUBLIC_ORIGIN must be a canonical HTTPS origin without a port",
      );
    const routes = config.routes;
    if (
      !host ||
      !Array.isArray(routes) ||
      routes.length !== 1 ||
      !isRecord(routes[0]) ||
      routes[0].pattern !== host ||
      routes[0].custom_domain !== true ||
      Object.keys(routes[0]).length !== 2
    ) {
      errors.push(
        "routes must contain only the public origin's explicit custom domain",
      );
    }
    if (
      typeof variables.CF_ACCESS_TEAM_DOMAIN !== "string" ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(
        variables.CF_ACCESS_TEAM_DOMAIN,
      )
    )
      errors.push(
        "CF_ACCESS_TEAM_DOMAIN must be a Cloudflare Access team hostname",
      );
    if (
      typeof variables.CF_ACCESS_AUD !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(variables.CF_ACCESS_AUD)
    )
      errors.push("CF_ACCESS_AUD must contain one audience tag");
    if (
      typeof variables.CF_ACCESS_ALLOWED_EMAILS !== "string" ||
      !variables.CF_ACCESS_ALLOWED_EMAILS.split(",").every((email) =>
        /^[^\s@*,]+@[^\s@*,]+\.[^\s@*,]+$/.test(email.trim()),
      )
    )
      errors.push(
        "CF_ACCESS_ALLOWED_EMAILS must contain explicit email addresses",
      );
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    const errors = validateConfig(
      loadConfig(args.find((arg) => !arg.startsWith("--")) ?? "wrangler.jsonc"),
      args.includes("--deployment"),
    );
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log("Worker configuration controls OK");
  } catch {
    console.error("Worker configuration could not be read");
    process.exitCode = 1;
  }
}

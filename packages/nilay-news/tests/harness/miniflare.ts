// SPDX-License-Identifier: MIT
import { generateKeyPairSync, sign } from "node:crypto";

import { build } from "esbuild";
import { Miniflare, Response as MiniflareResponse } from "miniflare";

import {
  MIGRATION_FILES,
  migration,
  migrationStatements,
} from "./migrations.ts";

export const workerOrigin = "https://news.example.test";
export const accessBindings = {
  NILAY_PUBLIC_ORIGIN: workerOrigin,
  CF_ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com",
  CF_ACCESS_AUD: "fixture-audience",
  CF_ACCESS_ALLOWED_EMAILS: "reader@example.test",
};

export async function bundle(entry: string) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    metafile: true,
  });
  return {
    script: result.outputFiles[0]!.text,
    inputs: Object.keys(result.metafile.inputs),
  };
}

export function runtimeFor(
  script: string,
  bindings: Record<string, string>,
  storage = true,
  options: { name?: string; databaseId?: string } = {},
) {
  return new Miniflare({
    cf: false,
    workers: [
      {
        config: {
          name: options.name ?? "nilay-news-test",
          compatibilityDate: "2026-09-27",
          manifest: {
            mainModule: "worker.js",
            modules: { "worker.js": { type: "esm", contents: script } },
          },
          env: {
            ...Object.fromEntries(
              Object.entries(bindings).map(([name, value]) => [
                name,
                { type: "text" as const, value },
              ]),
            ),
            ...(storage
              ? {
                  DB: { type: "d1" as const, id: options.databaseId ?? "test" },
                  ASSETS: { type: "assets" as const },
                }
              : {}),
          },
          ...(storage
            ? {
                assets: {
                  directory: "./public",
                  runWorkerFirst: true,
                  hasUserWorker: true,
                },
              }
            : {}),
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: () =>
              new MiniflareResponse("Unexpected external request", {
                status: 503,
              }),
          },
        },
      },
    ],
  });
}

export function accessToken(kid = "runtime", expiresAt = 1_801_010_000) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    alg: "RS256",
    use: "sig",
  };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "RS256", kid })}.${encode({
    iss: "https://fixture.cloudflareaccess.com",
    aud: ["fixture-audience"],
    sub: "reader",
    email: "reader@example.test",
    iat: 1_800_999_900,
    exp: expiresAt,
  })}`;
  const token = `${content}.${sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url")}`;
  return { token, jwks: JSON.stringify({ keys: [jwk] }) };
}

export async function migrateRuntime(runtime: Miniflare): Promise<void> {
  const db = await runtime.getD1Database("DB");
  const statements = migrationStatements(
    MIGRATION_FILES.map(migration).join(";\n"),
  );
  await db.batch(statements.map((sql) => db.prepare(sql)));
}

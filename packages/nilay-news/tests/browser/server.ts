// SPDX-License-Identifier: MIT
/** Loopback-only test proxy. It signs fixture JWTs; no production auth bypass is bundled. */
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { build } from "esbuild";
import { Miniflare, Response as MiniflareResponse } from "miniflare";

const port = Number(process.env.NILAY_BROWSER_PORT ?? 4179);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid fixture port");
const localOrigin = `http://127.0.0.1:${port}`;
const workerOrigin = "https://news.example.test";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "browser",
  alg: "RS256",
  use: "sig",
};
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const content = `${encode({ alg: "RS256", kid: "browser" })}.${encode({
  iss: "https://fixture.cloudflareaccess.com",
  aud: ["fixture-audience"],
  sub: "reader",
  email: "reader@example.test",
  iat: 1_800_999_900,
  exp: 1_802_000_000,
})}`;
const token = `${content}.${sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url")}`;
const result = await build({
  entryPoints: ["tests/browser/fixture.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const script = result.outputFiles[0]!.text;
const directory = new URL("../../migrations/", import.meta.url);
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .flatMap((name) =>
    readFileSync(new URL(name, directory), "utf8")
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean),
  );

async function createRuntime() {
  const runtime = new Miniflare({
    cf: false,
    workers: [
      {
        config: {
          name: "nilay-news-browser-test",
          compatibilityDate: "2026-09-27",
          manifest: {
            mainModule: "worker.js",
            modules: { "worker.js": { type: "esm", contents: script } },
          },
          env: {
            STORAGE_BACKEND: { type: "text", value: "d1" },
            NILAY_PUBLIC_ORIGIN: { type: "text", value: workerOrigin },
            CF_ACCESS_TEAM_DOMAIN: {
              type: "text",
              value: "fixture.cloudflareaccess.com",
            },
            CF_ACCESS_AUD: { type: "text", value: "fixture-audience" },
            CF_ACCESS_ALLOWED_EMAILS: {
              type: "text",
              value: "reader@example.test",
            },
            TEST_JWKS: { type: "text", value: JSON.stringify({ keys: [jwk] }) },
            DB: { type: "d1", id: "isolated-browser-test" },
            ASSETS: { type: "assets" },
          },
          assets: {
            directory: "./public",
            runWorkerFirst: true,
            hasUserWorker: true,
          },
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
  const db = await runtime.getD1Database("DB");
  await db.batch(migrations.map((sql) => db.prepare(sql)));
  return runtime;
}
let runtime = await createRuntime();

async function handle(request: IncomingMessage, response: ServerResponse) {
  if (
    request.headers.host !== `127.0.0.1:${port}` ||
    (request.headers.origin !== undefined &&
      request.headers.origin !== localOrigin)
  ) {
    response.writeHead(403);
    response.end("Fixture origin denied");
    return;
  }
  const url = new URL(request.url ?? "/", localOrigin);
  if (url.origin !== localOrigin) {
    response.writeHead(403);
    response.end("Fixture host denied");
    return;
  }
  if (url.pathname === "/__test/health") {
    response.end("ready");
    return;
  }
  if (url.pathname === "/__test/reset" && request.method === "POST") {
    const previous = runtime;
    runtime = await createRuntime();
    await previous.dispose();
    response.end("reset");
    return;
  }
  if (url.pathname === "/__test/tick" && request.method === "POST") {
    const worker = await runtime.getWorker();
    await worker.scheduled({ cron: "* * * * *" });
    response.end("tick");
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > 65536) {
      response.writeHead(413);
      response.end("Fixture request too large");
      return;
    }
    chunks.push(bytes);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (
      value !== undefined &&
      ![
        "host",
        "content-length",
        "connection",
        "cf-access-jwt-assertion",
        "origin",
      ].includes(key)
    )
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("cf-access-jwt-assertion", token);
  if (request.headers.origin) headers.set("Origin", workerOrigin);
  const method = request.method ?? "GET";
  const upstream = await runtime.dispatchFetch(
    workerOrigin + url.pathname + url.search,
    {
      method,
      headers: Object.fromEntries(headers),
      ...(["GET", "HEAD"].includes(method)
        ? {}
        : { body: Buffer.concat(chunks) }),
    },
  );
  response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
  response.end(Buffer.from(await upstream.arrayBuffer()));
}
const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    console.error("Browser fixture request failed", error);
    if (!response.headersSent) response.writeHead(500);
    response.end("Fixture failure");
  });
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Browser fixture ready at ${localOrigin}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close();
    void runtime.dispose().finally(() => process.exit(0));
  });

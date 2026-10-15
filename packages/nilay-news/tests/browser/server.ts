// SPDX-License-Identifier: MIT
/** Loopback-only test proxy. It signs fixture JWTs; no production auth bypass is bundled. */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  accessBindings,
  workerOrigin,
  accessToken,
  bundle,
  runtimeFor,
  migrateRuntime,
} from "../harness/miniflare.ts";

const port = Number(process.env.NILAY_BROWSER_PORT ?? 4179);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid fixture port");
const localOrigin = `http://127.0.0.1:${port}`;
const { token, jwks } = accessToken("browser", 1_802_000_000);
const { script } = await bundle("tests/browser/fixture.ts");

async function createRuntime() {
  const runtime = runtimeFor(
    script,
    { ...accessBindings, TEST_JWKS: jwks },
    true,
    {
      name: "nilay-news-browser-test",
      databaseId: "isolated-browser-test",
    },
  );
  await migrateRuntime(runtime);
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

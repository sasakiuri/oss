// SPDX-License-Identifier: MIT
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wrangler = require.resolve("wrangler");
const config = "wrangler.local.jsonc";
const migration = spawnSync(
  process.execPath,
  [wrangler, "d1", "migrations", "apply", "DB", "--local", "--config", config],
  { stdio: "inherit" },
);
if (migration.error || migration.status !== 0)
  process.exit(migration.status ?? 1);

const server = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "4317",
    "--config",
    config,
    "--config",
    "wrangler.feeds.jsonc",
  ],
  { stdio: "inherit" },
);
const origin = "http://127.0.0.1:4317";
const shutdown = new AbortController();
let running = false;
let ready = false;
let nextTick = 0;
const timer = setInterval(() => {
  if (running || (ready && Date.now() < nextTick)) return;
  running = true;
  void (async () => {
    try {
      if (!ready) {
        const response = await fetch(origin, {
          signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(1000)]),
        });
        await response.body?.cancel();
        if (!response.ok) return;
        ready = true;
      }
      nextTick = Date.now() + 60_000;
      const response = await fetch(`${origin}/__scheduled`, {
        method: "POST",
        headers: { Origin: origin },
        signal: AbortSignal.any([
          shutdown.signal,
          AbortSignal.timeout(300_000),
        ]),
      });
      await response.body?.cancel();
      if (!response.ok)
        console.error(
          "Local scheduled execution failed; inspect application status",
        );
    } catch {
      if (ready && !shutdown.signal.aborted)
        console.error("Local scheduled execution did not complete");
    } finally {
      running = false;
    }
  })();
}, 1000);

function stop() {
  clearInterval(timer);
  shutdown.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stop();
    server.kill(signal);
  });
server.on("error", () => {
  stop();
  console.error("Could not start Wrangler");
  process.exitCode = 1;
});
server.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});

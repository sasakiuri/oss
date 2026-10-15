// SPDX-License-Identifier: MIT
/** Observe a natural production cron and read projected D1 health, without exposing application data. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isRecord } from "../src/text.ts";

interface Settings {
  account: string;
  database: string;
  token: string;
  commit: string;
}
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Observe = (url: string, since: number) => Promise<unknown>;

class HealthError extends Error {}

const API = "https://api.cloudflare.com/client/v4";
const WORKER = "nilay-news";
const HEALTH_SQL = `SELECT
  (SELECT count(*) FROM news_meta WHERE id=1) AS initialized,
  (SELECT count(*) FROM news_state WHERE id IN ('settings','job','schedule','publication_batch')) AS state_rows,
  (SELECT count(*) FROM news_sources) AS sources,
  (SELECT count(*) FROM news_articles) AS articles,
  (SELECT count(*) FROM news_posts WHERE json_extract(data,'$.status') IN ('unknown','failed')) AS blocked_posts,
  (SELECT json_extract(data,'$.running') FROM news_state WHERE id='job') AS job_running,
  (SELECT json_extract(data,'$.progress') FROM news_state WHERE id='job') AS job_progress,
  (SELECT json_extract(data,'$.total') FROM news_state WHERE id='job') AS job_total,
  (SELECT json_extract(data,'$.error') IS NOT NULL FROM news_state WHERE id='job') AS job_error,
  (SELECT count(*) FROM news_sources WHERE json_extract(data,'$.lastError') IS NOT NULL) AS sources_with_errors`;

/** Receives events in memory; callers emit only the validated health projection. */
async function observeCron(url: string, since: number): Promise<unknown> {
  const signal = AbortSignal.timeout(300_000);
  const socket = new WebSocket(url, "trace-v1");
  socket.binaryType = "arraybuffer";
  try {
    return await new Promise((accept, reject) => {
      socket.addEventListener("open", () => socket.send('{"debug":false}'));
      socket.addEventListener("message", (message) => {
        try {
          const raw: unknown = JSON.parse(
            typeof message.data === "string"
              ? message.data
              : new TextDecoder().decode(message.data as ArrayBuffer),
          );
          if (
            isRecord(raw) &&
            isRecord(raw.event) &&
            typeof raw.event.cron === "string" &&
            typeof raw.event.scheduledTime === "number" &&
            raw.event.scheduledTime >= since
          )
            accept(raw);
        } catch {
          reject(new HealthError("Production tail returned an invalid event"));
        }
      });
      socket.addEventListener("error", () =>
        reject(new HealthError("Production tail connection failed")),
      );
      socket.addEventListener("close", () =>
        reject(
          new HealthError("Production tail closed before observing a cron"),
        ),
      );
      signal.addEventListener(
        "abort",
        () =>
          reject(
            new HealthError("No production cron completed within 5 minutes"),
          ),
        { once: true },
      );
    });
  } finally {
    socket.close();
  }
}

export async function checkProductionHealth(
  settings: Settings,
  fetchImpl: Fetch = fetch,
  observe: Observe = observeCron,
): Promise<Record<string, number | string>> {
  const { account, database, token, commit } = settings;
  if (
    !/^[a-f\d]{32}$/.test(account) ||
    !/^[a-f\d-]{36}$/.test(database) ||
    !/^[a-f\d]{40}$/.test(commit) ||
    !token.trim()
  )
    throw new HealthError("Production health settings are missing or invalid");
  async function api(path: string, method = "GET", body?: object) {
    let response: Response;
    try {
      response = await fetchImpl(`${API}/accounts/${account}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HealthError("Cloudflare production health request failed");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new HealthError(
        `Cloudflare production health returned HTTP ${response.status}`,
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new HealthError(
        "Cloudflare production health returned invalid JSON",
      );
    }
    if (!isRecord(raw) || raw.success !== true)
      throw new HealthError(
        "Cloudflare production health request was rejected",
      );
    return raw.result;
  }
  const script = `workers/scripts/${WORKER}`;
  async function deployedVersion(): Promise<string> {
    const result = await api(`${script}/deployments`);
    const deployment =
      isRecord(result) && Array.isArray(result.deployments)
        ? result.deployments[0]
        : undefined;
    const versions: unknown = isRecord(deployment)
      ? deployment.versions
      : undefined;
    const version: unknown =
      Array.isArray(versions) && versions.length === 1 ? versions[0] : null;
    if (
      !isRecord(version) ||
      version.percentage !== 100 ||
      typeof version.version_id !== "string" ||
      !/^[a-f\d-]{36}$/.test(version.version_id)
    )
      throw new HealthError(
        "Production must serve a single version at 100% traffic",
      );
    const details = await api(
      `${script}/versions/${encodeURIComponent(version.version_id)}`,
    );
    if (
      !isRecord(details) ||
      !isRecord(details.annotations) ||
      details.annotations["workers/message"] !== commit
    )
      throw new HealthError(
        "The production version does not match the deployed commit",
      );
    return version.version_id;
  }
  const version = await deployedVersion();
  const tail = await api(`${script}/tails`, "POST", {
    filters: [{ scriptVersion: version }],
  });
  if (!isRecord(tail) || typeof tail.id !== "string")
    throw new HealthError("Cloudflare did not create a production tail");
  try {
    if (typeof tail.url !== "string" || new URL(tail.url).protocol !== "wss:")
      throw new HealthError(
        "Cloudflare returned an invalid production tail URL",
      );
    const since = Date.now();
    const observation = await observe(tail.url, since);
    if (
      !isRecord(observation) ||
      !isRecord(observation.scriptVersion) ||
      observation.scriptVersion.id !== version ||
      !isRecord(observation.event) ||
      observation.event.cron !== "* * * * *" ||
      typeof observation.event.scheduledTime !== "number" ||
      observation.event.scheduledTime < since ||
      !Number.isFinite(observation.event.scheduledTime) ||
      observation.event.scheduledTime > Date.now() ||
      observation.outcome !== "ok" ||
      observation.truncated !== false ||
      !Array.isArray(observation.exceptions) ||
      observation.exceptions.length > 0 ||
      !Array.isArray(observation.logs) ||
      observation.logs.some(
        (log: unknown) => isRecord(log) && log.level === "error",
      )
    )
      throw new HealthError(
        "The deployed production cron did not complete cleanly",
      );
    const result = await api(`d1/database/${database}/query`, "POST", {
      sql: HEALTH_SQL,
    });
    const query: unknown =
      Array.isArray(result) && result.length === 1 ? result[0] : null;
    const health: unknown =
      isRecord(query) && Array.isArray(query.results) ? query.results[0] : null;
    const fields = [
      "initialized",
      "state_rows",
      "sources",
      "articles",
      "blocked_posts",
      "job_running",
      "job_progress",
      "job_total",
      "job_error",
      "sources_with_errors",
    ];
    if (
      !isRecord(query) ||
      query.success !== true ||
      !isRecord(health) ||
      fields.some(
        (key) => !Number.isSafeInteger(health[key]) || Number(health[key]) < 0,
      ) ||
      health.initialized !== 1 ||
      health.state_rows !== 4 ||
      Number(health.sources) < 1 ||
      ![0, 1].includes(Number(health.job_running)) ||
      ![0, 1].includes(Number(health.job_error)) ||
      Number(health.job_progress) > Number(health.job_total)
    )
      throw new HealthError(
        "Production D1 state is not initialized or has invalid job progress",
      );
    if ((await deployedVersion()) !== version)
      throw new HealthError(
        "The production deployment changed during verification",
      );
    return {
      version,
      cron: new Date(observation.event.scheduledTime).toISOString(),
      ...Object.fromEntries(fields.map((key) => [key, Number(health[key])])),
    };
  } finally {
    await api(`${script}/tails/${encodeURIComponent(tail.id)}`, "DELETE");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let output: string;
  let failed = false;
  try {
    const health = await checkProductionHealth({
      account: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      database: process.env.NILAY_NEWS_D1_DATABASE_ID ?? "",
      token: process.env.CLOUDFLARE_API_TOKEN ?? "",
      commit: process.env.GITHUB_SHA ?? "",
    });
    output = `PASS production runtime ${JSON.stringify(health)}`;
  } catch (error) {
    // No remote error text or raw log event reaches the public deployment log.
    failed = true;
    output =
      error instanceof HealthError
        ? error.message
        : "Production health verification failed";
  }
  await new Promise<void>((accept, reject) => {
    (failed ? process.stderr : process.stdout).write(`${output}\n`, (error) =>
      error ? reject(error) : accept(),
    );
  });
  // Tail deletion has completed; an unanswered WebSocket close may retain a socket.
  process.exit(failed ? 1 : 0);
}

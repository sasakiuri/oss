// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { checkProductionHealth } from "../scripts/production-health.ts";

const version = "bb38f5ac-456f-4cb1-a3f5-b3f782136bdc";
const settings = {
  account: "a".repeat(32),
  database: "1e2a3848-8722-45cd-b4d5-a9bcc49a11e4",
  token: "private-token",
  commit: "c".repeat(40),
};
const counts = {
  initialized: 1,
  state_rows: 4,
  sources: 10,
  articles: 100,
  blocked_posts: 2,
  job_running: 1,
  job_progress: 3,
  job_total: 10,
  job_error: 0,
  sources_with_errors: 1,
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    let result: unknown;
    if (url.endsWith("/deployments"))
      result = {
        deployments: [{ versions: [{ version_id: version, percentage: 100 }] }],
      };
    else if (url.endsWith(`/versions/${version}`))
      result = { annotations: { "workers/message": settings.commit } };
    else if (url.endsWith("/tails"))
      result = {
        id: "tail-id",
        url: "wss://tail.developers.workers.dev/private-ticket",
      };
    else if (url.endsWith("/query"))
      result = [
        {
          success: true,
          results: [{ ...counts, private_field: "private-content" }],
        },
      ];
    else if (init.method === "DELETE") result = null;
    else throw new Error("Unexpected production API operation");
    return Response.json({ success: true, result });
  };
  const observe = async (_url: string, since: number) => ({
    scriptVersion: { id: version },
    event: { cron: "* * * * *", scheduledTime: since },
    outcome: "ok",
    truncated: false,
    exceptions: [],
    logs: [],
    ...overrides,
  });
  return { calls, fetchImpl, observe };
}

describe("production runtime health", () => {
  it("verifies the commit and a new natural cron, reads only projected health, and deletes its tail", async () => {
    const { calls, fetchImpl, observe } = fixture();
    const result = await checkProductionHealth(settings, fetchImpl, observe);
    expect(result).toMatchObject({ version, ...counts });
    expect(result).not.toHaveProperty("private_field");
    const query = calls.find(({ url }) => url.endsWith("/query"))!;
    const body = JSON.parse(String(query.init.body));
    expect(body.sql).toMatch(/^SELECT/);
    expect(body.sql).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP)\b/,
    );
    expect(
      calls
        .filter(({ init }) => init.method !== "GET")
        .map(({ url, init }) => [
          new URL(url).pathname.split("/").at(-1),
          init.method,
        ]),
    ).toEqual([
      ["tails", "POST"],
      ["query", "POST"],
      ["tail-id", "DELETE"],
    ]);
    expect(calls.at(-1)?.init.method).toBe("DELETE");
  });
  it.each([
    { scriptVersion: { id: "older-version" } },
    { scriptVersion: null },
    { event: { cron: "* * * * *", scheduledTime: 0 } },
    { outcome: "exception" },
    { truncated: true },
    { truncated: undefined },
    { exceptions: [{ message: "private-content" }] },
    { logs: [{ level: "error", message: "private-content" }] },
    { exceptions: null },
    { logs: null },
  ])("rejects an unverified cron and cleans up (%j)", async (override) => {
    const { calls, fetchImpl, observe } = fixture(override);
    await expect(
      checkProductionHealth(settings, fetchImpl, observe),
    ).rejects.toThrow("did not complete cleanly");
    expect(calls.at(-1)?.init.method).toBe("DELETE");
    expect(calls.some(({ url }) => url.endsWith("/query"))).toBe(false);
  });
  it("cleans up a tail after the observation times out", async () => {
    const { calls, fetchImpl } = fixture();
    await expect(
      checkProductionHealth(settings, fetchImpl, async () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow("timeout");
    expect(calls.at(-1)?.url).toMatch(/\/tails\/tail-id$/);
  });
  it("refuses a different commit before opening a tail", async () => {
    const { calls, fetchImpl, observe } = fixture();
    await expect(
      checkProductionHealth(
        { ...settings, commit: "d".repeat(40) },
        fetchImpl,
        observe,
      ),
    ).rejects.toThrow("does not match");
    expect(calls.every(({ init }) => init.method === "GET")).toBe(true);
  });
  it("rejects invalid D1 state and cleans up", async () => {
    const { calls, fetchImpl, observe } = fixture();
    await expect(
      checkProductionHealth(
        settings,
        async (url, init) =>
          url.endsWith("/query")
            ? Response.json({
                success: true,
                result: [
                  { success: true, results: [{ ...counts, job_progress: 11 }] },
                ],
              })
            : fetchImpl(url, init),
        observe,
      ),
    ).rejects.toThrow("invalid job progress");
    expect(calls.at(-1)?.init.method).toBe("DELETE");
  });
  it("does not include remote error bodies or credentials in API failures", async () => {
    const { observe } = fixture();
    await expect(
      checkProductionHealth(
        settings,
        async () => new Response(settings.token, { status: 403 }),
        observe,
      ),
    ).rejects.toThrow("HTTP 403");
    await expect(
      checkProductionHealth(
        settings,
        async () => {
          throw new Error(settings.token);
        },
        observe,
      ),
    ).rejects.toThrow("request failed");
  });
  it("redacts unexpected native errors from the command's public output", () => {
    const preload = `globalThis.fetch = async (url) => {
      const result = url.endsWith('/deployments')
        ? {deployments:[{versions:[{version_id:'${version}',percentage:100}]}]}
        : url.includes('/versions/')
          ? {annotations:{'workers/message':'${settings.commit}'}}
          : url.endsWith('/tails')
            ? {id:'tail-id',url:'private-invalid-tail-url'}
            : null;
      return Response.json({success:true,result});
    };`;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        `data:text/javascript,${encodeURIComponent(preload)}`,
        "scripts/production-health.ts",
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          CLOUDFLARE_ACCOUNT_ID: settings.account,
          NILAY_NEWS_D1_DATABASE_ID: settings.database,
          CLOUDFLARE_API_TOKEN: settings.token,
          GITHUB_SHA: settings.commit,
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Production health verification failed");
    expect(result.stderr).not.toContain("private-invalid-tail-url");
    expect(result.stderr).not.toContain(settings.token);
    expect(result.stdout).toBe("");
  });
  it("fails if tail deletion fails", async () => {
    const { fetchImpl, observe } = fixture();
    await expect(
      checkProductionHealth(
        settings,
        async (url, init) =>
          init.method === "DELETE"
            ? new Response("private-content", { status: 500 })
            : fetchImpl(url, init),
        observe,
      ),
    ).rejects.toThrow("HTTP 500");
  });
});

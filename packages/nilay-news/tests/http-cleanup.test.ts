// SPDX-License-Identifier: MIT
import { getEventListeners } from "node:events";

import { describe, expect, it } from "vitest";

import { readBody } from "../src/net/http.ts";

const listeners = (signal: AbortSignal) =>
  getEventListeners(signal, "abort").length;

describe("HTTP body cancellation cleanup", () => {
  it("bounds live listeners across 4096 chunks without a later abort", async () => {
    const controller = new AbortController();
    const { signal } = controller;
    const unrelated = () => undefined;
    signal.addEventListener("abort", unrelated);
    let remaining = 4096;
    let peak = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(stream) {
          peak = Math.max(peak, listeners(signal));
          if (remaining-- > 0) stream.enqueue(new Uint8Array([1]));
          else stream.close();
        },
      },
      { highWaterMark: 0 },
    );
    const data = await readBody({ body, headers: new Headers() }, 4096, signal);
    expect(data).toEqual(new Uint8Array(4096).fill(1));
    expect(peak).toBeLessThanOrEqual(2);
    expect(getEventListeners(signal, "abort")).toEqual([unrelated]);
    expect(signal.aborted).toBe(false);
    expect(body.locked).toBe(false);
    signal.removeEventListener("abort", unrelated);
  });

  it("cleans up after a rejected read without aborting the signal", async () => {
    const { signal } = new AbortController();
    const failure = new Error("stream failed");
    const body = new ReadableStream<Uint8Array>(
      { pull: (stream) => stream.error(failure) },
      { highWaterMark: 0 },
    );
    await expect(
      readBody({ body, headers: new Headers() }, 100, signal),
    ).rejects.toBe(failure);
    expect(listeners(signal)).toBe(0);
    expect(signal.aborted).toBe(false);
    expect(body.locked).toBe(false);
  });

  it.each([false, true])(
    "cleans up after size rejection (advertised=%s)",
    async (advertised) => {
      const { signal } = new AbortController();
      let cancelled = 0;
      const body = new ReadableStream<Uint8Array>(
        {
          pull: (stream) => stream.enqueue(new Uint8Array(2)),
          cancel: () => {
            cancelled += 1;
          },
        },
        { highWaterMark: 0 },
      );
      const headers = new Headers(advertised ? { "content-length": "2" } : {});
      await expect(readBody({ body, headers }, 1, signal)).rejects.toThrow(
        "サイズ",
      );
      expect(listeners(signal)).toBe(0);
      expect(cancelled).toBe(1);
      expect(body.locked).toBe(false);
    },
  );

  it("rejects an already-aborted signal before pulling", async () => {
    const controller = new AbortController();
    const reason = new Error("already stopped");
    controller.abort(reason);
    let pulls = 0;
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull: () => {
          pulls += 1;
        },
        cancel: () => {
          cancelled += 1;
        },
      },
      { highWaterMark: 0 },
    );
    await expect(
      readBody({ body, headers: new Headers() }, 100, controller.signal),
    ).rejects.toBe(reason);
    expect(pulls).toBe(0);
    expect(cancelled).toBe(1);
    expect(listeners(controller.signal)).toBe(0);
    expect(body.locked).toBe(false);
  });

  it.each(["resolve", "reject", "pending"])(
    "releases a pending read promptly when cancellation will %s",
    async (outcome) => {
      const controller = new AbortController();
      const reason = new Error("caller stopped");
      let cancelled = 0;
      const body = new ReadableStream<Uint8Array>(
        {
          cancel: () => {
            cancelled += 1;
            if (outcome === "reject") return Promise.reject(new Error("peer"));
            if (outcome === "pending")
              return new Promise<void>(() => undefined);
            return undefined;
          },
        },
        { highWaterMark: 0 },
      );
      const pending = readBody(
        { body, headers: new Headers() },
        100,
        controller.signal,
      );
      expect(listeners(controller.signal)).toBe(1);
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
      expect(cancelled).toBe(1);
      expect(listeners(controller.signal)).toBe(0);
      expect(body.locked).toBe(false);
    },
  );
});

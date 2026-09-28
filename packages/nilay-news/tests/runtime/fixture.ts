// SPDX-License-Identifier: MIT
import { Access, CONFIG_NAMES } from "../../src/access.ts";
import { Application } from "../../src/application.ts";
import { CachedFetch } from "../../src/crawl.ts";
import { ENDPOINT, Jev } from "../../src/jev.ts";
import { FetchError } from "../../src/net/http.ts";
import type { FetchBytes } from "../../src/net/types.ts";
import { BufferClient } from "../../src/publishing.ts";
import { collectSource } from "../../src/sources/index.ts";
import type { SourceConfig } from "../../src/sources/types.ts";
import { createD1Repository } from "../../src/storage/d1.ts";
import { isRecord, utf8 } from "../../src/text.ts";
import { createHandlers, type Env } from "../../src/worker.ts";

const source: SourceConfig = {
  id: "fixture",
  name: "Fixture",
  description: "Runtime test",
  kind: "rss",
  enabled: true,
  url: "https://example.org/feed",
};
let now = 1_801_000_000;
const calls: string[] = [];
/** Set by `/fixture/classify`: a feed of 12 articles and a working Jev API. */
let classify = false;
const feedItems = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const suffix = index ? String(index) : "";
    return `<item><title>クマの出没と対策${suffix}</title><link>https://example.org/a${suffix}</link><description>市が対策を発表</description><pubDate>${new Date((now - index) * 1000).toUTCString()}</pubDate></item>`;
  }).join("");
const choice = (value: string, names: string[]) => ({
  type: "choice",
  choice: value,
  probabilities: Object.fromEntries(
    names.map((name) => [
      name,
      name === value ? 0.9 : 0.1 / (names.length - 1),
    ]),
  ),
});
const irrelevant = JSON.stringify({
  answers: {
    topic: choice("その他", [
      "狩猟・猟銃",
      "射撃競技",
      "鳥獣被害・管理",
      "ジビエ",
      "制度・行政",
      "その他",
    ]),
    classification: choice("unrelated", [
      "relevant",
      "policy",
      "fiction",
      "unrelated",
      "insufficient",
    ]),
    priority: choice("0", ["0", "1", "2", "3"]),
  },
});
const transport: FetchBytes = async (url, options) => {
  let response: string;
  if (url === "https://example.org/robots.txt")
    response = "User-agent: *\nAllow: /";
  else if (url === source.url)
    response = `<rss><channel>${feedItems(classify ? 12 : 1)}</channel></rss>`;
  else if (url === "https://api.buffer.com" && options?.body) {
    const body: unknown = JSON.parse(new TextDecoder().decode(options.body));
    if (
      !isRecord(body) ||
      typeof body.query !== "string" ||
      !isRecord(body.variables) ||
      !isRecord(body.variables.input)
    )
      throw new Error("Invalid Buffer fixture request");
    const mutation = body.query.startsWith("mutation");
    calls.push(mutation ? "mutation" : "query");
    response = JSON.stringify({
      data: mutation
        ? {
            createPost: {
              __typename: "PostActionSuccess",
              post: {
                id: "fixture-post",
                channelId: "fixture-channel",
                channelService: "twitter",
                text: body.variables.input.text,
                status: "sent",
                externalLink: "https://x.com/NilayNews/status/123",
              },
            },
          }
        : {
            dailyPostingLimits: [
              {
                channelId: "fixture-channel",
                isAtLimit: false,
                limit: 100,
                scheduled: 0,
              },
            ],
            channel: {
              id: "fixture-channel",
              name: "NilayNews",
              service: "twitter",
              allowedActions: ["scheduleUpdates", "readUpdates"],
              isDisconnected: false,
              isLocked: false,
              isQueuePaused: false,
              linkShortening: { isEnabled: false },
            },
          },
    });
  } else throw new Error("Unexpected fixture HTTP request");
  return { data: utf8(response), url, contentType: "application/json" };
};

let control: Access | undefined;
const handlers = createHandlers(
  (env) => {
    control ??= new Access(
      Object.fromEntries(CONFIG_NAMES.map((name) => [name, env[name]])),
      {
        clock: () => now,
        fetcher: async (url) => ({
          data: utf8((env as Env & { TEST_JWKS: string }).TEST_JWKS),
          url,
          contentType: "application/json",
        }),
      },
    );
    return control;
  },
  async (env) => {
    const repo = await createD1Repository(env.DB, [source], () => now);
    return new Application(
      repo,
      // Unless enabled by /fixture/classify, every classification request
      // fails like an unavailable paid API.
      new Jev("fixture-key", "jev-latest", async (url) => {
        if (url !== ENDPOINT) throw new Error("Unexpected Jev request");
        calls.push("jev");
        if (!classify) throw new FetchError("HTTP 503", 503);
        return { data: utf8(irrelevant), url, contentType: "application/json" };
      }),
      new BufferClient("fixture-key", "fixture-channel", transport),
      {
        clock: () => now,
        crawl: new CachedFetch(repo, [source], {
          clock: () => now,
          transport,
          sleep: async (seconds) => {
            now += seconds;
          },
        }),
      },
    );
  },
);

export default {
  ...handlers,
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/fixture/advance") {
      now += 3601;
      return new Response("ok");
    }
    if (path === "/fixture/calls") return Response.json(calls);
    if (path === "/fixture/classify") {
      classify = true;
      return new Response("ok");
    }
    if (path === "/fixture/encodings") {
      const samples: [string, number[]][] = [
        [
          "shift_jis",
          [
            60, 97, 32, 104, 114, 101, 102, 61, 34, 47, 112, 114, 101, 115, 115,
            47, 49, 34, 62, 142, 235, 151, 194, 142, 210, 130, 214, 130, 204,
            136, 192, 145, 83, 145, 206, 141, 244, 130, 240, 148, 173, 149, 92,
            130, 181, 130, 220, 130, 181, 130, 189, 60, 47, 97, 62,
          ],
        ],
        [
          "euc-jp",
          [
            60, 97, 32, 104, 114, 101, 102, 61, 34, 47, 112, 114, 101, 115, 115,
            47, 49, 34, 62, 188, 237, 206, 196, 188, 212, 164, 216, 164, 206,
            176, 194, 193, 180, 194, 208, 186, 246, 164, 242, 200, 175, 201,
            189, 164, 183, 164, 222, 164, 183, 164, 191, 60, 47, 97, 62,
          ],
        ],
      ];
      const titles = [];
      for (const [charset, bytes] of samples) {
        const result = await collectSource(
          { ...source, kind: "html", allowedPathPattern: "^/press/" },
          async (url) => ({
            url,
            data: new Uint8Array(bytes),
            contentType: `text/html; charset=${charset}`,
          }),
        );
        titles.push(result.items[0]?.title);
      }
      return Response.json(titles);
    }
    return handlers.fetch(request, env);
  },
};

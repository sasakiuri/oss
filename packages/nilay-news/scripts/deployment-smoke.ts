// SPDX-License-Identifier: MIT
/** Confirm that an unauthenticated request reaches Cloudflare Access login, never the Worker. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The page, a static asset and an API route must all be gated by the edge.
export const PATHS = ["/", "/app.js", "/api/state"] as const;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function checkProtected(
  settings: { origin: string; teamDomain: string; audience: string },
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const { origin, teamDomain, audience } = settings;
  const host = new URL(origin).hostname;
  if (origin !== `https://${host}`)
    throw new Error("NILAY_PUBLIC_ORIGIN must be a canonical HTTPS origin");
  const results: string[] = [];
  for (const path of PATHS) {
    const response = await fetchImpl(`${origin}${path}`, {
      redirect: "manual",
      // Access redirects browser page requests to its login page.
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    if (![302, 303, 307].includes(response.status))
      throw new Error(
        `${path}: expected an Access login redirect, received HTTP ${response.status}`,
      );
    let login: URL | undefined;
    try {
      login = new URL(response.headers.get("location") ?? "");
    } catch {
      login = undefined;
    }
    if (
      login?.protocol !== "https:" ||
      login.hostname !== teamDomain ||
      login.port ||
      login.pathname !== `/cdn-cgi/access/login/${host}` ||
      login.searchParams.get("kid") !== audience
    )
      throw new Error(
        `${path}: the redirect is not this application's Access login`,
      );
    results.push(`${path}: HTTP ${response.status} to Access login`);
  }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const results = await checkProtected({
      origin: process.env.NILAY_PUBLIC_ORIGIN ?? "",
      teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN ?? "",
      audience: process.env.CF_ACCESS_AUD ?? "",
    });
    for (const result of results) console.log(`PASS ${result}`);
  } catch (error) {
    console.error(
      `Deployment smoke check failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}

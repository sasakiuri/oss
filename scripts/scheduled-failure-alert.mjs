// SPDX-License-Identifier: MIT
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const label = "Cat: CI/CD ⚙️";

export function actionForConclusion(conclusion) {
  if (["failure", "timed_out", "startup_failure"].includes(conclusion))
    return "alert";
  if (conclusion === "success") return "recover";
  return "ignore";
}

export async function updateScheduledFailure(
  { event, name, conclusion, url },
  client,
) {
  if (event !== "schedule") return;
  const action = actionForConclusion(conclusion);
  if (action === "ignore") return;
  const title = `Scheduled workflow failing: ${name}`;
  const issue = (await client.listOpenIssues(label)).find(
    (candidate) => candidate.title === title && !candidate.pull_request,
  );
  const body = `${action === "alert" ? `Scheduled run concluded with ${conclusion}` : "Scheduled run succeeded"}: ${url}`;
  if (issue) {
    await client.comment(issue.number, body);
    if (action === "recover") await client.close(issue.number);
  } else if (action === "alert") {
    await client.create({ title, body, labels: [label] });
  }
}

export function createIssueClient({
  repository,
  token,
  apiUrl = "https://api.github.com",
  request = fetch,
}) {
  const base = `${apiUrl}/repos/${repository}`;
  async function api(path, method = "GET", body) {
    const response = await request(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(`GitHub ${method} ${path} failed (${response.status})`);
    return response.json();
  }
  return {
    async listOpenIssues(issueLabel) {
      const issues = [];
      for (let page = 1; ; page++) {
        const batch = await api(
          `/issues?state=open&labels=${encodeURIComponent(issueLabel)}&per_page=100&page=${page}`,
        );
        issues.push(...batch);
        if (batch.length < 100) return issues;
      }
    },
    create: (issue) => api("/issues", "POST", issue),
    comment: (number, body) =>
      api(`/issues/${number}/comments`, "POST", { body }),
    close: (number) => api(`/issues/${number}`, "PATCH", { state: "closed" }),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
  if (!token || !repository)
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  await updateScheduledFailure(
    {
      event: process.env.RUN_EVENT,
      name: process.env.RUN_NAME,
      conclusion: process.env.RUN_CONCLUSION,
      url: process.env.RUN_URL,
    },
    createIssueClient({
      repository,
      token,
      apiUrl: process.env.GITHUB_API_URL,
    }),
  );
}

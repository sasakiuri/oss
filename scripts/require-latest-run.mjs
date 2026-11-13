// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function requireLatestRun({
  env = process.env,
  execute = execFileSync,
} = {}) {
  const repository = env.LATEST_RUN_REPOSITORY;
  const workflowRef = env.LATEST_RUN_WORKFLOW_REF;
  const branch = env.LATEST_RUN_BRANCH;
  const number = env.LATEST_RUN_NUMBER;
  const id = env.LATEST_RUN_ID;
  for (const value of [
    repository,
    workflowRef,
    branch,
    number,
    id,
    env.GH_TOKEN,
  ])
    if (typeof value !== "string" || !value.trim())
      throw new Error(
        "Latest-run verification requires complete workflow context and a token.",
      );
  const prefix = `${repository}/.github/workflows/`;
  const [workflow, ref, extra] = workflowRef.slice(prefix.length).split("@");
  const runNumber = Number(number);
  const runId = Number(id);
  const positiveInteger = (value) =>
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !workflowRef.startsWith(prefix) ||
    !/^[\w.-]+\.ya?ml$/.test(workflow) ||
    !ref ||
    extra !== undefined ||
    !positiveInteger(number) ||
    !positiveInteger(id)
  )
    throw new Error(
      "Latest-run verification received invalid workflow context.",
    );

  function readApi(endpoint) {
    let output;
    try {
      output = execute("gh", ["api", "--method", "GET", endpoint], {
        env,
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      throw new Error(
        "Unable to verify the latest workflow run: GitHub API request failed.",
      );
    }
    try {
      return JSON.parse(output);
    } catch {
      throw new Error(
        "Unable to verify the latest workflow run: invalid GitHub API response.",
      );
    }
  }

  const current = readApi(`repos/${repository}/actions/runs/${id}`);
  const created = current?.created_at;
  if (
    current?.id !== runId ||
    current?.run_number !== runNumber ||
    current?.head_branch !== branch ||
    typeof created !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(created) ||
    !Number.isFinite(Date.parse(created)) ||
    new Date(created).toISOString() !== created.slice(0, -1) + ".000Z"
  )
    throw new Error(
      "Unable to verify the latest workflow run: invalid current run metadata.",
    );

  // Limit history to this run's creation time, including other runs in the same
  // second. Number comparisons, not conclusions or list order, decide eligibility.
  let totalCount;
  const seenNumbers = new Set();
  let foundCurrent = false;
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({
      branch,
      created: `>=${created}`,
      per_page: "100",
      page: String(page),
    });
    const response = readApi(
      `repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`,
    );
    const runs = response?.workflow_runs;
    if (
      !Array.isArray(runs) ||
      runs.length > 100 ||
      !Number.isSafeInteger(response.total_count) ||
      response.total_count < runs.length ||
      runs.some(
        (run) =>
          !Number.isSafeInteger(run?.id) ||
          run.id < 1 ||
          !Number.isSafeInteger(run.run_number) ||
          run.run_number < 1 ||
          (run.conclusion !== null && typeof run.conclusion !== "string"),
      )
    )
      throw new Error(
        "Unable to verify the latest workflow run: invalid run metadata.",
      );
    const newer = runs.find((run) => run.run_number > runNumber);
    if (newer)
      throw new Error(
        `A newer run #${newer.run_number} exists; no changes will be applied. Approve or rerun the newer run, or start a new run instead of retrying this older run.`,
      );
    if (response.total_count > 1000)
      throw new Error(
        "Unable to read all runs created since this run within GitHub's 1,000-run search limit.",
      );
    if (totalCount !== undefined && totalCount !== response.total_count)
      throw new Error(
        "Workflow runs changed during verification; refusing to apply changes. Retry the latest run.",
      );
    totalCount = response.total_count;
    for (const run of runs) {
      if (seenNumbers.has(run.run_number))
        throw new Error(
          "Duplicate workflow runs appeared during pagination; refusing to apply changes.",
        );
      seenNumbers.add(run.run_number);
      foundCurrent ||= run.id === runId && run.run_number === runNumber;
    }
    if (seenNumbers.size === totalCount && foundCurrent) return true;
    if (runs.length < 100 || seenNumbers.size >= totalCount)
      throw new Error(
        "The complete filtered workflow run history, including this run, was not returned; refusing to apply changes.",
      );
  }
  throw new Error(
    "Unable to read all runs created since this run within GitHub's 1,000-run search limit.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    requireLatestRun();
    console.log("This workflow run is the latest eligible run.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

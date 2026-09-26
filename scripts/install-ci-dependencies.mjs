// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repository = fileURLToPath(new URL("../", import.meta.url));
const provisioningScript = fileURLToPath(
  new URL("./install-windows-browser-deps.ps1", import.meta.url),
);

function runTask(name, command, args, { execute, log }) {
  const started = performance.now();
  log(`Starting ${name}`);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = execute(command, args, {
        cwd: repository,
        stdio: "inherit",
        shell: false,
        // Keep children attached and preserve runner tracking for cancellation.
      });
    } catch (error) {
      reject(
        new Error(`${name} could not start: ${error.message}`, {
          cause: error,
        }),
      );
      return;
    }
    let spawnError;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      const elapsed = Math.round(performance.now() - started);
      if (spawnError || code !== 0 || signal) {
        reject(
          new Error(
            `${name} failed after ${elapsed} ms: ${spawnError?.message ?? (signal ? `signal ${signal}` : `exit ${code}`)}`,
            { cause: spawnError },
          ),
        );
      } else {
        log(`Completed ${name} in ${elapsed} ms`);
        resolve();
      }
    });
  });
}

export async function installCiDependencies({
  platform = process.platform,
  npmCli = process.env.npm_execpath,
  execute = spawn,
  log = console.log,
} = {}) {
  if (platform !== "win32")
    throw new Error("Concurrent browser provisioning requires Windows.");
  if (!npmCli)
    throw new Error("Run this installer through npm run ci:install.");

  const options = { execute, log };
  // Calling the npm CLI through Node avoids Windows .cmd shell quoting.
  // Both tasks must finish, including when either fails, before setup returns.
  const results = await Promise.allSettled([
    runTask("npm ci", process.execPath, [npmCli, "ci"], options),
    runTask(
      "Windows browser dependencies",
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        provisioningScript,
      ],
      options,
    ),
  ]);
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(
      failures,
      failures.map((error) => error.message).join("\n"),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { "windows-browser-deps": { type: "boolean" } },
  });
  if (!values["windows-browser-deps"])
    throw new Error("Expected --windows-browser-deps.");
  try {
    await installCiDependencies();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

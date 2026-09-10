// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { accessSync, readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
let failed = false;
for (const [command, args, expected] of [
  ["node", ["--version"], manifest.volta.node],
  ["npm", ["--version"], manifest.volta.npm],
  ["git", ["--version"], null],
]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = result.stdout?.trim();
  const ok =
    result.status === 0 &&
    (!expected || output?.replace(/^v/, "") === expected);
  console.log(
    `${ok ? "OK" : "FAIL"} ${command}: ${output || "unavailable"}${expected ? ` (expected ${expected})` : ""}`,
  );
  failed ||= !ok;
}
try {
  accessSync("packages/saika-docs/.env.local");
  console.log("OK packages/saika-docs/.env.local");
} catch {
  console.log("FAIL missing packages/saika-docs/.env.local; run make env");
  failed = true;
}
if (process.argv.includes("--docker")) {
  for (const args of [
    ["compose", "version"],
    ["compose", "--profile", "*", "config", "--quiet"],
    ["info", "--format", "{{.ServerVersion}}"],
  ]) {
    const result = spawnSync("docker", args, { encoding: "utf8" });
    console.log(`${result.status === 0 ? "OK" : "FAIL"} docker ${args[0]}`);
    failed ||= result.status !== 0;
  }
}
process.exitCode = failed ? 1 : 0;

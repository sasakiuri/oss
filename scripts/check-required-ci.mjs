// SPDX-License-Identifier: MIT
import { fileURLToPath } from "node:url";

export function requiredChecksPass(needs) {
  if (!needs || typeof needs !== "object") return false;
  if (needs.changes?.result !== "success") return false;
  const outputs = needs.changes.outputs;
  if (
    !["text", "infrastructure", "ci", "build", "docs", "electron"].every(
      (key) => ["true", "false"].includes(outputs?.[key]),
    )
  )
    return false;
  const ci = outputs.ci === "true";
  const build = outputs.build === "true";
  const docs = outputs.docs === "true";
  const electron = outputs.electron === "true";
  if ((electron && !build) || (build && !ci)) return false;
  try {
    const packages = JSON.parse(outputs.packages);
    const os = JSON.parse(outputs.os);
    if (
      !Array.isArray(packages) ||
      packages.some((name) => typeof name !== "string" || !name) ||
      new Set(packages).size !== packages.length ||
      ci !== packages.length > 0
    )
      return false;
    const expected = electron
      ? ["ubuntu-latest", "windows-latest", "macos-latest"]
      : ["ubuntu-latest"];
    if (JSON.stringify(os) !== JSON.stringify(expected)) return false;
  } catch {
    return false;
  }
  return (
    needs.text?.result === (outputs.text === "true" ? "success" : "skipped") &&
    needs.infrastructure?.result ===
      (outputs.infrastructure === "true" ? "success" : "skipped") &&
    needs.lint?.result === (ci ? "success" : "skipped") &&
    needs["build-and-test"]?.result === (build ? "success" : "skipped") &&
    needs.docs?.result === (docs ? "success" : "skipped")
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_JSON);
  } catch {
    // Missing or invalid job results must not turn a failed detector into a pass.
  }
  if (!requiredChecksPass(needs)) {
    console.error("A required check did not succeed.");
    process.exitCode = 1;
  } else console.log("All applicable required checks passed.");
}

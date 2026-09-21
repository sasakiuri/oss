// SPDX-License-Identifier: MIT
import { fileURLToPath } from "node:url";

import {
  e2eMatrix,
  platformRunners,
  readGitWorkspaces,
  usesElectron,
} from "./select-ci-packages.mjs";

export function requiredChecksPass(needs, workspaces) {
  if (!needs || typeof needs !== "object") return false;
  if (needs.changes?.result !== "success") return false;
  const outputs = needs.changes.outputs;
  if (
    ![
      "text",
      "infrastructure",
      "ci",
      "build",
      "docs",
      "electron",
      "knowledge",
      "e2e",
    ].every((key) => ["true", "false"].includes(outputs?.[key]))
  )
    return false;
  const ci = outputs.ci === "true";
  const build = outputs.build === "true";
  const docs = outputs.docs === "true";
  const electron = outputs.electron === "true";
  const knowledge = outputs.knowledge === "true";
  const e2e = outputs.e2e === "true";
  if (((electron || knowledge || e2e) && !build) || (build && !ci))
    return false;
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
    if (knowledge !== packages.includes("@sasakiuri/nilay-knowledge"))
      return false;
    const expected =
      electron || knowledge ? platformRunners : ["ubuntu-latest"];
    if (JSON.stringify(os) !== JSON.stringify(expected)) return false;
    const selected = packages.map((name) =>
      workspaces.find((pkg) => pkg.name === name),
    );
    if (selected.some((pkg) => !pkg)) return false;
    if (electron !== selected.some(usesElectron)) return false;
    const expectedBuild = selected.some((pkg) =>
      ["build", "test", "test:coverage", "test:e2e", "size-limit"].some(
        (task) => pkg.scripts?.[task],
      ),
    );
    if (build !== expectedBuild) return false;
    const expectedMatrix = e2eMatrix(selected, os);
    if (
      e2e !== expectedMatrix.length > 0 ||
      outputs.e2eMatrix !== JSON.stringify(expectedMatrix)
    )
      return false;
  } catch {
    return false;
  }
  return (
    needs.text?.result === (outputs.text === "true" ? "success" : "skipped") &&
    needs.infrastructure?.result ===
      (outputs.infrastructure === "true" ? "success" : "skipped") &&
    needs.lint?.result === (ci ? "success" : "skipped") &&
    needs.build?.result === (build ? "success" : "skipped") &&
    needs.unit?.result === (build ? "success" : "skipped") &&
    needs.e2e?.result === (e2e ? "success" : "skipped") &&
    needs.lighthouse?.result === (knowledge ? "success" : "skipped") &&
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
  if (!requiredChecksPass(needs, readGitWorkspaces("HEAD"))) {
    console.error("A required check did not succeed.");
    process.exitCode = 1;
  } else console.log("All applicable required checks passed.");
}

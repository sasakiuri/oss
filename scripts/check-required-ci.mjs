// SPDX-License-Identifier: MIT
export function requiredChecksPass(needs) {
  if (needs.changes?.result !== "success") return false;
  if (needs.text?.result !== "success") return false;
  const ci = needs.changes.outputs?.ci === "true";
  const docs = needs.changes.outputs?.docs === "true";
  return (
    ["lint", "build-and-test"].every(
      (name) => needs[name]?.result === (ci ? "success" : "skipped"),
    ) && needs.docs?.result === (docs ? "success" : "skipped")
  );
}
if (process.env.NEEDS_JSON) {
  if (!requiredChecksPass(JSON.parse(process.env.NEEDS_JSON))) {
    console.error("A required check did not succeed.");
    process.exitCode = 1;
  } else console.log("All applicable required checks passed.");
}

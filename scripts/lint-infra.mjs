// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

// Use the same immutable tool images locally and in CI. Containers only read
// the checkout and run offline; Docker may download missing images beforehand.
const checks = [
  [
    "koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d",
    "--severity=info",
    ...files.filter(
      (path) =>
        path.endsWith(".sh") ||
        [".husky/pre-commit", ".husky/commit-msg"].includes(path),
    ),
  ],
  [
    "rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667",
  ],
  [
    "hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e",
    "hadolint",
    ...files.filter((path) => /(^|\/)Dockerfile(?:\.[^/]+)?$/.test(path)),
  ],
  [
    "ghcr.io/zizmorcore/zizmor:1.29.0@sha256:863026d54f91271b10b60b67ad8054cb37120167e162482597db102b3026a284",
    "--offline",
    "--no-progress",
    "--min-severity",
    "low",
    ".github",
  ],
];

for (const [image, ...args] of checks) {
  console.log(`Checking infrastructure with ${image.split("@")[0]}`);
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--volume",
      `${root}:/repo:ro`,
      "--workdir",
      "/repo",
      image,
      ...args,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

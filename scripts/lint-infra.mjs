// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function lintInfrastructure({ root }) {
  if (typeof root !== "string" || !root) {
    throw new TypeError(
      "lintInfrastructure requires an explicit repository root.",
    );
  }
  root = resolve(root);
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (path) =>
        path &&
        !path.startsWith(".agents/") &&
        !path.startsWith(".local/") &&
        existsSync(resolve(root, path)),
    );

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
  const hadolintPolicy = resolve(root, ".hadolint.yaml");
  const hasHadolintPolicy = existsSync(hadolintPolicy);

  for (const [image, ...args] of checks) {
    const usesHadolintPolicy =
      hasHadolintPolicy && image.startsWith("hadolint/");
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
        ...(usesHadolintPolicy
          ? [
              "--volume",
              `${realpathSync(hadolintPolicy)}:/policy/hadolint.yaml:ro`,
            ]
          : []),
        image,
        ...(usesHadolintPolicy
          ? [args[0], "--config", "/policy/hadolint.yaml", ...args.slice(1)]
          : args),
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status || 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = lintInfrastructure({
    root: fileURLToPath(new URL("../", import.meta.url)),
  });
}

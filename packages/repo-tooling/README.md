# Repository tooling

This private workspace exposes the checkout's tools and quality policies to
companion repositories through a local `file:` dependency. It is not published
to npm. The public checkout remains independent of every consumer.

Install the upstream checkout first with its pinned Node.js/npm runtime, then
run `node ../oss/packages/repo-tooling/cli.mjs install` from a sibling consumer.
Use `install --ci` for lockfile validation. CI rejects outdated derived metadata
without rewriting tracked files. Runtime metadata, dependency overrides, and
Git attributes refresh during ordinary installation; configuration
modules and binaries resolve directly from this checkout. Initialize upstream
dependencies with `npm ci --ignore-scripts` for browser-only consumers.

Consumer manifests must declare `private: true`. An optional
`repoTooling.upstreamPackage` selects an upstream workspace's tool resolution
profile. Consumers supply workspace paths and file selectors; shared rule
values stay upstream. `repo-tooling run <binary> ...` runs the actual upstream
binary in the caller's working directory. Shared scripts accept explicit
consumer roots instead of discovering targets from their own source files.

`repoTooling.linkedDependencies` names imported tool modules whose links are
created by `prepare`. They resolve from the selected profile on every install,
without running lifecycle scripts from distributed packages. Packages that
must share application peers, such as React Testing Library, belong in
`repoTooling.installedDependencies`: installation derives their exact version
from the upstream installation and npm installs them locally. This keeps
application React and its test renderer on the same module instance. Commit
the resulting lockfile after upstream version changes.

Consumers link `.syncpackrc.json` to `.local/tooling/syncpack.json`; the CLI
regenerates that file from the upstream policy before running Syncpack. Local
selectors and runtime version groups live in `repoTooling.syncpack`.

`check` and `qa` interpret the upstream root's current pipelines and reject
unknown steps. Workspace contracts and tests run where those scripts exist.
Native rebuilds apply only when the consumer declares the named dependency.
Repository-specific artifact checks stay with their owning workspaces.

Commit messages use `type(scope): subject`, require a known workspace or
`repo`, `root`, `monorepo` scope, and allow the same types as the public root.
Directory dots become hyphens so scopes remain kebab-case. The boundary check
allows companion references to this checkout and rejects references to other
checkouts. Running it in the public checkout permits no external repository.

The reusable `consumer-ci.yml` workflow installs sibling checkouts and runs the
same QA entrypoint. Consumers retain deployment and language-specific checks.

Imported module links are relative on POSIX so sibling checkouts remain portable
across host and container paths. Windows uses directory junctions; regenerate
them with `prepare` after relocating checkouts. Both trees must share a drive.
Static boundary checks cover manifests, lockfiles,
symlinks, relative imports, and TypeScript paths; computed runtime references
remain part of code review.

Consumers may set `repoTooling.dockerCompose` to a local Compose file and run
`repo-tooling docker ...`. The wrapper supplies checkout roots and the current
upstream Node.js/npm versions as environment variables. The shared Dockerfile
accepts those versions as build arguments. Install upstream dependencies on
the host before mounting that checkout read-only into a consumer container.

Consumer Turbo tasks always run with `--force`: files from the external tooling
checkout are not included in a consumer-only cache key. Bundlers can use the
exported `toolingWorkspaceRoot` to resolve both checkouts.

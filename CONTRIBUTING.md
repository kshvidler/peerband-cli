# Contributing

## Setup

You need Node.js 22.13 or newer (24 LTS recommended) and npm.

```sh
npm ci
npm run check    # typecheck + lint + build + tests
npm run build    # bundle to dist/peerband.mjs
```

Tests use fakes and never need a real Herdr or relay. Real-Herdr smoke tests must run in an isolated session so they never touch your own agents.

## Trying the plugin locally

```sh
npm run build
herdr --session peerband-dev          # in one terminal: an isolated Herdr session
herdr plugin link .                   # in another terminal, same session (set HERDR_SESSION if needed)
node dist/peerband.mjs relay
```

`peerband herdr install` honours two environment variables for development:

- `PEERBAND_HERDR_SOURCE`: plugin source. Defaults to `kshvidler/peerband-cli`. If it is an existing local directory, `herdr plugin link <dir>` is used instead of an install.
- `PEERBAND_HERDR_REF`: git ref to install. Defaults to `v<version>`.

Set `PEERBAND_CONFIG_HOME` to a scratch directory to keep test credentials away from your real ones. To test the installers against a local build, run `npm pack` and set `PEERBAND_PACKAGE` to the tarball path.

## Continuous integration

CI is deliberately small: one Linux job on Node 22 per push to `main` (docs-only changes are skipped), capped at 10 minutes. Run `npm run check` locally before pushing; locally it also runs the PowerShell installer tests, which CI skips because PowerShell starts too slowly on hosted runners. A single Windows or macOS check can be started manually from the `ci` workflow (macOS minutes bill at 10x and Windows at 2x on private repositories), so use it sparingly.

## Releasing

Releases are cut by the `release` workflow (Actions, Run workflow) and never by a tag push:

1. Bump `version` in `package.json` and `herdr-plugin.toml`, and merge to `main`.
2. Run the workflow with the same version. It refuses to continue if the versions differ.
3. The workflow runs the checks, builds, commits `dist/` on a detached HEAD, pushes only the annotated tag `vX.Y.Z` (it fails if the tag exists), publishes to npm with trusted publishing, and creates a GitHub Release with the installers and `SHA256SUMS`.

The tag includes `dist/` because Herdr installs the plugin straight from the tag. npm publishing is skipped while the repository is private.

## Style

- TypeScript strict, ESM, no runtime `dependencies` (everything is bundled).
- Keep `herdr/*.mjs` in plain, conservative JavaScript; `herdr/launch.mjs` must parse on old Node versions so it can print a helpful error.
- Never log or commit credentials, grants, raw agent output, or receipt state.
- Commit messages: short imperative subject (`fix: ...`, `feat: ...`, `docs: ...` are welcome), a body explaining why when it is not obvious. One logical change per commit.

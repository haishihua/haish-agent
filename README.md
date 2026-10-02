# haish-agent

Haish is the macOS desktop app for the haish-agent project. It runs the full Haish web UI in
Electron and adds native local-folder authorization for desktop projects.

## Current Scope

- Electron desktop app named `Haish`
- Full Haish web UI from `app-web` (**Vite production bundle** → `app-web/dist`)
- Local agent runtime launched and proxied by the Electron main process
- Stable local owner identity stored by the Python runtime through the system credential store
- Native macOS folder picker through the Electron main process
- Authorized local project registry stored in Electron `userData`
- Sandboxed local file listing and small text-file preview IPC for future agent tools

## Frontend architecture

| Path | Role |
| --- | --- |
| `app-web/` | Product UI (React + ESM, built by Vite) |
| `app-web/src/main.jsx` | UI entry |
| `app-web/src/features/` | Domain-owned UI, state, models, hooks, and APIs |
| `app-web/src/shared/` | Feature-neutral API, library, and UI primitives |
| `app-web/tests/` | Contract, feature, and integration tests |
| `app-web/dist/` | Build output loaded by Electron (`haish://app/...`) |
| `src/main`, `src/preload`, `src/shared` | Electron main + preload + shared IPC types (TypeScript) |

Build config: `vite.app-web.config.ts`.

**Architecture & coding standards (required reading for UI work):**  
[`docs/frontend-architecture-and-conventions.md`](./docs/frontend-architecture-and-conventions.md)

Run the complete frontend gate with `npm run check:web`.

## Run Locally

The haish-agent workspace has two repos:

- `haish-agent` (this repo) — the Electron shell and web UI.
- `haish-agent-core` — the Python backend the Electron main process spawns
  on every launch. **It is required even in dev mode.**

### 1. Set up the Python backend

Clone `haish-agent-core` and prepare its virtualenv:

```bash
# Recommended layout (sibling of this repo — auto-detected):
#   <parent>/haish-agent
#   <parent>/haish-agent-core
git clone <haish-agent-core repo url> ../haish-agent-core
cd ../haish-agent-core
python3 -m venv .venv
.venv/bin/pip install -e .   # or follow that repo's own install steps
# create .env / mcp.json as required by haish-agent-core
```

If you cannot put the backend next to this repo, point `HAISH_LOCAL_RUNTIME_CWD`
at it instead (see env vars below).

### 2. Start the desktop app

```bash
cd haish-agent
npm install
npm run dev
```

`npm run dev` will:

1. Build the web UI into `app-web/dist` (production React, no browser Babel)
2. Compile the Electron main process
3. Watch `app-web` for rebuilds and launch Electron

The main process then `spawn`s the Python backend on a random `127.0.0.1` port and
proxies all `haish://app/api/*` requests to it.

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run build:web` | One-shot Vite production build for `app-web` |
| `npm run dev:web` | Vite watch rebuild into `app-web/dist` |
| `npm run typecheck` | TypeScript check (Electron + shared) |
| `npm run lint` | ESLint for app-web + Electron sources |

After a web rebuild while Electron is open, reload the window (Cmd+R) to pick up changes.

### UI dependency packaging

Keep renderer-only libraries in `devDependencies`: Vite bundles them (including
lazy Markdown plugins) into `app-web/dist`. Electron Builder copies production
`dependencies` into the desktop app, so putting UI libraries there ships another
copy of their dependency trees. Only unbundled main/preload runtime packages
(currently `electron-updater`) belong in `dependencies`. Build with a full
`npm install` / `npm ci`, not `--omit=dev`.

Prefer individual Radix packages for the primitives actually used. Keep upstream
licenses beside copied UI components; a license file is not an unused component.

### Backend lookup order

In dev mode the backend repo is resolved in this order:

1. `$HAISH_LOCAL_RUNTIME_CWD` if set.
2. `../haish-agent-core` next to this repo.
3. `./haish-agent-core` inside this repo.

If none exist the runtime fails fast with a clear error.

### Useful environment variables

| Variable | Purpose |
| --- | --- |
| `HAISH_LOCAL_RUNTIME_CWD` | Absolute path to the `haish-agent-core` repo. |
| `HAISH_LOCAL_RUNTIME_PYTHON` | Python interpreter to use (defaults to the repo's `.venv/bin/python`, then `python3`). |
| `HAISH_LOCAL_RUNTIME_PORT` | Pin the backend port instead of picking a free one. |
| `HAISH_LOCAL_RUNTIME_WORKDIR` | Override the backend workdir (defaults to Electron `userData/runtime`). |
| `HAISH_LOCAL_RUNTIME_ENV_FILE` | Extra env file for the backend (defaults to Electron `userData/runtime.env`). Release builds do **not** ship a real `.env`. |

`Add Project` uses the macOS folder picker in the desktop app. The selected
folder is stored locally and shown as a project in the full web UI.

## Build a macOS App

**For releases, use the [GitHub Actions release flow](#release-flow-github-actions-default)
below. Building and uploading happen entirely on GitHub; local packaging is only
an explicit fallback or a development check.**

The hybrid icon compiler needs **full Xcode 26.0.1**. CI selects it only for
icon compilation via `HAISH_ICON_DEVELOPER_DIR=/Applications/Xcode_26.0.1.app/Contents/Developer`;
the rest of the build can use the host's current Xcode. Command Line Tools alone
cannot compile the Icon Composer app icon. Run
`npm run check:mac-icon` to check the source and toolchain before packaging.
Users installing Haish do not need Xcode.

```bash
npm run dist:mac
```

This fetches the pinned remote adapter and runs the release web build + Electron compile + runtime packaging. The generated `.dmg`, `.zip`, and `.app`
files are written to `release/`. Unsigned builds may require Finder → right click → Open the first time.

### App icon: two designs, one app bundle

Older macOS must retain the **original** `build/icon.icns` artwork, byte-for-byte.
`build/Haish.icon` is the separate modern design for macOS 26. electron-builder
copies the original ICNS; our pre-signing `afterPack` hook compiles only the modern
`Assets.car` and adds `CFBundleIconName=Haish`. It does not use the modern design's
generated ICNS as the legacy fallback. Both designs ship in the same app bundle.

The icon-only compilation pins Xcode 26.0.1 and disables icon-stack fallback
generation. This is a toolchain-specific workaround: newer actool versions can
embed new-design bitmaps in Assets.car that older macOS selects before the ICNS.
See [hybrid icon investigation](https://mjtsai.com/blog/2025/08/08/separate-icons-for-macos-tahoe-vs-earlier/).
Do not remove the compiler pin without checking both older macOS and Tahoe.
Packaged apps must not call `app.dock.setIcon` with a PNG; only unpackaged Electron
uses the shared UI logo. The renderer artwork remains unchanged.

A pre-signing `afterPack` check verifies both icon formats, byte-identical legacy
ICNS, plist keys, and that
icon compilation has not raised the application's minimum macOS version to 26.
Before releasing, test the built **same app bundle** in Finder, Dock (before and
after launch), and the app launcher on both an older supported macOS and macOS 26;
on 26 also check default, dark, clear, and tinted appearances.

`build/icon.icns` is the original release icon input for older systems;
`build/icon.png` remains the original reference artwork. `python3 scripts/prepare-macos-icon.py` (Pillow required)
recreates the traced foreground from the legacy artwork if necessary; routine
packaging uses the committed `.icon` directory and requires no Python image tools.
The 0.0.24 single-source build incorrectly supplied a static rendering of the
new design on older systems. The hybrid correction has local hook/contract tests,
but actual compilation and cross-version visual acceptance still require the CI
build and manual testing. Successful asset checks are not a visual acceptance test.

## In-app updates (GitHub Releases)

Packaged builds can update from the left sidebar user menu → **Check for updates**.
One click runs: check → download → install/restart. Users do **not** need to manually
overwrite the app when a **newer semver** is published.

### Release flow (GitHub Actions default)

**Maintainers and coding agents: default to GitHub Actions for macOS packaging
and publishing. Do not build locally and then upload unless explicitly requested.**
The [Release macOS workflow](.github/workflows/release-macos.yml) uses `macos-26`
(arm64, Xcode 26+), Node.js 24, and Python 3.13. It checks the icon toolchain,
installs dependencies, checks out the private runtime source, downloads and verifies
the pinned adapter, builds the app, and uploads all release assets directly from
the runner. The current workflow uses the unsigned channel (ad-hoc signed, no
Developer ID signing or notarization). Version 0.0.24 was released through this flow.

#### Credentials (one-time setup)

- Repository Actions secret **`HAISH_PAT`** is configured for reading
  `haishihua/haish-agent-core` and `haishihua/haish-agent-remote`. Check its presence
  with `gh secret list -R haishihua/haish-agent`; this does not prove it is still valid.
  If replacing it, prefer a fine-grained PAT limited to those two repositories
  with **Contents: read-only**. Never print a token or put it in source/docs.
- Publishing uses the workflow's own **`GITHUB_TOKEN`** with `contents: write`,
  not `HAISH_PAT`. The operator needs `gh auth status` to succeed and permission
  to push and dispatch workflows. Users installing from the public release need
  no token.

#### 1. Prepare and push the release inputs

- Review the app working tree and run relevant tests / `npm run build:release`.
  Commit only the intended changes (usual app commit: `fix: 前端优化`).
- **The runtime comes from the private core repository's remote `master`, not
  the local core working tree.** Check whether frontend changes depend on
  uncommitted/unpushed core changes. Test and push the required core changes
  before dispatching, with user approval for changes outside this repository.
- The adapter comes from `scripts/remote-adapter.lock.json`, not the locally
  staged binary. If updating it, first publish the corresponding private adapter
  release, then update the lock tag and verified SHA-256 values. Never silently
  substitute a different version. Keep new core dependencies pinned in
  `scripts/runtime-requirements.lock` (including Pillow and PyYAML).
- Read the current package version and existing releases; use a **new semver**
  for new changes. Replace `X.Y.Z` below with the chosen version:

```bash
npm version X.Y.Z --no-git-tag-version --allow-same-version=false
git add package.json package-lock.json
git commit -m "chore: bump version to X.Y.Z"
git push origin master
```

Confirm the intended app commit is on remote `master` before dispatching. No local
release tag or manual asset upload is needed. If `vX.Y.Z` already exists, the
release script **replaces its assets** (`--clobber`); only do this when the user
explicitly requests a same-version overwrite.

#### 2. Dispatch and watch the GitHub build

```bash
gh workflow run release-macos.yml -R haishihua/haish-agent --ref master -f dry_run=false
gh run list -R haishihua/haish-agent --workflow release-macos.yml --branch master --event workflow_dispatch -L 5
# Select the run matching this dispatch time and intended app commit:
gh run view RUN_ID -R haishihua/haish-agent --json headSha,status,conclusion,url
gh run watch RUN_ID -R haishihua/haish-agent --exit-status
```

Alternatively: repository **Actions → Release macOS → Run workflow → master**, with
`dry_run` disabled. A push alone does not trigger this manual workflow. Optional
`dry_run=true` builds without creating/uploading a release; it does not retain
installers as downloadable Actions artifacts. Do not routinely run a dry build
and then rebuild again for publication.

#### 3. Verify and report publication

```bash
gh release view vX.Y.Z -R haishihua/haish-agent --json url,tagName,isDraft,isPrerelease,assets
```

Require a successful matching Actions run, a public non-draft/non-prerelease
release, and exactly these five assets in `uploaded` state:

- `Haish-X.Y.Z-arm64.dmg`
- `Haish-X.Y.Z-arm64.dmg.blockmap`
- `Haish-X.Y.Z-arm64.zip`
- `Haish-X.Y.Z-arm64.zip.blockmap`
- `latest-mac.yml`

Check the run's release summary for `latest-mac.yml` version, filenames, sizes,
and SHA-512 values. The build also checks the compiled icon assets and packaged
TLS CA certificate. **Once publication succeeds, immediately report the release
URL to the user.** Additional verification is a separate status: if performed,
recompute ZIP/DMG SHA-512 against `latest-mac.yml`, check bundle version / identifier
(`com.haish.agent`), update configuration, and the adapter version / three-file
adapter directory. Do not claim these extra checks passed unless actually run.
Slow local downloads must not delay reporting an already published release or
be described as a build/upload still in progress. Prefer runner-side verification
when extending the pipeline; the current workflow does not automate every extra check.

#### Local fallback (only when explicitly requested)

Requires full Xcode 26+, access to the correct core source, and authenticated `gh`.
Unlike the workflow, `release-mac.mjs` does not fetch the adapter itself:

```bash
npm run fetch:remote-adapter
npm run release:mac:unsigned
# Use npm run release:mac instead only when signing/notarization credentials exist.
```

Set `HAISH_RUNTIME_SOURCE` to the intended core checkout if needed. These local
commands build into `release/` and publish `v<package.json version>` themselves;
they are not required for the default GitHub-only flow.

### Important notes

- In-app update works in **packaged** apps only (`npm run dev` will show “packaged app only”).
- macOS auto-update uses the **zip** artifact; dmg remains the first-install path.
- Updates only apply when the GitHub release version is **greater** than the installed
  app version (e.g. `0.0.1` → `0.0.2`). Re-publishing the same version will show
  “Up to date” and will not re-download/replace the binary.
- Public repos can be checked by `electron-updater` without a client token. Private repos
  need `GH_TOKEN` / `GITHUB_TOKEN` on the client, or a public download host for update assets.
- Never package a real backend `.env` into dmg/zip. Runtime secrets belong in the user's
  local `runtime.env` (or `HAISH_LOCAL_RUNTIME_ENV_FILE`), not in release artifacts.
- Signing/notarization is still recommended for smooth install; unsigned builds may need
  right-click → Open the first time.

## Next Milestones

- Route all project file tools through the local runtime
- Add write-file and command execution with explicit confirmation prompts
- Cross-platform desktop packaging beyond macOS

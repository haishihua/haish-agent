# haish-agent

Haish is the macOS desktop app for the haish-agent project. It runs the full Haish web UI in
Electron and adds native local-folder authorization for desktop projects.

## Current Scope

- Electron desktop app named `Haish`
- Full Haish web UI from `app-web` (**Vite production bundle** → `app-web/dist`)
- Local agent runtime launched and proxied by the Electron main process
- Native macOS folder picker through the Electron main process
- Authorized local project registry stored in Electron `userData`
- Sandboxed local file listing and small text-file preview IPC for future agent tools

## Frontend architecture

| Path | Role |
| --- | --- |
| `app-web/` | Product UI (React + ESM, built by Vite) |
| `app-web/src/main.jsx` | UI entry |
| `app-web/src/lib/` | Pure helpers (settings/workflow/runtime constants) |
| `app-web/dist/` | Build output loaded by Electron (`haish://app/...`) |
| `src/main`, `src/preload` | Electron main + preload (TypeScript) |
| `src/renderer` | Legacy Vite shell prototype (not used by the desktop app) |

Build config: `vite.app-web.config.ts`.

**Architecture & coding standards (required reading for UI work):**  
[`docs/frontend-architecture-and-conventions.md`](./docs/frontend-architecture-and-conventions.md)

Source tree cheat sheet: `app-web/src/lib/README.md`.

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

```bash
npm run dist:mac
```

This runs `build:web` + Electron compile + runtime packaging. The generated `.dmg`, `.zip`, and `.app`
files are written to `release/`. Unsigned builds may require Finder → right click → Open the first time.

## In-app updates (GitHub Releases)

Packaged builds can update from the left sidebar user menu → **Check for updates**.
One click runs: check → download → install/restart. Users do **not** need to manually
overwrite the app when a **newer semver** is published.

### Release flow

1. Bump `version` in `package.json` (semver). Current baseline is `0.0.1`.
2. Ensure `gh` is logged in (`gh auth status`).
3. Publish:

```bash
# Preferred when Apple signing + notarization credentials are available:
npm run release:mac

# Internal smoke without the signing gate:
npm run release:mac:unsigned
```

The script builds dmg/zip, then creates/updates GitHub Release `v<version>` with
`latest-mac.yml` and the artifacts under `release/`.

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

- Further split `app.jsx` / `panels.jsx` / `styles.css` by feature
- Add unit tests for `app-web/src/lib/*`
- Route all project file tools through the local runtime
- Add write-file and command execution with explicit confirmation prompts
- Account sync, device registration, and auto-update

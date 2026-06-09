# Haish

Haish is the macOS desktop app for Haish Agent. It runs the full Haish web UI in
Electron and adds native local-folder authorization for desktop projects.

## Current Scope

- Electron desktop app named `Haish`
- Full Haish web UI loaded from `app-web`
- Local agent runtime launched and proxied by the Electron main process
- Native macOS folder picker through the Electron main process
- Authorized local project registry stored in Electron `userData`
- Sandboxed local file listing and small text-file preview IPC for future agent tools

## Run Locally

Haish has two repos:

- `Haish-agent` (this repo) — the Electron shell and web UI.
- `haishihua-agent-core` — the Python backend the Electron main process spawns
  on every launch. **It is required even in dev mode.**

### 1. Set up the Python backend

Clone `haishihua-agent-core` and prepare its virtualenv:

```bash
# Recommended layout (sibling of this repo — auto-detected):
#   <parent>/Haish-agent
#   <parent>/haishihua-agent-core
git clone <haishihua-agent-core repo url> ../haishihua-agent-core
cd ../haishihua-agent-core
python3 -m venv .venv
.venv/bin/pip install -e .   # or follow that repo's own install steps
# create .env / mcp.json as required by haishihua-agent-core
```

If you cannot put the backend next to this repo, point `HAISH_LOCAL_RUNTIME_CWD`
at it instead (see env vars below).

### 2. Start the desktop app

```bash
cd Haish-agent
npm install
npm run dev
```

`npm run dev` compiles the Electron main process and launches Electron. The
main process then `spawn`s the Python backend on a random `127.0.0.1` port and
proxies all `haish://app/api/*` requests to it.

### Backend lookup order

In dev mode the backend repo is resolved in this order:

1. `$HAISH_LOCAL_RUNTIME_CWD` if set.
2. `../haishihua-agent-core` next to this repo.
3. `./haishihua-agent-core` inside this repo.

If none exist the runtime fails fast with a clear error.

### Useful environment variables

| Variable | Purpose |
| --- | --- |
| `HAISH_LOCAL_RUNTIME_CWD` | Absolute path to the `haishihua-agent-core` repo. |
| `HAISH_LOCAL_RUNTIME_PYTHON` | Python interpreter to use (defaults to the repo's `.venv/bin/python`, then `python3`). |
| `HAISH_LOCAL_RUNTIME_PORT` | Pin the backend port instead of picking a free one. |
| `HAISH_LOCAL_RUNTIME_WORKDIR` | Override the backend workdir (defaults to Electron `userData/runtime`). |
| `HAISH_LOCAL_RUNTIME_ENV_FILE` | Extra env file merged on top of the backend's bundled `.env`. |

`Add Project` uses the macOS folder picker in the desktop app. The selected
folder is stored locally and shown as a project in the full web UI.

## Build a macOS App

```bash
npm run dist:mac
```

The generated `.dmg`, `.zip`, and `.app` files are written to `release/`. This build
is unsigned, so macOS may require opening it from Finder with right click ->
Open the first time.

## Next Milestones

- Add account sync and device registration
- Add runtime health/status controls in the UI
- Route all project file tools through the local runtime
- Add write-file and command execution with explicit confirmation prompts
- Add macOS packaging, signing, notarization, and auto-update

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

```bash
npm install
npm run build
npm run dev
```

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

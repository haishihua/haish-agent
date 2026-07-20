# app-web/src layout & naming

Full architecture & mandatory conventions (read before UI work):

[`docs/frontend-architecture-and-conventions.md`](../../../docs/frontend-architecture-and-conventions.md)

## Naming convention

| Kind | Rule | Examples |
| --- | --- | --- |
| Entry / bootstrap | lowercase | `main.jsx`, `app.jsx` |
| React component module | **PascalCase** | `AppShell.jsx`, `ChatTimeline.jsx`, `PortalTooltip.jsx` |
| Side-effect overlay | kebab-case | `approval-overlay.jsx` |
| Pure logic / helpers | kebab-case | `agent-catalog.js`, `path-utils.jsx`, `shared-constants.jsx` |
| API clients | kebab-case | `api/auth.js`, `api/base.js` |
| Directories | lowercase | `features/`, `panels/`, `lib/`, `api/` |

**Never** put two files that differ only by letter case in the same folder (macOS default disk is case-insensitive).

## Tree

```
app-web/src/
  main.jsx                 # Vite entry
  app.jsx                  # AuthGate + ErrorBoundary mount
  approval-overlay.jsx     # Approval side-effect mount
  Effects.jsx / Sprites.jsx / World.jsx / orchestrator.js
  panels.jsx               # Barrel re-exports
  panels/                  # UI building blocks (PascalCase components)
  features/
    app/AppShell.jsx       # Main desktop shell
    app/hooks/create*.js   # AppShell handler factories (Phase C)
    auth/AuthGate.jsx, AuthScreen.jsx
    settings/              # SettingsPage shell + editors + payload/ui
  lib/                     # Pure helpers (kebab-case)
  api/                     # HTTP / session

app-web/
  styles.css               # Global CSS entry (imports styles/*.css)
  styles/                  # Section CSS (base/auth/chat/panels/...)
```

### Important lib edges

- `chat-text.js` — leaf helpers (`stripChatImageAugmentation`); no deps on other lib modules
- `tool-names.js` — leaf (`normalizeToolName`); used by `chat-timeline.js` and panels
- `tool-view.js` — pure tool display helpers for chat timeline (no React)
- `workspace-state.js` ↔ `task-runtime.js` — **no circular import**; task mapping uses `registerTaskSummaryMapper()` registered from `task-runtime` after init

### settings feature modules

See `features/settings/` after Phase A split: `settings-payload.js`, `settings-ui.jsx`, `*ConfigEditor.jsx`, shell `SettingsPage.jsx`.

### app shell factories

`features/app/hooks/createComposerHandlers.js`, `createSettingsHandlers.js`, `createConversationHandlers.js`, `createWorldCalibrationHandlers.js`, `createScenePlaybackHelpers.js` — behavior-preserving factories extracted from `AppShell.jsx` (not React hooks yet).

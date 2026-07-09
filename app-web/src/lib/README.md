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
    auth/AuthGate.jsx, AuthScreen.jsx
    settings/SettingsPage.jsx
  lib/                     # Pure helpers (kebab-case)
  api/                     # HTTP / session
```

### Important lib edges

- `chat-text.js` — leaf helpers (`stripChatImageAugmentation`); no deps on other lib modules
- `workspace-state.js` ↔ `task-runtime.js` — **no circular import**; task mapping uses `registerTaskSummaryMapper()` registered from `task-runtime` after init

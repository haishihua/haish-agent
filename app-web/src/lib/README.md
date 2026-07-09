# app-web/src/lib

Pure / shared modules extracted from the legacy monolithic `app.jsx`.

| Module | Responsibility |
| --- | --- |
| `world-runtime.js` | Map size, walk speeds, pose debug options, provider→actor maps |
| `agent-catalog.js` | Agent presets, tool groups, LLM/settings draft helpers (pure) |
| `workflow-catalog.js` | Workflow normalize/catalog helpers (pure) |
| `ErrorBoundary.jsx` | Top-level React error boundary |

UI components remain in `../panels.jsx`, `../app.jsx`, etc. Prefer adding new pure logic here so it can be unit-tested without mounting React.

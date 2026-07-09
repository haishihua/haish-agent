// Haish app-web entry — production-bundled by Vite.
// Load order: styles → main app (AuthGate + window.authFetch) → approval overlay.

import '../styles.css';
import '@xyflow/react/dist/style.css';

import './app.jsx';
import './approval-dialog.jsx';

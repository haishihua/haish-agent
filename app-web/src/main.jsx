// Haish app-web entry — production-bundled by Vite.
// Load order: styles → main app (AuthGate + window.authFetch).
// Command approvals, browser-runtime confirmation, and ask_user are rendered
// declaratively inside the main React tree.

import '../styles.css';
import '@xyflow/react/dist/style.css';

import './app.jsx';

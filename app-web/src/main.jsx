// Haish app-web entry — production-bundled by Vite.
// Load order: styles → main app.
// Command approvals, browser-runtime confirmation, and ask_user are rendered
// declaratively inside the main React tree.

import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '../styles.css';

// Before ./app.jsx on purpose: the stale-chunk listener has to exist before React
// requests the first lazy chunk.
import './shared/lib/preload-recovery.js';
import './app.jsx';

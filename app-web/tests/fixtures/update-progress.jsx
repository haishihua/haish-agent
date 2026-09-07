import React from 'react';
import { createRoot } from 'react-dom/client';
import { JobProgress } from '../../src/shared/ui/agent-elements/JobProgress.jsx';
import { updateJobProgress } from '../../src/features/conversations/model/update-progress.js';
import '../../styles.css';

const states = [{ status: 'checking' }, { status: 'downloading', progressPercent: 5 }, { status: 'downloading', progressPercent: 67 }, { status: 'downloading' }, { status: 'downloaded' }, { status: 'not-available' }];
createRoot(document.getElementById('root')).render(<main style={{ padding: 32, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
  {states.map((state, i) => <section key={i} style={{ width: 228 }}><JobProgress {...updateJobProgress(state)} /></section>)}
</main>);

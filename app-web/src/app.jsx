// @haish-esm
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './features/auth/AuthGate.jsx';
import { ErrorBoundary } from './lib/ErrorBoundary.jsx';
import { authFetch } from './api/auth.js';

window.authFetch = authFetch;

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary title="HAISH UI ERROR">
    <AuthGate />
  </ErrorBoundary>,
);

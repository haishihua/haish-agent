import ReactDOM from 'react-dom/client';
import { AppShell } from './features/app/AppShell.jsx';
import { ErrorBoundary } from './shared/ui/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary title="HAISH UI ERROR">
    <AppShell />
  </ErrorBoundary>,
);

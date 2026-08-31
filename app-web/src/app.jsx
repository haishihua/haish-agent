import ReactDOM from 'react-dom/client';
import { AuthGate } from './features/auth/components/AuthGate.jsx';
import { ErrorBoundary } from './shared/ui/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary title="HAISH UI ERROR">
    <AuthGate />
  </ErrorBoundary>,
);

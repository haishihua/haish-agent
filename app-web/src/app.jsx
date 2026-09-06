import ReactDOM from 'react-dom/client';
import { AppShell } from './features/app/AppShell.jsx';
import { ErrorBoundary } from './shared/ui/ErrorBoundary.jsx';
import { NativeTitleTooltips } from './shared/ui/NativeTitleTooltips.jsx';
import { AppTooltipProvider } from './shared/ui/PortalTooltip.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary title="HAISH UI ERROR">
    <AppTooltipProvider>
      <AppShell />
      <NativeTitleTooltips />
    </AppTooltipProvider>
  </ErrorBoundary>,
);

import React from 'react';
import { LoadingState } from '../../../shared/ui/agent-elements/LoadingState.jsx';

const LazyWorkflowRuntimePage = React.lazy(() => import('./WorkflowRuntimePage.jsx').then((module) => ({ default: module.WorkflowRuntimePage })));

function WorkflowRuntimeLoading() {
  return <div className="workflow-runtime-loading" role="status"><LoadingState label="Loading workflow…" /></div>;
}

// Both the first Bot-mode chunk load and conversation restoration use the same
// shared loader as Chat and Settings, rather than showing an incomplete graph.
export function WorkflowRuntimeEntry({ loading = false, ...props }) {
  if (loading) return <WorkflowRuntimeLoading />;
  return <React.Suspense fallback={<WorkflowRuntimeLoading />}><LazyWorkflowRuntimePage {...props} /></React.Suspense>;
}

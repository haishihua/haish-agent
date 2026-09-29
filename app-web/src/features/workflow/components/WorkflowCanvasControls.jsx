import React from 'react';
import { ControlButton, Controls, useReactFlow } from '@xyflow/react';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { saveWorkflowCanvasPreferences } from '../model/workflow-canvas-preferences.js';

/** Controls change zoom programmatically (onMoveEnd has no user event). */
export function WorkflowCanvasControls({ workflowId, onResetLayout, resetLayoutDisabled = false }) {
  const { getZoom } = useReactFlow();
  const timer = React.useRef(null);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const remember = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveWorkflowCanvasPreferences(workflowId, { zoom: getZoom() }), 100);
  };
  return <Controls showInteractive={false} position="top-right"
    onZoomIn={remember} onZoomOut={remember}
    onFitView={() => saveWorkflowCanvasPreferences(workflowId, { zoom: null })}>
    {onResetLayout ? (
      <ControlButton className="workflow-controls-reset" title="Reset layout" aria-label="Reset layout"
        onClick={onResetLayout} disabled={resetLayoutDisabled}>
        <AppIcon name="retry" size={16} />
      </ControlButton>
    ) : null}
  </Controls>;
}

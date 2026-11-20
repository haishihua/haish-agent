import { REDUCED_MOTION_QUERY } from '../../../../shared/lib/reduced-motion.js';
import React from 'react';
import { useNodesInitialized, useReactFlow, useStore } from '@xyflow/react';
import { WORKFLOW_FIT_OPTIONS } from '../WorkflowFlowNode.jsx';

export function FitWorkflow({ workflowKey, detailOpen, layoutKey }) {
  const { fitView } = useReactFlow();
  // Measure React Flow's usable viewport, including height and composer space.
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const ready = useNodesInitialized();
  React.useEffect(() => {
    if (!width || !height || !ready) return undefined;
    const timer = window.setTimeout(() => {
      // Saved zoom is a manual preference, not a constraint on responsive fit.
      fitView({ ...WORKFLOW_FIT_OPTIONS, duration: 180 });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [detailOpen, fitView, layoutKey, workflowKey, width, height, ready]);
  return null;
}

// Screen-space link follows pan/zoom and the measured node, without changing graph topology.
export function RuntimeSelectionLink({ nodeId }) {
  const node = useStore((state) => state.nodeLookup.get(nodeId));
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const [pullOffset, setPullOffset] = React.useState(0);
  React.useEffect(() => {
    let frame;
    const started = performance.now();
    const panel = document.querySelector('.workflow-detail-panel');
    if (!panel || window.matchMedia(REDUCED_MOTION_QUERY).matches) return undefined;
    const stop = (event) => {
      if (event.target !== panel || event.animationName !== 'workflow-detail-haul') return;
      cancelAnimationFrame(frame);
      setPullOffset(0);
    };
    panel.addEventListener('animationend', stop);
    const sample = () => {
      if (panel) {
        const matrix = getComputedStyle(panel).transform;
        setPullOffset(matrix === 'none' ? 0 : Math.max(0, new DOMMatrixReadOnly(matrix).m41));
      }
      if (performance.now() - started < 520) frame = requestAnimationFrame(sample);
      else setPullOffset(0);
    };
    frame = requestAnimationFrame(sample);
    return () => { cancelAnimationFrame(frame); panel.removeEventListener('animationend', stop); };
  }, [nodeId]);
  const uid = React.useId().replace(/:/g, '');
  if (!node?.measured?.width || !width) return null;
  const [tx, ty, zoom] = transform;
  const position = node.internals.positionAbsolute;
  const x = (position.x + node.measured.width) * zoom + tx;
  const y = (position.y + (node.measured.height || 64) / 2) * zoom + ty;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  const endY = 64;
  const endX = width + pullOffset;
  const bend = x + (endX - x) * 0.55;
  return (
    <svg className="workflow-selection-link" width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id={uid} x1="0" x2="1"><stop stopColor="var(--workflow-detail-accent)" stopOpacity="0.12" /><stop offset="1" stopColor="var(--workflow-detail-accent)" stopOpacity="0.38" /></linearGradient></defs>
      <path d={`M ${x} ${y} C ${bend} ${y}, ${endX - 40} ${endY + 20}, ${endX} ${endY - 16} L ${endX} ${endY + 16} C ${endX - 40} ${endY + 36}, ${bend} ${y + 8}, ${x} ${y} Z`} fill={`url(#${uid})`} />
      <path d={`M ${x} ${y} C ${bend} ${y}, ${endX - 40} ${endY + 20}, ${endX} ${endY}`} fill="none" stroke="var(--workflow-detail-accent)" strokeOpacity="0.65" />
    </svg>
  );
}

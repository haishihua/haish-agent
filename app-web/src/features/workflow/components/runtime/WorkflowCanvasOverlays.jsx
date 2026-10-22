// 画布上的两处纯渲染覆盖层：自动 fitView 同步器 + 选中节点的连线。
import React from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { workflowFitOptions } from '../../model/workflow-canvas-preferences.js';
import { WORKFLOW_FIT_OPTIONS } from '../WorkflowFlowNode.jsx';

export function FitWorkflow({ workflowKey, detailOpen, layoutKey }) {
  const { fitView } = useReactFlow();
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ ...workflowFitOptions(workflowKey.split(':')[0], WORKFLOW_FIT_OPTIONS), duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [detailOpen, fitView, layoutKey, workflowKey]);
  return null;
}

// Screen-space link follows pan/zoom and the measured node, without changing graph topology.
export function RuntimeSelectionLink({ nodeId }) {
  const node = useStore((state) => state.nodeLookup.get(nodeId));
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const uid = React.useId().replace(/:/g, '');
  if (!node?.measured?.width || !width) return null;
  const [tx, ty, zoom] = transform;
  const position = node.internals.positionAbsolute;
  const x = (position.x + node.measured.width) * zoom + tx;
  const y = (position.y + (node.measured.height || 64) / 2) * zoom + ty;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  const endY = 64;
  const bend = x + (width - x) * 0.55;
  return (
    <svg className="workflow-selection-link" width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id={uid} x1="0" x2="1"><stop stopColor="var(--workflow-detail-accent)" stopOpacity="0.12" /><stop offset="1" stopColor="var(--workflow-detail-accent)" stopOpacity="0.38" /></linearGradient></defs>
      <path d={`M ${x} ${y} C ${bend} ${y}, ${width - 40} ${endY + 20}, ${width} ${endY - 16} L ${width} ${endY + 16} C ${width - 40} ${endY + 36}, ${bend} ${y + 8}, ${x} ${y} Z`} fill={`url(#${uid})`} />
      <path d={`M ${x} ${y} C ${bend} ${y}, ${width - 40} ${endY + 20}, ${width} ${endY}`} fill="none" stroke="var(--workflow-detail-accent)" strokeOpacity="0.65" />
    </svg>
  );
}

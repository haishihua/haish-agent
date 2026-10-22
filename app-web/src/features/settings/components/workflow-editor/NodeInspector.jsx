import React from 'react';
import { workflowNodeAccent } from '../../../workflow/components/WorkflowFlowNode.jsx';
import { SettingsTooltipIconButton } from '../settings-ui.jsx';
import { WorkflowNodeHeading } from '../WorkflowNodeDetails.jsx';

// 右侧节点面板的外壳：标题、删除按钮、可拖拽的分隔条；字段区由调用方作为 children 传进来。
export function NodeInspector({
  selectedNode,
  agentOptions,
  isEditable,
  panelWidth,
  onResizeStart,
  onDelete,
  children,
}) {
  return (
    <div className="workflow-node-panel workflow-agent-detail workflow-node-detail"
      style={{ '--workflow-detail-accent': workflowNodeAccent(selectedNode.type) }}>
      <div
        className="workflow-node-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail panel"
        aria-valuemin={280}
        aria-valuemax={720}
        aria-valuenow={panelWidth}
        onPointerDown={onResizeStart}
      />
      <div className="workflow-node-panel-head">
        <WorkflowNodeHeading node={selectedNode} agentOptions={agentOptions} />
        {isEditable && selectedNode && !['start', 'output'].includes(selectedNode.type) ? (
          <SettingsTooltipIconButton
            label="Delete"
            icon="delete"
            danger
            iconSize={18}
            className="workflow-node-panel-delete"
            onClick={onDelete}
          />
        ) : null}

      </div>
      {children}
    </div>
  );
}

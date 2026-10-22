import React from 'react';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';
import { PortalTooltip } from '../../../../shared/ui/PortalTooltip.jsx';
import { workflowNodeMeta } from '../../../workflow/components/WorkflowFlowNode.jsx';
import { SettingsTooltipIconButton } from '../settings-ui.jsx';
import { WORKFLOW_NODE_DRAG_TYPE } from './shared.js';

// 工具条只在“能改内容”或“能保存”时才需要：系统预设（只读但排布可拖）没有它——
// 那行 Layout 说明整块删掉，排布反馈挂画布右上角。
export function EditorToolbar({
  isEditable,
  canSave,
  nodeTypes,
  draggedNodeType,
  hasSelectedEdge,
  onNodeDragStart,
  onNodeDragEnd,
  onAddNode,
  onDeleteEdge,
  onSave,
}) {
  const typeOptions = nodeTypes
    .filter((item) => item.id !== 'output')
    .map((item) => ({ id: item.id, label: item.label }));
  return isEditable || canSave ? (
    <div className="workflow-toolbar">
      <div className="workflow-toolbar-actions">
        {isEditable ? (
          <div className="workflow-toolbar-add-group" role="group" aria-label="Add node">
            {typeOptions.map((type) => {
              const meta = workflowNodeMeta(type.id);
              return (
                <PortalTooltip key={type.id} text={`Add ${type.label}`} position="below">
                  <button
                    type="button"
                    className={`workflow-toolbar-button workflow-toolbar-add is-${type.id}${draggedNodeType === type.id ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(WORKFLOW_NODE_DRAG_TYPE, type.id);
                      event.dataTransfer.setData('text/plain', type.id);
                      event.dataTransfer.effectAllowed = 'copy';
                      onNodeDragStart(type.id);
                    }}
                    onDragEnd={() => {
                      onNodeDragEnd();
                    }}
                    onClick={() => onAddNode(type.id)}
                  >
                    <span className="workflow-toolbar-add-icon" aria-hidden="true">
                      <AppIcon name={meta.icon} size={16} />
                    </span>
                    <span>{type.label}</span>
                  </button>
                </PortalTooltip>
              );
            })}
          </div>
        ) : null}
        {isEditable && hasSelectedEdge ? (
          <SettingsTooltipIconButton label="Delete connection" icon="delete" danger iconSize={18}
            onClick={onDeleteEdge} />
        ) : null}
      </div>
      {canSave ? (
        <div className="workflow-toolbar-end">
          <SettingsTooltipIconButton label="Save" icon="save" iconSize={20} onClick={onSave} />
        </div>
      ) : null}
    </div>
  ) : null;
}

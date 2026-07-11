// @haish-esm
import React from 'react';
import {
  CHAR_DEFS } from '../Sprites.jsx';
import { fmtAgo,
  fmtAgoCompact,
} from './Format.jsx';
import { LIVE_FEED_VISIBLE_COUNT } from './shared-constants.jsx';

import {
  StopCancelIcon,
} from './ConversationsPanel.jsx';
import {
  PortalTooltip,
} from './PortalTooltip.jsx';
import {
  normalizeTaskStatus,
} from '../lib/task-runtime.js';
import {
  workflowNodeActorBindings,
} from '../lib/world-runtime.js';
import {
  usePanelWidth,
} from './TaskRecords.jsx';
export function getLiveEntries(agentData) {
  if (!agentData) return [];
  if (Array.isArray(agentData.entries)) return agentData.entries;
  if (!agentData.description && !agentData.tag) return [];
  return [{
    id: agentData.id || `${agentData.taskId || 'task'}:${agentData.ts || 'latest'}`,
    taskId: agentData.taskId,
    description: agentData.description || '',
    stepCurrent: agentData.stepCurrent || 1,
    stepTotal: agentData.stepTotal || 1,
    tag: agentData.tag || 'WORKING',
    kind: agentData.kind || 'info',
    ts: agentData.ts,
    status: agentData.completed
      ? normalizeTaskStatus(agentData.outcome || 'done')
      : (agentData.status || 'pending'),
  }];
}

export function normalizeLiveStatus(status) {
  const normalized = normalizeTaskStatus(status);
  if (normalized === 'failed') return 'failed';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'done') return 'done';
  return 'pending';
}

export function LiveActivityStatusIcon({ status }) {
  const normalized = normalizeLiveStatus(status);
  if (normalized === 'done') {
    return <span className="live-activity-icon done"><span className="ico ico-check" aria-hidden="true" /></span>;
  }
  if (normalized === 'failed') {
    return <span className="live-activity-icon failed"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  if (normalized === 'cancelled') {
    return <span className="live-activity-icon cancelled"><StopCancelIcon /></span>;
  }
  return <span className="live-activity-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}

export function LiveActivityRow({ entry }) {
  const desc = entry.description || '';
  return (
    <div className={`live-activity-row status-${normalizeLiveStatus(entry.status)}`}>
      <LiveActivityStatusIcon status={entry.status} />
      <div className="live-activity-copy">
        <PortalTooltip text={desc} position="above" multiline>
          <div className="live-activity-desc">
            {desc || entry.tag || 'Working'}
          </div>
        </PortalTooltip>
      </div>
    </div>
  );
}

export function LiveCard({ agentId, agentData, now, titleOverride = '' }) {
  const [expanded, setExpanded] = React.useState(false);
  const char = CHAR_DEFS[agentId];
  if (!char) return null;
  const entries = getLiveEntries(agentData).filter((entry) => entry.taskId === agentData.taskId);
  const orderedEntries = entries.slice().sort((a, b) => a.ts - b.ts);
  const visibleEntries = expanded
    ? orderedEntries.slice().reverse()
    : orderedEntries.slice(-LIVE_FEED_VISIBLE_COUNT).reverse();
  const hiddenCount = Math.max(0, orderedEntries.length - LIVE_FEED_VISIBLE_COUNT);
  const ago = fmtAgoCompact(agentData.ts, now);
  const nameClass = `name agent-${agentId}`;

  return (
    <div className="live-card">
      <div className="avatar">
        <img
          className="portrait"
          data-agent={agentId}
          src={`assets/portraits/${agentId}.png`}
          alt={char.name}
          loading="lazy"
        />
      </div>
      <div className="body">
        <div className="row">
          <div className={nameClass}>{titleOverride || char.name}</div>
          <div className="ago">{ago}</div>
        </div>
        <div className="live-activity-list">
          {visibleEntries.map((entry) => (
            <LiveActivityRow key={entry.id || `${entry.ts}:${entry.description}`} entry={entry} />
          ))}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="live-feed-toggle"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export function shortRuntimeId(id) {
  if (!id) return '—';
  return String(id).slice(0, 8).toUpperCase();
}

export function asRenderableText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => asRenderableText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.content === 'string') return value.content;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function RuntimeList({ title, items, renderItem, emptyText = 'No data.' }) {
  return (
    <div className="runtime-section">
      <div className="runtime-section-title">{title}</div>
      {items.length === 0 ? (
        <div className="runtime-empty">{emptyText}</div>
      ) : (
        <div className="runtime-list">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

export function workflowRuntimeLevels(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    const source = edge.from || edge.source;
    const target = edge.to || edge.target;
    if (!byId.has(source) || !byId.has(target)) return;
    incoming.set(target, (incoming.get(target) || 0) + 1);
    outgoing.get(source).push(target);
  });
  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
  const levelById = new Map(queue.map((id) => [id, 0]));
  while (queue.length) {
    const source = queue.shift();
    for (const target of outgoing.get(source) || []) {
      levelById.set(target, Math.max(levelById.get(target) || 0, (levelById.get(source) || 0) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  const levels = [];
  nodes.forEach((node) => {
    const level = levelById.get(node.id) || 0;
    if (!levels[level]) levels[level] = [];
    levels[level].push(node);
  });
  return levels.filter(Boolean);
}

function workflowNodeStatus(nodeId, run) {
  const result = run?.nodes?.[nodeId];
  if (run?.current_node_id === nodeId && result?.status === 'running') return 'running';
  if (result?.success === false || result?.status === 'failed') return 'failed';
  if (result) return 'done';
  return 'pending';
}

function runtimeValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function WorkflowRuntime({ task }) {
  const workflow = task?.workflowSnapshot;
  const run = task?.workflowRun;
  const [selectedNodeId, setSelectedNodeId] = React.useState('');
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const selectedNode = workflow?.nodes?.find((node) => node.id === selectedNodeId) || null;
  const selectedResult = selectedNode ? run?.nodes?.[selectedNode.id] : null;
  const doneCount = nodes.filter((node) => workflowNodeStatus(node.id, run) === 'done').length;

  if (!workflow?.nodes?.length) {
    return <div className="workflow-runtime-empty">Select or run a Bot workflow to see its nodes.</div>;
  }

  return (
    <section className="workflow-runtime" aria-label="Workflow runtime">
      <div className="workflow-runtime-meta">
        <span>{workflow.display_name || workflow.workflow_id || workflow.id}</span>
        <span>{doneCount}/{nodes.length}</span>
      </div>
      <div className="workflow-runtime-steps">
        {nodes.map((node, index) => {
          const status = workflowNodeStatus(node.id, run);
          return (
            <button
              key={node.id}
              type="button"
              className={`workflow-runtime-step status-${status} ${selectedNodeId === node.id ? 'selected' : ''}`}
              aria-pressed={selectedNodeId === node.id}
              aria-label={`${node.label || node.id}, ${status}`}
              onClick={() => setSelectedNodeId((current) => current === node.id ? '' : node.id)}
            >
              <span className="workflow-runtime-step-index" aria-hidden="true">{index + 1}</span>
              <span className="workflow-runtime-step-title">{node.label || node.id}</span>
              <span className="workflow-runtime-step-status">{status}</span>
            </button>
          );
        })}
      </div>
      {selectedNode ? (
        <div className="workflow-runtime-detail">
          <div className="workflow-runtime-detail-head">
            <strong>{selectedNode.label || selectedNode.id}</strong>
            <span>{selectedResult?.duration_ms != null ? `${selectedResult.duration_ms} ms` : workflowNodeStatus(selectedNode.id, run)}</span>
          </div>
          <div className="workflow-runtime-detail-row">
            <span>Input</span>
            <pre>{runtimeValue(selectedNode.arguments || selectedNode.input_mapping || selectedNode.prompt || run?.input)}</pre>
          </div>
          <div className="workflow-runtime-detail-row">
            <span>{selectedResult?.success === false ? 'Error' : 'Output'}</span>
            <pre>{runtimeValue(selectedResult?.error || selectedResult?.structured || selectedResult?.value || selectedResult?.summary)}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function LiveFeedPanel({ agentLive, now, extensionStyle, currentTask }) {
  const [panelRef, panelWidth] = usePanelWidth();
  const currentTaskId = currentTask?.taskId || null;
  const agents = currentTaskId
    ? Object.entries(agentLive)
      .filter(([_, data]) => data.ts)
      .filter(([_, data]) => {
        const entries = getLiveEntries(data);
        return data.taskId === currentTaskId || entries.some((entry) => entry.taskId === currentTaskId);
      })
      .sort((a, b) => (b[1].feedRank || 0) - (a[1].feedRank || 0) || b[1].ts - a[1].ts)
    : [];
  const isWorkflowTask = currentTask?.executionMode === 'bot';
  const workflowStatus = currentTask?.workflowRun?.status || currentTask?.status || 'idle';
  const workflowActorLabels = new Map(
    workflowNodeActorBindings(currentTask?.workflowSnapshot).map(({ actor, label }) => [actor, label]),
  );

  return (
    <div className="side-panel right" ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="title">{isWorkflowTask ? 'Workflow Run' : 'Live Feed'}</div>
        <div className={`live-badge status-${workflowStatus}`}>
          <div className="dot" />
          {isWorkflowTask ? workflowStatus.toUpperCase() : 'LIVE'}
        </div>
      </div>
      <div className="side-panel-body">
        {isWorkflowTask ? <WorkflowRuntime task={currentTask} /> : null}
        {isWorkflowTask && agents.length > 0 ? <div className="workflow-runtime-feed-title">Agent activity</div> : null}
        {agents.length === 0 ? (
          !isWorkflowTask ? <div style={{color:'var(--dim-2)', fontSize:15, textAlign:'center', padding:'40px 12px', fontFamily:'Zpix'}}>
            Waiting for mission data...
          </div> : null
        ) : (
          agents.map(([id, data]) => (
            <LiveCard key={id} agentId={id} agentData={data} now={now} titleOverride={workflowActorLabels.get(id)} />
          ))
        )}
      </div>
    </div>
  );
}




// OAuth 模型只通过 model_id 下发；provider 由后端 resolver 基于 model_id 判定。

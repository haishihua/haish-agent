// 节点执行列表：等待输入的提示条、历史尝试折叠区、最新一次尝试与空态。纯 props in / JSX out。
import React from 'react';
import { ChatTimelineChevron } from '../../../chat/components/ChatTimelineNodes.jsx';
import { isTaskSettled } from '../../../conversations/model/conversation-status.js';
import { workflowResultForAttempt } from '../../model/runtime-workflow-layout.js';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';
import { NodeConversation } from './WorkflowNodeConversation.jsx';
import { visibleNodeAttempts } from './node-attempts.js';

export function WorkflowNodeAttempts({
  node,
  task,
  attempts,
  latestResult,
  status,
  attention = null,
  agentName = '',
  canRetry = false,
  retryLatest,
  historyOpen,
  onHistoryToggle,
}) {
  const visibleAttempts = visibleNodeAttempts(attempts, latestResult, node.id);
  const historicalAttempts = visibleAttempts.slice(0, -1);
  const latestAttempt = visibleAttempts.at(-1) || null;

  const renderAttempt = (attempt, index, isLatestAttempt) => {
    const attemptNumber = attempt?.result?.attempt || index + 1;
    return (
      <section className={`workflow-detail-attempt${isLatestAttempt ? ' is-latest' : ''}`} key={attempt?.id || `${node.id}-${index}`}>
        {!isLatestAttempt ? (
          <div className="workflow-detail-attempt-label">
            Attempt #{attemptNumber}
          </div>
        ) : null}
        {attempt?.result?.runtime_config ? <p className="workflow-runtime-actual-config">Executed with {attempt.result.runtime_config.model_id || 'provider default'} · thinking {attempt.result.runtime_config.reasoning_effort || 'Unspecified'}</p> : null}
        <NodeConversation
          node={node}
          task={task}
          attempt={attempt}
          result={workflowResultForAttempt(attempt, latestResult, isLatestAttempt, attemptNumber)}
          status={status}
          running={isLatestAttempt && (status === 'running' || status === 'waiting_input' || status === 'approval')}
          showApproval={isLatestAttempt && status === 'approval' && !isTaskSettled(task)}
          onRetry={isLatestAttempt && canRetry ? retryLatest : null}
          agentName={agentName}
          pendingInput={isLatestAttempt && attention?.status === 'waiting_input' ? attention.request : null}
        />
      </section>
    );
  };

  return (
    <>
      {status === 'waiting_input' ? (
        <div className="workflow-detail-waiting" role="status">
          <AppIcon name="message" size={18} />
          <span><strong>Waiting for your input</strong><small>Answer the question below to continue this node.</small></span>
        </div>
      ) : null}
      {historicalAttempts.length ? (
        <details
          className="workflow-detail-history"
          open={historyOpen}
          onToggle={(event) => onHistoryToggle(event.currentTarget.open)}
        >
          <summary className="workflow-detail-attempt-label workflow-detail-history-summary">
            <span className="workflow-detail-history-trigger">
              <span>Previous attempts ({historicalAttempts.length})</span>
              <ChatTimelineChevron open={historyOpen} />
            </span>
          </summary>
          {historicalAttempts.map((attempt, index) => renderAttempt(attempt, index, false))}
        </details>
      ) : null}
      {latestAttempt ? renderAttempt(latestAttempt, visibleAttempts.length - 1, true) : attention ? (
        <NodeConversation node={node} task={task} status={status} running showApproval agentName={agentName} pendingInput={attention.status === 'waiting_input' ? attention.request : null} />
      ) : (
        <div className="workflow-detail-empty" role="status">{status === 'running' ? 'Waiting for this node’s first event…' : 'No execution content recorded for this node.'}</div>
      )}
    </>
  );
}

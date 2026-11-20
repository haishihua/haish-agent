// 节点执行列表：等待输入的提示条、历史尝试折叠区、最新一次尝试与空态。
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';
import React from 'react';
import { Square, TriangleAlert } from 'lucide-react';
import { LoadingState } from '../../../../shared/ui/agent-elements/LoadingState.jsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { WorkflowStatusIcon } from '../WorkflowStatusIcon.jsx';
import { timestampValue } from '../../../../core/task-record.js';

import { isTaskSettled, normalizeTaskStatus } from '../../../../core/run-status.js';
import { workflowAgentName } from '../../../../core/assistant-name.js';
import { workflowResultForAttempt } from '../../../../core/runtime-workflow-layout.js';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';
import { NodeConversation } from './WorkflowNodeConversation.jsx';
import { taskFinalOutputText } from '../../../../core/runtime-events.js';
import { Markdown } from '../../../../shared/ui/Markdown.jsx';
import { visibleNodeAttempts } from '../../../../core/node-attempts.js';

export function WorkflowNodeAttempts({
  node,
  task,
  attempts,
  latestResult,
  status,
  attention = null,
  agentName = '',
  agentOptions = [],
  runtimeConfig = {},
  canRetry = false,
  retryLatest,

}) {
  const visibleAttempts = visibleNodeAttempts(attempts, latestResult, node.id);
  const latestAttempt = visibleAttempts.at(-1) || null;
  const [chosenAttempt, setChosenAttempt] = React.useState(null);
  const selectedIndex = chosenAttempt == null ? visibleAttempts.length - 1
    : visibleAttempts.findIndex((attempt, index) => (attempt.id || `attempt-${index}`) === chosenAttempt);
  const displayIndex = selectedIndex < 0 ? visibleAttempts.length - 1 : selectedIndex;

  if (node.type === 'output') {
    // Cancellation never produces an End result. Keep intermediate node text
    // on its own node rather than promoting it to a fabricated final answer.
    const terminalStatus = normalizeTaskStatus(task?.status);
    const failed = terminalStatus === 'failed';
    const processing = !isTaskSettled(task);
    if (terminalStatus === 'cancelled' || failed || processing) return (
      <div className="workflow-cancelled-empty" role="status">
        <div className={`workflow-result-state-icon${failed ? ' is-failed' : ''}`}>
          {processing ? <LoadingState label="" /> : failed ? <TriangleAlert size={48} strokeWidth={1.5} aria-hidden="true" /> : <Square size={48} strokeWidth={1.5} aria-hidden="true" />}
        </div>
        <h3>{processing ? 'Task in progress' : failed ? 'Task failed' : 'Task cancelled'}</h3>
        <p>{processing ? 'The final result will appear here when ready.' : failed ? 'Execution failed. No final result was generated.' : 'Execution was cancelled. No final result was generated.'}</p>
      </div>
    );
    const text = taskFinalOutputText(task, task?.answerText || latestResult?.summary || task?.error || '');
    return text ? <div className="workflow-final-output chat-bubble-text">
      <Markdown source={text} pathImages={false} />
    </div>
      : <div className="workflow-detail-empty" role="status">No final result yet.</div>;
  }
  const renderAttempt = (attempt, index, isLatestAttempt) => {
    const attemptNumber = attempt?.result?.attempt || index + 1;
    const attemptAgent = attempt?.result?.runtime_config?.agent_id;
    const attemptAgentName = attemptAgent
      ? workflowAgentName(attemptAgent, task, agentOptions)
      : agentName;
    return (
      <section className={`workflow-detail-attempt${isLatestAttempt ? ' is-latest' : ''}`} key={attempt?.id || `${node.id}-${index}`}>

        <NodeConversation
          node={node}
          runtimeConfig={runtimeConfig}
          task={task}
          attempt={attempt}
          result={workflowResultForAttempt(attempt, latestResult, isLatestAttempt, attemptNumber)}
          status={status}
          running={isLatestAttempt && (status === 'running' || status === 'waiting_input' || status === 'approval')}
          showApproval={isLatestAttempt && status === 'approval' && !isTaskSettled(task)}
          onRetry={isLatestAttempt && canRetry ? retryLatest : null}
          agentName={attemptAgentName}
          annotationAttempt={attemptNumber}
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
      {visibleAttempts.length > 1 ? (
        <div className="workflow-attempt-picker">
          <div className="workflow-attempt-picker-heading">Attempts <i aria-hidden="true">·</i><span>{visibleAttempts.length}</span></div>
          {visibleAttempts.map((attempt, index) => {
            const result = attempt.result || {};
            const last = index === visibleAttempts.length - 1;
            const finishedEvent = attempt.events?.findLast(event => event.type === 'workflow_node_finished');
            const recorded = result.status || finishedEvent?.status || finishedEvent?.result?.status;
            const attemptStatus = normalizeTaskStatus(recorded || (last ? status : 'unknown'));
            const cardResult = workflowResultForAttempt(attempt, latestResult, last, result.attempt || index + 1) || result;
            const selected = index === displayIndex;
            const finalAnswer = [cardResult.summary, cardResult.text, finishedEvent?.summary].find(value => typeof value === 'string' && value.trim()) || '';
            // Parse Markdown into its syntax tree and read rendered text, not raw markers.
            const summary = finalAnswer ? fromMarkdown(finalAnswer).children.map(block => toString(block)).join(' ').replace(/\s+/g, ' ').trim() : '';
            const start = timestampValue(attempt.startedAt || result.started_at);
            const end = timestampValue(attempt.finishedAt || result.finished_at);
            const seconds = start && end && end >= start ? Math.max(1, Math.round((end - start) / 1000)) : null;
            const duration = seconds == null ? '' : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
            return <button type="button" key={attempt.id || index}
              className={`workflow-attempt-choice${selected ? ' is-selected' : ''}`}
              aria-expanded={selected}
              onClick={() => setChosenAttempt(last ? null : attempt.id || `attempt-${index}`)}>
              <WorkflowStatusIcon status={attemptStatus} inline />
              <span className="workflow-attempt-choice-text"><strong>Attempt {result.attempt || index + 1}</strong>
                <small>{summary || (last ? 'Latest attempt' : 'Previous attempt')}</small></span>
              {duration ? <span className="workflow-attempt-duration">{duration}</span> : null}
              <span className="workflow-attempt-choice-arrow" aria-hidden="true">{selected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
            </button>;
          })}
        </div>
      ) : null}
      {latestAttempt ? renderAttempt(visibleAttempts[displayIndex], displayIndex, displayIndex === visibleAttempts.length - 1) : attention ? (
        <NodeConversation node={node} runtimeConfig={runtimeConfig} task={task} status={status} running showApproval agentName={agentName} pendingInput={attention.status === 'waiting_input' ? attention.request : null} />
      ) : (
        <div className="workflow-detail-empty" role="status">{status === 'running' ? 'Waiting for this node’s first event…' : 'No execution content recorded for this node.'}</div>
      )}
    </>
  );
}

import React from 'react';
import { TerminalDetail, DiffDetail } from '../../../shared/ui/agent-elements/ToolDetails.jsx';
import { ToolCall, ToolStatus } from '../../../shared/ui/agent-elements/ToolCall.jsx';
import { ToolTimeline } from '../../../shared/ui/agent-elements/ToolTimeline.jsx';
import { WebSearch } from '../../../shared/ui/agent-elements/WebSearch.jsx';
import { Bot, LoaderCircle, Sparkles } from 'lucide-react';
import { BrowserToolDetail } from './BrowserToolDetail.jsx';
import { VisionToolDetail } from './VisionToolDetail.jsx';
import { toolCardHeading } from '../model/tool-presentation.js';
import { ThinkingOrb } from 'thinking-orbs';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { Markdown } from '../../../shared/ui/Markdown.jsx';
import { IncrementalText } from '../../../shared/ui/IncrementalText.jsx';
import { AskUserInlineForm } from './AskUserInlineForm.jsx';
import { selectActiveAskUserItemId } from '../model/pending-user-input.js';
import { CATEGORY_ICON_CLASS } from '../model/run-catalog.js';
import { BrowserRuntimeCard, selectBrowserRuntimeRequest, useBrowserRuntimeRequests } from '../../approvals/components/ApprovalOverlay.jsx';
import { buildSubAgentTimelineItems, buildToolView } from '../model/tool-view.js';
import { resolveAgentActivity } from '../model/chat-timeline.js';
import { ToolApprovalCard, useToolApprovalRequests } from '../../approvals/components/ApprovalOverlay.jsx';
import { placeToolApprovals } from '../../approvals/model/approval-placement.js';

const ToolApprovalsContext = React.createContext(new Map());

export function resolveToolIconClass(toolName, defaultClass) {
  const name = String(toolName || '').toLowerCase();
  if (!name) return defaultClass;
  if (name === 'workspace_artifact') {
    return 'ico-workspace-artifact';
  }
  if (name === 'vision_analyze' || name === 'visual_inspect') {
    return 'ico-visual-inspect';
  }
  if (name === 'image_describe') {
    return 'ico-image-describe';
  }
  if (name === 'browser_use' || name === 'browser') {
    return 'ico-browser';
  }
  if (name === 'exec_command' || name === 'write_stdin') {
    return 'ico-terminal';
  }
  if (name === 'copy_file') {
    return 'ico-copy-file';
  }
  if (name === 'create_dir') {
    return 'ico-create-dir';
  }
  if (name === 'read_artifact') {
    return 'ico-read-artifact';
  }
  if (name === 'delete_file') {
    return 'ico-delete-file';
  }
  if (name === 'delete_dir') {
    return 'ico-delete-dir';
  }
  if (name === 'todo_write') {
    return 'ico-todo-write';
  }
  if (name === 'list_dir') {
    return 'ico-list-dir';
  }
  if (name === 'glob_files') {
    return 'ico-glob-files';
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return 'ico-checkpoint';
  }
  if (name.startsWith('note_')) {
    return 'ico-note';
  }
  if (name === 'search_text') {
    return 'ico-search-text';
  }
  if (name === 'edit_file' || name === 'replace_lines' || name === 'multi_edit' || name === 'apply_patch') {
    return 'ico-file-write';
  }
  if (
    name.startsWith('document_') ||
    name.includes('rag') ||
    name.includes('knowledge') ||
    name.includes('retrieve') ||
    name.includes('vector') ||
    name.includes('embed')
  ) {
    return 'ico-rag';
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'ico-memory';
  }
  if (name.includes('weather') || name.includes('forecast') || name.includes('temperature')) {
    return 'ico-weather';
  }
  if (name.includes('write') || name.includes('create_file') || name.includes('save_file') || name.includes('patch')) {
    return 'ico-file-write';
  }
  if (
    name.includes('read_file') ||
    name.includes('read_text') ||
    name.includes('open_file') ||
    name.includes('cat_file') ||
    name.includes('view_file')
  ) {
    return 'ico-file-read';
  }
  if (
    name.includes('web') ||
    name.includes('search') ||
    name.includes('fetch') ||
    name.includes('http') ||
    name.includes('url')
  ) {
    return 'ico-web';
  }
  return defaultClass;
}

/**
 * 复用的 collapse/expand chevron。
 * 用 inline SVG 而不是 <img src=...png>——因为全局 body 有 `image-rendering: pixelated`
 * 会把任何位图强制走最邻近缩放、变得很糊。SVG 是矢量，不受影响。
 * fill="currentColor" 让箭头颜色跟随容器 color（比如折叠胶囊的金色）。
 *
 * open=false → ▸ (next, 朝右)
 * open=true  → ▾ (down, 朝下)
 */
export function ChatTimelineChevron({ open }) {
  return (
    <svg
      className={`chat-timeline-chevron ${open ? 'is-open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? <polyline points="6 9 12 16 18 9" /> /* down */ : <polyline points="9 6 16 12 9 18" /> /* next */}
    </svg>
  );
}

function ChatTimelineToolBody({ view, conversationId, taskId }) {
  if (view.mode === 'terminal') {
    return <TerminalDetail view={view} />;
  }
  if (view.mode === 'process') {
    return view.isVision ? <VisionToolDetail view={view} />
      : <ChatProcessConversation view={view} conversationId={conversationId} taskId={taskId} />;
  }
  if (view.mode === 'diff') return <DiffDetail view={view} />;
  if (view.mode === 'web-search') return <WebSearch {...view.search}
    running={view.running} failed={view.failed} cancelled={view.cancelled} />;
  if (view.mode === 'browser') return <BrowserToolDetail {...view.browser} taskId={taskId}
    running={view.running} failed={view.failed} cancelled={view.cancelled} />;
  if (view.mode === 'json') {
    return <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson || view.body} />;
  }
  return null;
}

export function ChatTodoPanel({ todos = [], streaming = false }) {
  const safeTodos = Array.isArray(todos) ? todos : [];
  const [expanded, setExpanded] = React.useState(true);
  if (!safeTodos.length) return null;

  const completedCount = safeTodos.filter((todo) => todo.status === 'completed').length;
  const allCompleted = completedCount === safeTodos.length;
  const hasActiveTodo = safeTodos.some((todo) => todo.status === 'in_progress');
  const headerStatus = allCompleted ? 'completed' : (completedCount > 0 || hasActiveTodo) ? 'in_progress' : 'pending';

  return (
    <section className={`chat-todo-panel ${streaming ? 'streaming' : 'done'}`} aria-label="To-dos">
      <button
        type="button"
        className="chat-todo-head"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} to-dos`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="chat-todo-head-icon">
          {headerStatus === 'in_progress' ? (
            <span className="chat-todo-progress" style={{ '--todo-progress': `${completedCount / safeTodos.length * 100}%` }} aria-label={`${completedCount} of ${safeTodos.length} completed`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </span>
          ) : <ChatTodoStatusIcon status={headerStatus} />}
        </span>
        <span className="chat-todo-title">To-dos</span>
        <span className="chat-todo-count" aria-label={`${completedCount} of ${safeTodos.length} completed`}>
          {completedCount}/{safeTodos.length}
        </span>
        <span className={`chat-todo-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true" />
      </button>
      <div className={`chat-todo-collapsible ${expanded ? 'is-open' : ''}`}>
        <div className="chat-todo-collapsible-inner">
          <div className="chat-todo-list" role="list">
            {safeTodos.map((todo, index) => (
              <ChatTodoRow key={todo.id || `${todo.content}-${index}`} todo={todo} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatTodoRow({ todo }) {
  const status = todo.status || 'pending';
  return (
    <div className={`chat-todo-item status-${status}`} role="listitem">
      <ChatTodoStatusIcon status={status} />
      <span className="chat-todo-content">{todo.content}</span>
    </div>
  );
}

function ChatTodoStatusIcon({ status }) {
  if (status === 'completed') {
    return (
      <span className="chat-todo-icon completed" aria-label="completed">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 L6.8 11.7 L12.5 5" />
        </svg>
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="chat-todo-icon in-progress" aria-label="in progress">
        <svg className="chat-todo-current-arrow" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 8h8M8.5 4.5 12 8l-3.5 3.5" />
        </svg>
      </span>
    );
  }
  return <span className="chat-todo-icon pending" aria-label="pending" />;
}

function ChatJsonBlock({ text, compact = false }) {
  if (!text) return null;
  return <pre className={`chat-json-block ${compact ? 'compact' : ''}`}>{text}</pre>;
}

function ChatJsonPair({ requestJson, responseJson }) {
  const id = React.useId();
  const segments = [];
  if (requestJson) segments.push({ id: 'request', label: 'Request', text: requestJson });
  if (responseJson) segments.push({ id: 'response', label: 'Response', text: responseJson });
  const [activeId, setActiveId] = React.useState('response');
  const active = segments.find((seg) => seg.id === activeId) || segments[segments.length - 1];
  if (!active) return null;
  return (
    <div className="chat-json-card">
      {segments.length > 1 ? (
        <div className="chat-json-segments" role="tablist" aria-label="Tool data">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              role="tab"
              id={`${id}-${seg.id}`}
              aria-controls={`${id}-panel`}
              tabIndex={seg.id === active.id ? 0 : -1}
              aria-selected={seg.id === active.id}
              className={`chat-json-segment ${seg.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(seg.id)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? segments[0] : event.key === 'End' ? segments.at(-1)
                  : segments.find((segment) => segment.id !== active.id);
                setActiveId(next.id);
                document.getElementById(`${id}-${next.id}`)?.focus();
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-json-card-head">
          <span className="chat-json-card-title">{active.label}</span>
        </div>
      )}
      <pre className="chat-json-card-body" id={`${id}-panel`} role={segments.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={segments.length > 1 ? `${id}-${active.id}` : undefined} tabIndex={0}>
        <JsonText text={active.text} />
      </pre>
    </div>
  );
}

function JsonText({ text }) {
  // Tokenize as text so truncated JSON remains readable and never becomes HTML.
  return String(text).split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g).map((part, index) => {
    const kind = part.startsWith('"') ? (part.trimEnd().endsWith(':') ? 'key' : 'string')
      : /^(?:true|false|null|-?\d)/.test(part) ? 'value' : '';
    return kind ? <span key={index} className={`aui-json-${kind}`}>{part}</span> : part;
  });
}

function ChatSubAgentCollapsible({ children, maxHeight = 360 }) {
  const bodyId = React.useId();
  const bodyRef = React.useRef(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      setOverflows((prev) => (prev === overflow ? prev : overflow));
    };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
    };
  }, [children, expanded]);
  const showToggle = overflows || expanded;
  return (
    <div
      className={`chat-subagent-collapsible ${expanded ? 'is-expanded' : ''} ${overflows && !expanded ? 'is-collapsed' : ''}`}
    >
      <div
        ref={bodyRef}
        id={bodyId}
        className="chat-subagent-collapsible-body"
        style={expanded ? null : { maxHeight: `${maxHeight}px` }}
      >
        {children}
      </div>
      {showToggle ? (
        <button type="button" className="chat-subagent-show-toggle" aria-expanded={expanded}
          aria-controls={bodyId} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'View All'}
        </button>
      ) : null}
    </div>
  );
}

function ChatProcessConversation({ view, conversationId, taskId }) {
  const hasPrompt = Boolean(view.task || view.role || view.systemPrompt);
  const streamAnswerText = String(view.streamAnswerText || '');
  const hasStreamAnswer = Boolean(streamAnswerText.trim());
  const hasStream = Array.isArray(view.streamLines) && view.streamLines.length > 0;
  const subTimelineItems = buildSubAgentTimelineItems(view);
  const hasSubTimeline = subTimelineItems.length > 0;
  const hasFinal = Boolean(view.finalText);
  if (!hasPrompt && !hasSubTimeline && !hasStreamAnswer && !hasStream && !hasFinal && !view.requestJson) {
    return null;
  }
  const fields = [];
  if (view.role) fields.push({ label: 'Role', value: view.role });
  if (view.systemPrompt)
    fields.push({ label: 'System Prompt', value: view.systemPrompt, multiline: true, markdown: true });
  if (view.task) fields.push({ label: 'Task', value: view.task, multiline: true, markdown: true });
  const renderSubContent = () => {
    if (hasFinal) {
      return <ChatSubAgentCollapsible><Markdown source={view.finalText} /></ChatSubAgentCollapsible>;
    }
    if (hasSubTimeline) {
      return (
        <ChatSubAgentCollapsible maxHeight={420}>
          <ChatAgentTimeline items={subTimelineItems} streaming={view.isRunning}
            conversationId={conversationId} taskId={taskId} />
        </ChatSubAgentCollapsible>
      );
    }
    if (hasStreamAnswer || hasStream) {
      return (
        <ChatSubAgentCollapsible>
          {hasStreamAnswer ? (
            <div className="chat-timeline-text">
              <IncrementalText text={streamAnswerText} streaming={view.isRunning} />
              {view.isRunning ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
            </div>
          ) : null}
          {hasStream ? (
            <div className="chat-subagent-activity" aria-label="Sub-agent activity">
              {view.streamLines.map((row) => (
                <div key={row.id} className={`chat-subagent-activity-line ${row.state || ''}`}>
                  {row.text}
                </div>
              ))}
            </div>
          ) : null}
          {!hasStreamAnswer && view.isRunning ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
        </ChatSubAgentCollapsible>
      );
    }
    return <ChatAgentTimeline streaming={view.isRunning} conversationId={conversationId} taskId={taskId} />;
  };
  const showSub = hasSubTimeline || hasStreamAnswer || hasStream || hasFinal || view.isRunning;
  return (
    <div className="chat-subagent-conversation">
      {hasPrompt ? (
        <div className="chat-subagent-message chat-subagent-dispatch message-shell">
          <div className="chat-subagent-speaker">
            <span>Main agent</span>
            <span className="chat-subagent-avatar" aria-hidden="true"><span className="ico-assistant-avatar" /></span>
          </div>
          <div className="message-speech-body">
            {fields.length > 0 ? (
              <div className="chat-subagent-fields">
                {fields.map((field) => (
                  <div key={field.label} className="chat-subagent-field">
                    {field.label !== 'Task' || fields.length > 1 ? <div className="chat-subagent-field-label">{field.label}</div> : null}
                    <div className={`chat-subagent-field-value ${field.markdown ? 'is-md' : ''}`} tabIndex={field.multiline ? 0 : undefined}>
                      {field.markdown ? <Markdown source={String(field.value || '')} /> : field.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showSub ? (
        <div className="chat-subagent-message chat-subagent-reply message-shell">
          <div className="chat-subagent-speaker">
            <span className="chat-subagent-avatar" aria-hidden="true"><Bot size={18} /></span>
            <span>{view.role || 'Sub-agent'}</span>
          </div>
          <div className="message-speech-body">
            {renderSubContent()}
          </div>
        </div>
      ) : null}

      {!hasPrompt && !showSub && view.requestJson ? <ChatJsonBlock text={view.requestJson} compact /> : null}
    </div>
  );
}

export function ChatTimelineToolNode({ item, conversationId = '', taskId = '', askUserActive = false }) {
  const approvalRequest = React.useContext(ToolApprovalsContext).get(item.id);
  const isAskUser = String(item.toolName || '').toLowerCase() === 'ask_user';
  const status = item.status || 'pending';
  const category = item.category || 'tool';
  const defaultIconClass = CATEGORY_ICON_CLASS[category] || CATEGORY_ICON_CLASS.tool;
  // 先按 toolName 匹配专属 icon；匹配不到再退回 skill/mcp/subagent 分类图标。
  const iconClass = resolveToolIconClass(item.toolName, defaultIconClass);
  const view = buildToolView(item);
  const heading = toolCardHeading(item, view);
  const isSkill = view.mode === 'skill';
  const displayStatus = approvalRequest ? 'approval' : view.failed ? 'failed' : status;
  const skillStatus = ['done', 'completed'].includes(displayStatus) ? 'Loaded'
    : displayStatus === 'failed' ? 'Load failed' : displayStatus === 'cancelled' ? 'Cancelled' : 'Loading';
  // 默认折叠：shell/terminal 卡片不自动展开，用户点击头部才展开查看输出。
  const [open, setOpen] = React.useState(Boolean(view.defaultOpen));
  React.useEffect(() => setOpen(false), [conversationId, taskId, item.id]);
  const fallbackLines = view.mode === 'read' ? [] : [item.inputSummary, item.outputSummary].filter(Boolean).slice(0, 2);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const isBrowserUse = String(item.toolName || '').toLowerCase() === 'browser_use';
  // Browser-runtime install requests render inline inside the browser_use
  // tool call that triggered them, instead of opening a separate chat row /
  // dialog. Matching tolerates the backend's opaque call-id remapping,
  // so unanchored requests attach to the active browser_use node when the
  // scope is unambiguous; everything else stays in the standalone slot.
  const pendingBrowserRuntime = useBrowserRuntimeRequests(isBrowserUse);
  const browserRuntimeRequest = selectBrowserRuntimeRequest(pendingBrowserRuntime, {
    toolName: item.toolName,
    callId: item.callId,
    status,
    conversationId,
    taskId,
  });
  const hasBody = !isSkill && !approvalRequest && (view.mode === 'terminal'
    ? Boolean(view.command || view.stdout || view.stderr || view.running || hasChildren)
    : (
      Boolean(view.body) ||
      Boolean(view.requestJson) ||
      Boolean(view.responseJson) ||
      Boolean(view.search) || Boolean(view.browser) ||
      (Array.isArray(view.streamLines) && view.streamLines.length > 0) ||
      Boolean(view.finalText) ||
      fallbackLines.length > 0 ||
      hasChildren
    ));
  return (
    <div
      className={`chat-timeline-tool chat-tool-node category-${category} status-${displayStatus} mode-${view.mode}`}
      data-tool-call-id={item.callId || ''}
      data-tool-name={String(item.toolName || '').toLowerCase()}
    >
      {isSkill ? <div className="aui-tool-trigger is-static aui-skill-line">
        <Sparkles size={14} aria-hidden="true" />
        <span className={`aui-tool-label ${displayStatus === 'running' ? 'is-running' : ''}`}>{view.label}</span>
        <span className="aui-skill-state">{skillStatus}</span>
        <ToolStatus status={displayStatus} label={skillStatus} />
      </div> : <ToolCall label={approvalRequest ? `${item.toolName} · Awaiting approval` : heading.label}
        query={approvalRequest ? '' : heading.query} status={displayStatus} open={open} onOpenChange={setOpen} expandable={hasBody}
        icon={<span className={`ico ${iconClass}`} />}>
          {view.mode !== 'read' ? <ChatTimelineToolBody view={view} conversationId={conversationId} taskId={taskId} /> : null}
          {view.mode === 'read' &&
            fallbackLines.map((line, index) => (
              <div key={index} className="chat-timeline-tool-line">
                {line}
              </div>
            ))}
          {hasChildren ? (
            <div className="chat-timeline-tool-children">
              {item.children.map((child) => (
                <ChatTimelineToolNode
                  key={child.id}
                  item={child}
                  conversationId={conversationId}
                  taskId={taskId}
                  askUserActive={askUserActive}
                />
              ))}
            </div>
          ) : null}
      </ToolCall>}
      {isSkill && hasChildren ? <div className="chat-timeline-tool-children">
        {item.children.map((child) => <ChatTimelineToolNode key={child.id} item={child}
          conversationId={conversationId} taskId={taskId} askUserActive={askUserActive} />)}
      </div> : null}
      {isAskUser ? (
        <AskUserInlineForm
          toolCallId={item.callId || ''}
          toolInput={item.toolInput || null}
          conversationId={conversationId}
          taskId={taskId}
          active={askUserActive}
        />
      ) : null}
      {browserRuntimeRequest ? <BrowserRuntimeCard request={browserRuntimeRequest} embedded /> : null}
      {approvalRequest ? <ToolApprovalCard request={approvalRequest} embedded /> : null}
    </div>
  );
}

// Keep the existing action-count summary and per-call interaction inside
// the assistant-ui timeline surface.
function ChatTimelineToolGroup({
  item,
  conversationId = '',
  taskId = '',
  askUserActive = false,
}) {
  const [open, setOpen] = React.useState(false);
  const approvals = React.useContext(ToolApprovalsContext);
  React.useEffect(() => setOpen(false), [conversationId, taskId, item.id]);
  const status = item.status || 'done';
  const tools = Array.isArray(item.tools) ? item.tools : [];
  const needsApproval = tools.some((tool) => approvals.has(tool.id));
  const expanded = open || needsApproval;
  const summary = item.summary || `used ${tools.length} tools`;

  return (
    <ToolTimeline summary={summary} steps={tools} status={status} open={expanded} onOpenChange={setOpen}
      renderStep={(tool) => (
            <ChatTimelineToolNode
              key={tool.id}
              item={tool}
              conversationId={conversationId}
              taskId={taskId}
              askUserActive={askUserActive}
            />
      )} />
  );
}

function ChatTimelineMetaNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const isContextCompaction = String(item.summary || '').toLowerCase() === 'auto-compacting context';
  const isRetry = item.metaType === 'llm_retry';
  const summaryText = String(item.summaryText || '').trim();
  const details = Array.isArray(item.details) ? item.details : [];
  const expandable = isContextCompaction && Boolean(summaryText);
  if (isRetry) {
    return <div className={`chat-timeline-meta chat-tool-node is-retry status-${item.status || 'done'}`}
      role="status" aria-live="polite" aria-atomic="true">
      <ToolCall label={item.summary || 'Retrying model response…'} status={item.status || 'done'} expandable={false}
        statusIcon={LoaderCircle}
        icon={<AppIcon name="retry" size={13} className="chat-timeline-retry-icon" />} />
    </div>;
  }
  return (
    <div
      className={`chat-timeline-meta chat-tool-node status-${item.status || 'done'} ${isContextCompaction ? 'is-compaction' : ''}`}
    >
      <ToolCall label={item.summary || 'Thinking…'} status={item.status || 'done'}
        statusIcon={isContextCompaction ? LoaderCircle : undefined}
        open={open} onOpenChange={setOpen} expandable={expandable}
        icon={isContextCompaction ? <span className="chat-timeline-compaction-icon" /> : null}>
        <div className="chat-timeline-meta-body">
          {details.length > 0 ? (
            <div className="chat-timeline-meta-stats">{details.join(' · ')}</div>
          ) : null}
          <div className="chat-timeline-meta-summary" tabIndex={0}><Markdown source={summaryText} /></div>
        </div>
      </ToolCall>
    </div>
  );
}

function ChatTimelineThinkingNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const text = String(item.text || '');
  const hasText = text.trim().length > 0;
  const charCount = text.length;
  return (
    <div className={`chat-timeline-thinking status-${item.status || 'done'} ${item.streaming ? 'streaming' : ''}`}>
      <button
        type="button"
        className="chat-timeline-thinking-head"
        onClick={() => hasText && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasText}
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        <span className="ico ico-thinking" aria-label="Thinking" role="img" />
        {hasText ? <span className="chat-timeline-thinking-count">{charCount} chars</span> : null}
        <ChatTimelineChevron open={open} />
      </button>
      {open && hasText ? <div className="chat-timeline-thinking-body">{text}</div> : null}
    </div>
  );
}

export function ChatTimelineUserInputNode({ item, onPreviewImage }) {
  const text = String(item.text || '').trim();
  const images = Array.isArray(item.images) ? item.images : [];
  if (!text && images.length === 0) return null;
  // 纠偏/打断指令与正常用户消息完全一致：右侧对齐的蓝色渐变气泡，
  // 不加任何特殊标签（You / Queued instruction）或虚线边框。
  return (
    <div className="chat-timeline-user-input">
      <div className="chat-timeline-user-input-bubble">
        {images.length > 0 ? (
          <div className="chat-message-images chat-timeline-user-input-images" aria-label="Attached images">
            {images.map((image, index) => (
              <div key={image.image_id || image.path || index} className="chat-message-image">
                <button
                  type="button"
                  className="chat-message-image-button"
                  onClick={() => onPreviewImage?.({
                    src: image.previewUrl || image.path,
                    title: image.name || image.path || 'Attached image',
                  })}
                  aria-label="Preview attached image"
                >
                  {image.previewUrl ? <img src={image.previewUrl} alt="" draggable={false} /> : null}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {text ? <p className="chat-timeline-user-input-text">{text}</p> : null}
      </div>
    </div>
  );
}

export function ChatAgentTimeline({
  items = [],
  streaming = false,
  latestTodos = null,
  conversationId = '',
  taskId = '',
  onPreviewImage,
}) {
  const safeItems = React.useMemo(() => Array.isArray(items) ? items : [], [items]);
  const approvalRequests = useToolApprovalRequests();
  const toolApprovals = React.useMemo(() => placeToolApprovals(safeItems, approvalRequests, taskId, conversationId), [safeItems, approvalRequests, taskId, conversationId]);
  const todos = Array.isArray(latestTodos) && latestTodos.length > 0 ? latestTodos : null;
  const retrying = safeItems.some((item) => item.metaType === 'llm_retry' && item.status === 'running');
  const activeAskUserItemId = selectActiveAskUserItemId(safeItems, streaming);
  const activity = resolveAgentActivity(safeItems, streaming);
  // Empty timeline + done + no todos = nothing to show.
  // Empty timeline + streaming = activity indicator carries the "alive" hint.
  // Has todos = always show the panel even if there are no other items.
  if (!safeItems.length && !streaming && !todos) return null;
  return (
    <ToolApprovalsContext.Provider value={toolApprovals}>
    <div className={`chat-timeline ${streaming ? 'streaming' : 'done'}`}>
      {safeItems.map((item) => {
        if (item.kind === 'text') {
          return (
            <div key={item.id} className={`chat-timeline-text ${item.streaming ? 'streaming' : ''}`}>
              <IncrementalText text={item.text} streaming={item.streaming} />
              {item.streaming ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
            </div>
          );
        }
        if (item.kind === 'tool') {
          return (
            <ChatTimelineToolNode
              key={item.id}
              item={item}
              conversationId={conversationId}
              taskId={taskId}
              askUserActive={item.id === activeAskUserItemId}
            />
          );
        }
        if (item.kind === 'tool_group') {
          return (
            <ChatTimelineToolGroup
              key={item.id}
              item={item}
              conversationId={conversationId}
              taskId={taskId}
              askUserActive={false}
            />
          );
        }
        if (item.kind === 'thinking') {
          return <ChatTimelineThinkingNode key={item.id} item={item} />;
        }
        if (item.kind === 'user_input') {
          return <ChatTimelineUserInputNode key={item.id} item={item} onPreviewImage={onPreviewImage} />;
        }
        if (item.kind === 'meta') {
          return <ChatTimelineMetaNode key={item.id} item={item} />;
        }
        return null;
      })}
      {activity && !retrying ? (
        <div className={`chat-timeline-activity state-${activity.state}`} role="status" aria-live="polite">
          <ThinkingOrb
            state={activity.state === 'composing' ? 'working' : activity.state === 'working' ? 'composing' : activity.state}
            size={64}
            theme="dark"
            style={{ width: 40, height: 40 }}
            aria-hidden="true"
          />
          <span className="chat-timeline-activity-label" aria-label={activity.label}>
            <span
              className="chat-timeline-activity-text"
              style={{ '--activity-spread': `${activity.label.replace(/…$/, '').length * 2}px` }}
              aria-hidden="true"
            >
              {activity.label.replace(/…$/, '')}
            </span>
            <span className="chat-timeline-activity-dots" aria-hidden="true">
              <span /><span /><span />
            </span>
          </span>
        </div>
      ) : null}
      {todos ? <ChatTodoPanel todos={todos} streaming={streaming} /> : null}
    </div>
    </ToolApprovalsContext.Provider>
  );
}

export function ChatTimelineCollapsed({ onExpand, label = 'Trace', expanded = false }) {
  return (
    <button type="button" className="chat-timeline-collapsed" onClick={onExpand}>
      <ChatTimelineChevron open={expanded} />
      <span className="chat-timeline-collapsed-text">{label}</span>
    </button>
  );
}

export function ChatTimelineElapsedPill({ label }) {
  if (!label) return null;
  return (
    <div className="chat-timeline-collapsed chat-timeline-elapsed-pill" aria-label={`Task elapsed ${label}`}>
      <span className="chat-timeline-collapsed-text">{label}</span>
    </div>
  );
}

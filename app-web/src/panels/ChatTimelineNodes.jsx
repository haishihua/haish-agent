// @haish-esm
import React from 'react';
import { Markdown } from '../Effects.jsx';
import { CHAR_DEFS } from '../Sprites.jsx';
import { PortalTooltip } from './PortalTooltip.jsx';
import { CATEGORY_ICON_CLASS, CATEGORY_LABEL } from './shared-constants.jsx';
import { normalizeToolName } from '../lib/tool-names.js';
import {
  TOOL_READ_NAMES,
  TOOL_DIFF_NAMES,
  TOOL_CHANGE_NAMES,
  TOOL_SHELL_NAMES,
  TOOL_PROCESS_NAMES,
  TOOL_BLOCK_LIMIT,
  compactToolText,
  stableJson,
  compactToolValue,
  truncateToolString,
  tailToolOutput,
  sanitizeToolJson,
  compactToolJsonPayload,
  isEmptyToolJsonValue,
  toolJsonText,
  outputJsonText,
  toolPlainObject,
  isToolFailure,
  firstToolDisplayValue,
  isRawToolResponseText,
  isVisualProcessTool,
  isProcessTool,
  getToolSubject,
  firstToolPath,
  toolStreamTextForEvent,
  buildToolStreamAnswerText,
  buildToolStreamLines,
  subAgentEventText,
  subAgentToolEventKey,
  subAgentToolNameKey,
  findPendingSubAgentTool,
  subAgentToolCategory,
  buildSubAgentTimelineItems,
  extractProcessResultText,
  extractTerminalOutput,
  toolDisplayOutput,
  toolLineDelta,
  getToolDiff,
  toolActionLabel,
  toolFailureActionLabel,
  extractProcessChatMeta,
  buildToolView,
} from '../lib/tool-view.js';

const { useState, useEffect, useMemo, useRef } = React;

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
  if (name === 'terminal') {
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
  if (name.includes('background_process')) {
    return 'ico-background-process';
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
  if (name.startsWith('document_') || name.includes('rag') || name.includes('knowledge') || name.includes('retrieve')
      || name.includes('vector') || name.includes('embed')) {
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
  if (name.includes('read_file') || name.includes('read_text') || name.includes('open_file')
      || name.includes('cat_file') || name.includes('view_file')) {
    return 'ico-file-read';
  }
  if (name.includes('web') || name.includes('search') || name.includes('fetch')
      || name.includes('http') || name.includes('url')) {
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
      {open
        ? <polyline points="6 9 12 16 18 9" />   /* down */
        : <polyline points="9 6 16 12 9 18" />   /* next */}
    </svg>
  );
}

export function ChatTimelineToolBody({ view }) {
  if (view.mode === 'terminal') {
    const hasTerminalContent = Boolean(view.command || view.stdout || view.stderr || view.running);
    return (
      <>
        {hasTerminalContent ? (
          <div className="chat-terminal-frame">
            <div className="chat-terminal-bar">
              <span className="chat-terminal-dots" aria-hidden="true"><span /><span /><span /></span>
              {view.cwd ? <span className="chat-terminal-cwd">{view.cwd}</span> : null}
              {view.running || (view.exitCode !== undefined && view.exitCode !== '') ? (
                <span className={`chat-terminal-state ${view.running ? 'running' : ''}`}>
                  {view.running ? 'running' : `exit ${view.exitCode}`}
                </span>
              ) : null}
            </div>
            {view.command ? (
              <div className="chat-terminal-command">
                <span className="chat-terminal-prompt">$</span>
                <span>{view.command}</span>
              </div>
            ) : null}
            {view.stdout ? <pre className="chat-terminal-output">{view.stdout}</pre> : null}
            {view.stderr ? <pre className="chat-terminal-output stderr">{view.stderr}</pre> : null}
            {view.running && !view.stdout && !view.stderr ? (
              <div className="chat-terminal-waiting">Waiting for output<span className="chat-terminal-cursor" aria-hidden="true" /></div>
            ) : null}
          </div>
        ) : null}
        {!hasTerminalContent ? <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson} /> : null}
      </>
    );
  }
  if (view.mode === 'process') {
    return <ChatProcessConversation view={view} />;
  }
  if (view.mode === 'diff') {
    if (!view.body) return null;
    return (
      <pre className="chat-timeline-tool-code diff">
        {view.body.split('\n').map((line, index) => {
          const kind = line.startsWith('+') && !line.startsWith('+++')
            ? 'add'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'remove'
              : line.startsWith('@@')
                ? 'hunk'
                : 'context';
          return <span key={index} className={`chat-tool-diff-line ${kind}`}>{line || ' '}</span>;
        })}
      </pre>
    );
  }
  if (view.mode === 'json') {
    return <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson || view.body} />;
  }
  return null;
}

export const CHAT_TODO_COLLAPSED_COMPLETED_LIMIT = 2;

export function ChatTodoPanel({ todos = [], streaming = false }) {
  const safeTodos = Array.isArray(todos) ? todos : [];
  const [showAllCompleted, setShowAllCompleted] = React.useState(false);
  if (!safeTodos.length) return null;

  // 渲染顺序：in_progress 最前 → pending 居中 → completed 最后。
  // 不动原数组，按 status 分组聚合即可。
  const inProgress = safeTodos.filter((t) => t.status === 'in_progress');
  const pending = safeTodos.filter((t) => t.status === 'pending');
  const completed = safeTodos.filter((t) => t.status === 'completed');

  const visibleCompleted = showAllCompleted
    ? completed
    : completed.slice(-CHAT_TODO_COLLAPSED_COMPLETED_LIMIT);
  const hiddenCount = completed.length - visibleCompleted.length;

  return (
    <div className={`chat-todo-panel ${streaming ? 'streaming' : 'done'}`} role="list">
      {inProgress.map((todo, index) => (
        <ChatTodoRow key={`ip-${index}`} todo={todo} streaming={streaming} />
      ))}
      {pending.map((todo, index) => (
        <ChatTodoRow key={`pe-${index}`} todo={todo} streaming={streaming} />
      ))}
      {visibleCompleted.map((todo, index) => (
        <ChatTodoRow key={`co-${index}`} todo={todo} streaming={streaming} />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="chat-todo-expand"
          onClick={() => setShowAllCompleted(true)}
        >
          … +{hiddenCount} completed
        </button>
      ) : null}
    </div>
  );
}

export function ChatTodoRow({ todo, streaming = false }) {
  const status = todo.status || 'pending';
  // 已完成、或本轮非 streaming 状态的 in_progress 项不要再继续转 spinner。
  // 只有"任务还在 running 时的 in_progress 项"才显示真正的旋转动画。
  const showLiveSpinner = status === 'in_progress' && streaming;
  return (
    <div className={`chat-todo-item status-${status}`} role="listitem">
      <ChatTodoStatusIcon status={status} live={showLiveSpinner} />
      <span className="chat-todo-content">{todo.content}</span>
    </div>
  );
}

export function ChatTodoStatusIcon({ status, live = false }) {
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
        <span className={`chat-todo-spinner ${live ? 'live' : ''}`} />
      </span>
    );
  }
  return <span className="chat-todo-icon pending" aria-label="pending" />;
}

export function ChatJsonBlock({ text, compact = false }) {
  if (!text) return null;
  return (
    <pre className={`chat-json-block ${compact ? 'compact' : ''}`}>
      {text}
    </pre>
  );
}

export function ChatJsonPair({ requestJson, responseJson }) {
  if (!requestJson && !responseJson) return null;
  const segments = [];
  if (requestJson) segments.push({ id: 'request', label: 'Request', text: requestJson });
  if (responseJson) segments.push({ id: 'response', label: 'Response', text: responseJson });
  const defaultId = responseJson ? 'response' : 'request';
  const [activeId, setActiveId] = React.useState(defaultId);
  const active = segments.find((seg) => seg.id === activeId) || segments[0];
  if (!active) return null;
  return (
    <div className="chat-json-card">
      {segments.length > 1 ? (
        <div className="chat-json-segments" role="tablist">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={seg.id === active.id}
              className={`chat-json-segment ${seg.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(seg.id)}
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
      <pre className="chat-json-card-body">{active.text}</pre>
    </div>
  );
}

export function chatProcessFileName(path) {
  if (!path) return '';
  const segments = String(path).split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

export function ChatImsgCollapsible({ children, maxHeight = 360 }) {
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
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [children, expanded]);
  const showToggle = overflows || expanded;
  return (
    <div className={`chat-imsg-collapsible ${expanded ? 'is-expanded' : ''} ${overflows && !expanded ? 'is-collapsed' : ''}`}>
      <div
        ref={bodyRef}
        className="chat-imsg-collapsible-body"
        style={expanded ? null : { maxHeight: `${maxHeight}px` }}
      >
        {children}
      </div>
      {showToggle ? (
        <button
          type="button"
          className="chat-imsg-show-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse' : 'View All'}
        </button>
      ) : null}
    </div>
  );
}

export function ChatProcessConversation({ view }) {
  const hasPrompt = Boolean(view.task || view.role || view.systemPrompt || view.mediaPath);
  const streamAnswerText = String(view.streamAnswerText || '');
  const hasStreamAnswer = Boolean(streamAnswerText.trim());
  const hasStream = Array.isArray(view.streamLines) && view.streamLines.length > 0;
  const subTimelineItems = buildSubAgentTimelineItems(view);
  const hasSubTimeline = subTimelineItems.length > 0;
  const hasFinal = Boolean(view.finalText);
  if (!hasPrompt && !hasSubTimeline && !hasStreamAnswer && !hasStream && !hasFinal && !view.requestJson) {
    return null;
  }
  const fileName = chatProcessFileName(view.mediaPath);
  const fields = [];
  if (view.role) fields.push({ label: 'Role', value: view.role });
  if (view.systemPrompt) fields.push({ label: 'System Prompt', value: view.systemPrompt, multiline: true, markdown: true });
  if (view.task) fields.push({ label: 'Task', value: view.task, multiline: true, markdown: true });
  const renderSubContent = () => {
    if (hasFinal) {
      const inner = view.isVision
        ? <div className="chat-imsg-plain">{view.finalText}</div>
        : <Markdown source={view.finalText} />;
      return <ChatImsgCollapsible maxHeight={360}>{inner}</ChatImsgCollapsible>;
    }
    if (hasSubTimeline) {
      return (
        <ChatImsgCollapsible maxHeight={420}>
          <div className="chat-imsg-subtimeline">
            <ChatAgentTimeline items={subTimelineItems} streaming={view.isRunning} />
          </div>
        </ChatImsgCollapsible>
      );
    }
    if (hasStreamAnswer || hasStream) {
      return (
        <ChatImsgCollapsible maxHeight={360}>
          {hasStreamAnswer ? (
            <div className="chat-imsg-stream-answer">
              <span className="chat-imsg-stream-answer-body">{streamAnswerText}</span>
              {view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
            </div>
          ) : null}
          {hasStream ? (
            <div className="chat-imsg-stream-activity" aria-label="Sub-agent activity">
              {view.streamLines.map((row) => (
                <div key={row.id} className={`chat-imsg-stream-line ${row.state || ''}`}>
                  {row.text}
                </div>
              ))}
            </div>
          ) : null}
          {!hasStreamAnswer && view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
        </ChatImsgCollapsible>
      );
    }
    return (
      <span className="chat-imsg-thinking">
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
      </span>
    );
  };
  const showSub = hasSubTimeline || hasStreamAnswer || hasStream || hasFinal || view.isRunning;
  const subState = hasFinal ? 'final' : ((hasSubTimeline || hasStreamAnswer || hasStream) ? 'stream' : 'thinking');
  return (
    <div className="chat-imsg">
      {hasPrompt ? (
        <div className="chat-imsg-row from-main">
          <div className="chat-imsg-bubble main">
            {view.mediaPath ? (
              <div className="chat-imsg-attachment" title={view.mediaPath}>
                <span className="chat-imsg-attachment-icon ico ico-image-describe" aria-hidden="true" />
                <span className="chat-imsg-attachment-name">{fileName}</span>
                {view.visionMode ? (
                  <span className="chat-imsg-attachment-mode">{view.visionMode}</span>
                ) : null}
              </div>
            ) : null}
            {fields.length > 0 ? (
              <div className="chat-imsg-fields">
                {fields.map((field) => (
                  <div key={field.label} className={`chat-imsg-field ${field.multiline ? 'is-multiline' : ''}`}>
                    <div className="chat-imsg-field-label">{field.label}</div>
                    <div className={`chat-imsg-field-value ${field.markdown ? 'is-md' : ''}`}>
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
        <div className="chat-imsg-row from-sub">
          <div className={`chat-imsg-bubble sub ${subState} ${hasSubTimeline ? 'timeline' : ''}`}>
            {renderSubContent()}
          </div>
        </div>
      ) : null}

      {!hasPrompt && !showSub && view.requestJson ? (
        <ChatJsonBlock text={view.requestJson} compact />
      ) : null}
    </div>
  );
}

export function ChatTimelineToolNode({ item }) {
  const status = item.status || 'pending';
  const category = item.category || 'tool';
  const defaultIconClass = CATEGORY_ICON_CLASS[category] || CATEGORY_ICON_CLASS.tool;
  // 先按 toolName 匹配专属 icon；匹配不到再退回 skill/mcp/subagent 分类图标。
  const iconClass = resolveToolIconClass(item.toolName, defaultIconClass);
  const categoryLabel = CATEGORY_LABEL[category] || 'Tool';
  const view = buildToolView(item);
  const [open, setOpen] = React.useState(Boolean(view.defaultOpen));
  const fallbackLines = view.mode === 'read'
    ? []
    : [item.inputSummary, item.outputSummary].filter(Boolean).slice(0, 2);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const hasBody = Boolean(view.body)
    || Boolean(view.command)
    || Boolean(view.stdout)
    || Boolean(view.stderr)
    || Boolean(view.requestJson)
    || Boolean(view.responseJson)
    || (Array.isArray(view.streamLines) && view.streamLines.length > 0)
    || Boolean(view.finalText)
    || fallbackLines.length > 0
    || hasChildren;
  return (
    <div className={`chat-timeline-tool category-${category} status-${status} mode-${view.mode}`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => hasBody && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasBody}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className={`ico ${iconClass}`} aria-label={categoryLabel} role="img" />
        <span className="chat-timeline-tool-name">{view.label}</span>
        {hasBody ? (
          <ChatTimelineChevron open={open} />
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="chat-timeline-tool-body">
          {view.mode !== 'read' ? <ChatTimelineToolBody view={view} /> : null}
          {view.mode === 'read' && fallbackLines.map((line, index) => (
            <div key={index} className="chat-timeline-tool-line">{line}</div>
          ))}
          {hasChildren ? (
            <div className="chat-timeline-tool-children">
              {item.children.map((child) => (
                <ChatTimelineToolNode key={child.id} item={child} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Collapsed view of a run of consecutive tool calls. Looks like a regular
// tool chip (same .chat-timeline-tool-head border / pill) but the label is a
// verb-counted summary like "read 3 files · executed 2 commands · used
// chrome devtools 11 tools". Click expands to the original per-tool chips.
export function ChatTimelineToolGroup({ item }) {
  const [open, setOpen] = React.useState(false);
  const status = item.status || 'done';
  const tools = Array.isArray(item.tools) ? item.tools : [];
  const summary = item.summary || `used ${tools.length} tools`;
  return (
    <div className={`chat-timeline-tool category-tool status-${status} is-group`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className="ico ico-tool" aria-label="Tools" role="img" />
        <span className="chat-timeline-tool-name">{summary}</span>
        <span className="chat-timeline-tool-group-count">{tools.length}</span>
        <ChatTimelineChevron open={open} />
      </button>
      {open ? (
        <div className="chat-timeline-tool-group-body">
          {tools.map((tool) => (
            <ChatTimelineToolNode key={tool.id} item={tool} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatTimelineMetaNode({ item }) {
  const isContextCompaction = String(item.summary || '').toLowerCase() === 'auto-compacting context';
  return (
    <div className={`chat-timeline-meta status-${item.status || 'done'} ${isContextCompaction ? 'is-compaction' : ''}`}>
      <button
        type="button"
        className="chat-timeline-meta-head"
        aria-expanded="false"
        disabled
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        {isContextCompaction ? <span className="chat-timeline-compaction-icon" aria-hidden="true" /> : null}
        <span className="chat-timeline-meta-label">{item.summary || 'Thinking…'}</span>
      </button>
    </div>
  );
}

export function ChatTimelineThinkingNode({ item }) {
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
        {hasText ? (
          <span className="chat-timeline-thinking-count">{charCount} chars</span>
        ) : null}
        <ChatTimelineChevron open={open} />
      </button>
      {open && hasText ? (
        <div className="chat-timeline-thinking-body">{text}</div>
      ) : null}
    </div>
  );
}

export function ChatAgentTimeline({ items = [], streaming = false, latestTodos = null }) {
  const safeItems = Array.isArray(items) ? items : [];
  const todos = Array.isArray(latestTodos) && latestTodos.length > 0 ? latestTodos : null;
  // Empty timeline + done + no todos = nothing to show.
  // Empty timeline + streaming = activity indicator carries the "alive" hint.
  // Has todos = always show the panel even if there are no other items.
  if (!safeItems.length && !streaming && !todos) return null;
  return (
    <div className={`chat-timeline ${streaming ? 'streaming' : 'done'}`}>
      {safeItems.map((item) => {
        if (item.kind === 'text') {
          return (
            <div key={item.id} className={`chat-timeline-text ${item.streaming ? 'streaming' : ''}`}>
              <span className="chat-timeline-text-body">{item.text}</span>
              {item.streaming ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
            </div>
          );
        }
        if (item.kind === 'tool') {
          return <ChatTimelineToolNode key={item.id} item={item} />;
        }
        if (item.kind === 'tool_group') {
          return <ChatTimelineToolGroup key={item.id} item={item} />;
        }
        if (item.kind === 'thinking') {
          return <ChatTimelineThinkingNode key={item.id} item={item} />;
        }
        if (item.kind === 'meta') {
          return <ChatTimelineMetaNode key={item.id} item={item} />;
        }
        return null;
      })}
      {streaming ? (
        <div className="chat-timeline-activity" aria-label="Agent activity">
          <span className="chat-timeline-spark" aria-hidden="true">*</span>
          <span className="chat-timeline-verb" aria-hidden="true" />
        </div>
      ) : null}
      {todos ? <ChatTodoPanel todos={todos} streaming={streaming} /> : null}
    </div>
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

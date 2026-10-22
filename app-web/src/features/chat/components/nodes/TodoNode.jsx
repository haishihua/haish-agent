import React from 'react';

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

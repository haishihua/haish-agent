import React from 'react';
import { Search, X } from 'lucide-react';
import { projectWorkflowTasks } from '../model/workspace-state.js';

// 侧栏顶部那条查找：会话模式和任务模式共用同一个输入框、同一份结果面板、同一套
// 键盘操作，差别只有「匹配谁」和「选中后跳哪儿」。任务模式复用侧栏那只取任务的
// helper，所以搜出来的行就是任务列表里的同一批行（含标题缺失时的兜底文案）。
const taskIdOf = (task) => task?.taskId || task?.task_id || task?.id;

export function ThreadSearch({ projects, mode = 'conversations', onSelect, onSelectTask }) {
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const taskMode = mode === 'tasks';
  const needle = query.trim().toLowerCase();
  const results = taskMode
    ? projects
      .flatMap((project) => projectWorkflowTasks(project).map((entry) => ({ ...entry, project })))
      .filter((entry) => `${entry.task?.title || ''} ${entry.conversation?.name || ''} ${entry.project.name || ''}`
        .toLowerCase()
        .includes(needle))
    : projects.flatMap((project) => (project.conversations || [])
      .filter((conversation) => `${conversation.name || ''} ${project.name || ''}`.toLowerCase().includes(needle))
      .map((conversation) => ({ project, conversation })));
  const keyOf = (result) => (taskMode
    ? `${result.project.id}:${result.conversationId}:${taskIdOf(result.task)}`
    : `${result.project.id}:${result.conversation.id}`);
  const labelOf = (result) => (taskMode
    ? result.task?.title || 'Untitled task'
    : result.conversation.name || 'New conversation');
  const copy = taskMode
    ? { field: 'Search tasks', clear: 'Clear task search', empty: 'No matching tasks' }
    : { field: 'Search conversations', clear: 'Clear conversation search', empty: 'No matching conversations' };
  const choose = (result) => {
    if (!result) return;
    if (taskMode) onSelectTask?.(result.project.id, result.conversationId, result.task);
    else onSelect?.(result.project.id, result.conversation.id);
    setQuery('');
  };
  return <div className="haish-thread-search">
    <div className="haish-search-field">
      <Search size={15} aria-hidden="true" />
      <input aria-label={copy.field} placeholder={copy.field} value={query}
        onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') setQuery('');
          if (event.key === 'Enter') { event.preventDefault(); choose(results[index]); }
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && results.length) {
            event.preventDefault();
            setIndex((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
          }
        }} />
      {query && <button type="button" aria-label={copy.clear} onClick={() => setQuery('')}><X size={14} /></button>}
    </div>
    {needle && <div className="haish-thread-search-results">
      {!results.length && <p>{copy.empty}</p>}
      {results.map((result, i) => <React.Fragment key={keyOf(result)}>
        {results[i - 1]?.project.id !== result.project.id && <small>{result.project.name}</small>}
        <button type="button" className={i === index ? 'is-active' : ''} onClick={() => choose(result)}
          ref={(element) => { if (element && i === index) element.scrollIntoView({ block: 'nearest' }); }}>
          {labelOf(result)}
        </button>
      </React.Fragment>)}
    </div>}
  </div>;
}

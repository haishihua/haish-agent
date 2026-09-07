import React from 'react';
import { Search, X } from 'lucide-react';

export function ThreadSearch({ projects, onSelect }) {
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const needle = query.trim().toLowerCase();
  const results = projects.flatMap((project) => (project.conversations || [])
    .filter((conversation) => `${conversation.name || ''} ${project.name || ''}`.toLowerCase().includes(needle))
    .map((conversation) => ({ project, conversation })));
  const choose = (result) => {
    if (!result) return;
    onSelect(result.project.id, result.conversation.id);
    setQuery('');
  };
  return <div className="haish-thread-search">
    <div className="haish-search-field">
      <Search size={15} aria-hidden="true" />
      <input aria-label="Search conversations" placeholder="Search conversations" value={query}
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
      {query && <button type="button" aria-label="Clear conversation search" onClick={() => setQuery('')}><X size={14} /></button>}
    </div>
    {needle && <div className="haish-thread-search-results">
      {!results.length && <p>No matching conversations</p>}
      {results.map((result, i) => <React.Fragment key={`${result.project.id}:${result.conversation.id}`}>
        {results[i - 1]?.project.id !== result.project.id && <small>{result.project.name}</small>}
        <button type="button" className={i === index ? 'is-active' : ''} onClick={() => choose(result)}
          ref={(element) => { if (element && i === index) element.scrollIntoView({ block: 'nearest' }); }}>
          {result.conversation.name || 'New conversation'}
        </button>
      </React.Fragment>)}
    </div>}
  </div>;
}

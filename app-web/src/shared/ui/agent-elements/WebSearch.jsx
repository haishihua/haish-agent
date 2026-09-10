// Adapted from assistant-ui Elements web-search (MIT).
import React from 'react';
import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import '../../../../styles/tool-elements.css';

export function WebSearch({ kind = 'search', query, results = [], answer, content, truncated, running, failed, cancelled, error }) {
  const isFetch = kind === 'fetch';
  const [open, setOpen] = React.useState(false);
  const contentId = React.useId();
  const statusText = isFetch
    ? failed ? (error || 'Fetch failed') : cancelled ? 'Fetch cancelled' : running ? 'Fetching…' : content ? '' : 'No content returned'
    : failed ? (error || 'Search failed') : cancelled ? 'Search cancelled' : running ? 'Searching…' : results.length ? `Found ${results.length} ${results.length === 1 ? 'source' : 'sources'}` : 'No results';
  return <section className="aui-web-search" aria-label={isFetch ? 'Fetched page' : 'Web search results'}>
    {!isFetch && <div className="aui-search-query"><Search size={13} aria-hidden="true" /><span>{query || 'Web search'}</span></div>}
    {statusText && <div className={`aui-search-status ${running ? 'is-running' : ''}`} role="status">
      {statusText}
    </div>}
    {answer && <p className="aui-search-answer">{answer}</p>}
    <ul className="aui-search-results">{results.map((result, index) => {
      const source = <>
        <span className="aui-source-mark" aria-hidden="true">{(result.domain || result.title || '?').slice(0, 1).toUpperCase()}</span>
        <span className="aui-source-copy"><span className="aui-source-title">{result.title || result.domain || 'Untitled source'}</span>
          {result.domain && <span className="aui-source-domain">{result.domain}</span>}
          {result.snippet && <span className="aui-source-snippet">{result.snippet}</span>}
        </span>
        {result.url && <ArrowUpRight size={13} aria-hidden="true" />}
      </>;
      return <li className="aui-search-result" key={`${result.url || result.title}-${index}`}>
        {isFetch && content && <button type="button" className="aui-fetch-toggle" aria-expanded={open}
          aria-controls={open ? contentId : undefined} aria-label={open ? 'Hide page content' : 'Show page content'} onClick={() => setOpen(!open)}>
          <ChevronRight size={13} className={`aui-tool-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
        </button>}
        {result.url
          ? <a className="aui-search-source" href={result.url} target="_blank" rel="noopener noreferrer">{source}</a>
          : <div className="aui-search-source">{source}</div>}
      </li>;
    })}</ul>
    {content && open && <div id={contentId}>
      <div className="aui-search-content" aria-label="Page content" tabIndex={0}>{content}</div>
      {truncated && <p className="aui-search-status">Content truncated</p>}
    </div>}
  </section>;
}

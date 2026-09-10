// Adapted from assistant-ui's MIT-licensed quote.aui.tsx.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx
// Runtime bindings are replaced with props; numbering/comments extend the original.
import React from 'react';
import { Quote, Pencil, X } from 'lucide-react';
import './quote.css';

export function SelectionToolbar({ onComment }) {
  return <div className="haish-selection-toolbar" data-slot="selection-toolbar" role="toolbar" aria-label="Selected text">
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onComment}>
      <Quote size={14} aria-hidden="true" /> Add comment
    </button>
  </div>;
}

export function QuoteBlock({ item, index, onJump, onEdit, onRemove, preview = false }) {
  return <div className={`haish-quote-block${preview ? ' is-preview' : ''}`} data-slot={preview ? 'composer-quote-preview' : 'quote-block'}>
    <Quote className="haish-quote-icon" size={14} aria-hidden="true" />
    <div className="haish-quote-content">
      {onJump ? <button type="button" className="haish-quote-text" title="Jump to quoted text" onClick={() => onJump(item)}>
        {index != null && <span className="haish-quote-number">{index}</span>}{item.text}
      </button> : <p className="haish-quote-text">{item.text}</p>}
      {item.comment && <p className="haish-quote-comment">{item.comment}</p>}
    </div>
    {(onEdit || onRemove) && <div className="haish-quote-actions">
      {onEdit && <button type="button" onClick={() => onEdit(item)} title="Edit comment" aria-label={`Edit comment ${index}`}><Pencil size={14} /></button>}
      {onRemove && <button type="button" onClick={() => onRemove(item)} title="Remove comment" aria-label={`Remove comment ${index}`}><X size={14} /></button>}
    </div>}
  </div>;
}

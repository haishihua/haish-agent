// @haish-esm
import React from 'react';
import { Markdown } from '../Effects.jsx';
import { fmtAgo, AttachmentFileChip } from './Format.jsx';
import { PortalTooltip } from './PortalTooltip.jsx';
import {
  formatElapsedDuration,
  formatMessageClock,
  copyTextToClipboard,
} from './path-utils.jsx';
import {
  ChatAgentTimeline,
  ChatTimelineCollapsed,
  ChatTimelineElapsedPill,
} from './ChatTimelineNodes.jsx';

const { useState, useEffect, useRef } = React;

function FinalAnswerMarkdown({ source, streaming }) {
  const text = String(source || '');

  if (!text || streaming) return null;
  return (
    <div className="chat-bubble-text">
      {Markdown ? <Markdown source={text} /> : text}
    </div>
  );
}

export function ChatMessageRow({ message, now, onPreviewImage }) {
  const timeline = Array.isArray(message.traceTimeline) ? message.traceTimeline : [];
  const hasTimeline = timeline.length > 0;
  const isAgent = message.role === 'agent';
  // While streaming: keep the timeline expanded so users see the live thinking + tools.
  // When the task is done: collapse it behind a one-liner; clicking reveals the trace.
  const [traceExpanded, setTraceExpanded] = React.useState(false);
  // Streaming 时即使 timeline 还没积累任何事件，也要渲染 ChatAgentTimeline，
  // 让黄色 `* Reasoning…` 活动指示器出来——否则刚发出消息那几百毫秒 bubble
  // 是完全空白的，用户以为前端卡了。
  const showTimelineExpanded = isAgent && (message.streaming || (hasTimeline && traceExpanded));
  const showTimelineCollapsed = isAgent && !message.streaming && hasTimeline;
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const elapsed = isAgent
    ? formatElapsedDuration(message.createdAt, message.completedAt || (message.streaming ? nowMs : null))
    : '';
  const messageClock = formatMessageClock(isAgent ? (message.completedAt || message.createdAt) : message.createdAt);
  const timelineText = isAgent
    ? timeline.filter((item) => item.kind === 'text').map((item) => item.text || '').join('\n').trim()
    : '';
  const copyText = String(message.text || timelineText || '').trim();

  React.useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  async function handleCopy() {
    if (!copyText) return;
    const ok = await copyTextToClipboard(copyText);
    if (!ok) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }

  const messageImages = Array.isArray(message.images)
    ? message.images.filter((img) => img && (img.previewUrl || img.path))
    : [];

  return (
    <div className={`chat-message-row ${message.role}`}>
      {messageImages.length > 0 && (
        <div className="chat-message-images" aria-label="Attached images">
          {messageImages.map((img, idx) => (
            <div key={img.image_id || `${idx}`} className="chat-message-image">
              <button
                type="button"
                className="chat-message-image-button"
                onClick={() => onPreviewImage?.({
                  src: img.previewUrl || img.path,
                  title: img.name || img.path || 'Attached image',
                })}
                aria-label="Preview attached image"
              >
                {img.previewUrl ? (
                  <img src={img.previewUrl} alt="" draggable={false} />
                ) : (
                  <span className="chat-message-image-fallback" aria-hidden="true">▦</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`chat-bubble ${message.status || ''}`}>
        <div className="chat-bubble-meta">
          <span className="chat-bubble-meta-main">
            <span
              className={`chat-bubble-avatar ${isUser ? 'ico-user-avatar' : 'ico-assistant-avatar'}`}
              aria-hidden="true"
            />
            <span>{isUser ? 'You' : 'Assistant'}</span>
          </span>
        </div>
        {showTimelineCollapsed ? (
          <>
            <ChatTimelineCollapsed
              onExpand={() => setTraceExpanded((value) => !value)}
              label={elapsed || 'Trace'}
              expanded={traceExpanded}
            />
            {traceExpanded ? (
              <ChatAgentTimeline
                items={timeline}
                streaming={false}
                latestTodos={message.traceLatestTodos || null}
              />
            ) : null}
          </>
        ) : null}
        {message.streaming ? <ChatTimelineElapsedPill label={elapsed || '0s'} /> : null}
        {showTimelineExpanded && !showTimelineCollapsed ? (
          <ChatAgentTimeline
            items={timeline}
            streaming={message.streaming}
            latestTodos={message.traceLatestTodos || null}
          />
        ) : null}
        {isAgent ? (
          <FinalAnswerMarkdown source={message.text} streaming={message.streaming} />
        ) : message.text ? (
          <div className="chat-bubble-text"><span className="chat-stream-text">{message.text}</span></div>
        ) : null}
      </div>
      {(messageClock || copyText) ? (
        <div className="chat-message-actions">
          {messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
          {copyText ? (
            <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="above">
              <button
                type="button"
                className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                <span className="ico-copy-message" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImagePreviewOverlay({ image, onClose }) {
  const [scale, setScale] = React.useState(1);
  const src = image?.src || '';
  const title = image?.title || 'image';

  React.useEffect(() => {
    if (!image) return undefined;
    setScale(1);
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image || !src) return null;

  function adjustScale(delta) {
    setScale((value) => Math.max(0.25, Math.min(3, Number((value + delta).toFixed(2)))));
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.href = src;
    link.download = String(title).split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div
      className="image-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="image-preview-toolbar" aria-label="Image preview actions">
        <button type="button" className="image-preview-action" onClick={downloadImage} aria-label="Download image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
        <button type="button" className="image-preview-action image-preview-close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="image-preview-stage">
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
      <div className="image-preview-zoom" aria-label="Image zoom controls">
        <button type="button" onClick={() => adjustScale(-0.1)} aria-label="Zoom out">-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => adjustScale(0.1)} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}


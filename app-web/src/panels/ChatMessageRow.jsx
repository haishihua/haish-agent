// @haish-esm
import React from 'react';
import { Markdown } from '../Effects.jsx';
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

const IMAGE_COPY_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_COPY_MAX_PIXELS = 16 * 1024 * 1024;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Image encoding failed'));
    reader.readAsDataURL(blob);
  });
}

function FinalAnswerMarkdown({ source, streaming }) {
  const text = String(source || '');

  if (!text || streaming) return null;
  return (
    <div className="chat-bubble-text">
      {Markdown ? <Markdown source={text} /> : text}
    </div>
  );
}

function ChatMessageRowComponent({ message, now, onPreviewImage, onRetry }) {
  const timeline = Array.isArray(message.traceTimeline) ? message.traceTimeline : [];
  const hasTimeline = timeline.length > 0;
  const isAgent = message.role === 'agent';
  const [traceExpanded, setTraceExpanded] = React.useState(false);
  React.useEffect(() => setTraceExpanded(false), [message.conversationId, message.id]);
  const hasTraceDisclosure = isAgent && (hasTimeline || message.streaming);
  // The live trace is the task's progress view, so keep it visible by default.
  // Individual tool cards inside ChatAgentTimeline manage their own collapsed state.
  const traceForcedOpen = message.streaming || message.traceOpen;
  const showTimelineExpanded = hasTraceDisclosure && (traceForcedOpen || traceExpanded);
  const showTimelineCollapsed = hasTraceDisclosure && !traceForcedOpen && !traceExpanded;
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  // 计时从"模型返回首字"那一刻起算：firstTokenAt 存在（SSE 已建连且模型开始输出）
  // 才显示 elapsed pill；任务结束后仍按发送时间算总时长。
  const firstTokenMs = Number(message.firstTokenAt) || 0;
  const elapsed = isAgent
    ? formatElapsedDuration(
        message.completedAt ? message.createdAt : (firstTokenMs || message.createdAt),
        message.completedAt || (message.streaming ? nowMs : null),
      )
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
        {!isUser ? (
          <div className="chat-bubble-meta">
            <span className="chat-bubble-meta-main">
              <span className="chat-bubble-avatar ico-assistant-avatar" aria-hidden="true" />
              <span>Assistant</span>
            </span>
          </div>
        ) : null}
        {showTimelineCollapsed ? (
          <>
            <ChatTimelineCollapsed
              onExpand={() => setTraceExpanded((value) => !value)}
              label={elapsed || '0s'}
              expanded={traceExpanded}
            />
            {traceExpanded ? (
              <ChatAgentTimeline
                items={timeline}
                streaming={false}
                latestTodos={message.traceLatestTodos || null}
                conversationId={message.conversationId || ''}
                taskId={message.taskId || ''}
              />
            ) : null}
          </>
        ) : null}
        {/* 首字未到（排队/建连/模型首字等待期）不显示计时器 */}
        {traceForcedOpen && firstTokenMs ? <ChatTimelineElapsedPill label={elapsed || '0s'} /> : null}
        {showTimelineExpanded && !showTimelineCollapsed ? (
          <ChatAgentTimeline
            items={timeline}
            streaming={message.streaming}
            latestTodos={message.traceLatestTodos || null}
            conversationId={message.conversationId || ''}
            taskId={message.taskId || ''}
          />
        ) : null}
        {isAgent ? (
          <FinalAnswerMarkdown source={message.text} streaming={message.streaming} />
        ) : message.text ? (
          <div className="chat-bubble-text">
            {(isUser || message.markdown) && Markdown
              ? <Markdown source={String(message.text)} />
              : <span className="chat-stream-text">{message.text}</span>}
          </div>
        ) : null}
      </div>
      {(messageClock || copyText || onRetry) ? (
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
          {onRetry ? (
            <PortalTooltip text="ReRun" position="above">
              <button
                type="button"
                className="chat-bubble-copy"
                onClick={onRetry}
                aria-label="ReRun this node"
              >
                <svg className="chat-bubble-rerun-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const ChatMessageRow = React.memo(
  ChatMessageRowComponent,
  (previous, next) => (
    previous.message === next.message
    && previous.onPreviewImage === next.onPreviewImage
    && previous.onRetry === next.onRetry
    && (!next.message?.streaming || previous.now === next.now)
  ),
);

export function ImagePreviewOverlay({ image, onClose }) {
  const [scale, setScale] = React.useState(1);
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const imageElementRef = React.useRef(null);
  const src = image?.src || '';
  const title = image?.title || 'image';

  React.useEffect(() => {
    if (!image) return undefined;
    setScale(1);
    setCopied(false);
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  React.useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  if (!image || !src) return null;

  function adjustScale(delta) {
    setScale((value) => Math.max(0.25, Math.min(3, Number((value + delta).toFixed(2)))));
  }

  async function copyImage() {
    try {
      const imageElement = imageElementRef.current;
      await imageElement?.decode?.().catch(() => undefined);
      const width = Number(imageElement?.naturalWidth) || 0;
      const height = Number(imageElement?.naturalHeight) || 0;
      if (!width || !height || width * height > IMAGE_COPY_MAX_PIXELS) {
        throw new Error('Image dimensions are too large to copy safely');
      }
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
      const blob = await response.blob();
      if (blob.size > IMAGE_COPY_MAX_BYTES) throw new Error('Image file is too large to copy safely');
      const dataUrl = await blobToDataUrl(blob);
      const ok = await window.haish?.copyImage?.(dataUrl);
      if (!ok) return;
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('image copy failed', error);
    }
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
        <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="below">
          <button type="button" className={`image-preview-action ${copied ? 'copied' : ''}`} onClick={copyImage} aria-label={copied ? 'Image copied' : 'Copy image'}>
            {copied ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 4 4 10-10" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
            )}
          </button>
        </PortalTooltip>
        <PortalTooltip text="Download" position="below">
          <button type="button" className="image-preview-action" onClick={downloadImage} aria-label="Download image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
          </button>
        </PortalTooltip>
        <PortalTooltip text="Close" position="below">
          <button type="button" className="image-preview-action image-preview-close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
            </svg>
          </button>
        </PortalTooltip>
      </div>
      <div className="image-preview-stage">
        <img
          ref={imageElementRef}
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

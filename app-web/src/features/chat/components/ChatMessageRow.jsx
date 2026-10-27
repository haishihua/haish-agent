import React from 'react';
import { UserRound, Split, Pencil, LoaderCircle } from 'lucide-react';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { EditMessage } from '../../../shared/ui/agent-elements/EditMessage.jsx';
import { QuoteBlock } from '../../../shared/ui/agent-elements/Quote.jsx';
import { Markdown } from '../../../shared/ui/Markdown.jsx';
import { stripInjectedSkillInstruction } from '../model/chat-text.js';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AttachmentFileChip } from '../../../shared/ui/AttachmentFileChip.jsx';
import { localPathReference, splitPathReferenceDraft } from '../model/path-references.js';
import { normalizeLocalImagePath } from '../../../shared/lib/local-image-path.js';
import {
  formatElapsedDuration,
  formatMessageClock,
} from '../../../shared/lib/message-format.js';
import { copyTextToClipboard } from '../../../shared/lib/clipboard.js';
import { chatImagePreviewUrl } from '../../../shared/api/chat-image.js';
import {
  ChatAgentTimeline,
  ChatTimelineCollapsed,
  ChatTimelineElapsedPill,
} from './ChatTimelineNodes.jsx';
import { ChatImageThumb } from './ChatImageThumb.jsx';
import { ImagePreviewOverlay } from '../../../shared/ui/ImagePreviewOverlay.jsx';

// 预览浮层已抽到 shared/ui，聊天附件、Markdown 插图、生图卡共用一份实现。
export { ImagePreviewOverlay };

function FinalAnswerMarkdown({ source, streaming, sourceMessageId, imagePathResolver, onPreviewImage, pathImages = true }) {
  const text = String(source || '');

  if (!text || streaming) return null;
  return (
    <div className="chat-bubble-text" data-annotation-source={sourceMessageId}>
      {Markdown ? <Markdown source={text} imagePathResolver={imagePathResolver} onPreviewImage={onPreviewImage} pathImages={pathImages} /> : text}
    </div>
  );
}

function ChatMessageRowComponent({ message, annotationNumbers, onPreviewImage, onRetry, onFork, onEdit, onAnnotationJump, actionsDisabled = false, forceTraceOpen = false, retryPending = false }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  React.useEffect(() => setActionError(''), [message.id, message.text, message.status]);
  const actionLock = React.useRef(false);
  async function perform(action) {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionBusy(true);
    setActionError('');
    try {
      const accepted = await action();
      if (accepted === false) { setActionError('Your changes were not sent. Please try again.'); return; }
      setEditing(false);
    }
    catch (error) { setActionError(String(error?.message || error)); }
    finally { actionLock.current = false; setActionBusy(false); }
  }
  const timeline = Array.isArray(message.traceTimeline) ? message.traceTimeline : [];
  const hasTimeline = timeline.length > 0;
  const isAgent = message.role === 'agent';
  const [traceExpansionOverride, setTraceExpanded] = React.useState(null);
  React.useEffect(() => setTraceExpanded(null), [message.conversationId, message.id]);
  React.useEffect(() => {
    // A caller can pin a trace open (fixture/screenshot pages do). Keep it open
    // after that flag clears so the reader does not lose what they landed on; the
    // normal collapse control comes back. Production opens traces through
    // `message.traceOpen` / a live stream — search does not force steps open,
    // because step/tool text is not part of conversation search.
    if (forceTraceOpen) setTraceExpanded(true);
  }, [forceTraceOpen, message.conversationId, message.id]);
  const traceExpanded = traceExpansionOverride ?? message.status === 'cancelled';
  const hasTraceDisclosure = isAgent && (hasTimeline || message.streaming);
  // The live trace is the task's progress view, so keep it visible by default.
  // Individual tool cards inside ChatAgentTimeline manage their own collapsed state.
  const traceForcedOpen = message.streaming || message.traceOpen || forceTraceOpen;
  const showTimelineExpanded = hasTraceDisclosure && (traceForcedOpen || traceExpanded);
  const showTimelineToggle = hasTraceDisclosure && !traceForcedOpen;
  // Older turns load their execution record only once they are scrolled into
  // view; the row keeps `data-trace-pending` so ChatPanel can page the missing
  // slices in, and the wait is no longer announced with a line of copy.
  const tracePending = isAgent && message.traceHydrated === false && !message.streaming;
  const isUser = message.role === 'user';
  // 名字来自每轮任务的实际 Agent，而非会话当前默认选择。
  // AppShell 从任务/会话记录里解析；拿不到历史 agent 记录的旧任务才退回 Assistant。
  const agentName = String(message.agentName || '').trim();
  const answerText = message.text;
  const visibleText = isUser ? stripInjectedSkillInstruction(message.text) : answerText;
  const userContent = React.useMemo(() => isUser ? splitPathReferenceDraft(visibleText) : null, [isUser, visibleText]);
  const bodyText = userContent ? userContent.text : visibleText;
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!message.streaming) return undefined;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [message.streaming]);
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
  const copyText = String(visibleText || timelineText || '').trim();

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
  // 最终回答的图片来自任务自己的结构化绑定，不从正文路径推断图片内容；
  // 正文只负责给出结构化路径的插入位置。旧任务没有这个字段时保持原行为。
  const answerImages = React.useMemo(() => {
    if (!isAgent || !Array.isArray(message.answerImages)) return [];
    return message.answerImages
      .filter((img) => img && (img.previewUrl || img.path))
      .map((img) => ({
        ...img,
        previewUrl: img.previewUrl || chatImagePreviewUrl(img, message.conversationId),
      }));
  }, [isAgent, message.answerImages, message.conversationId]);
  // 结构化回答图片的路径是唯一可信的路径：最终回答正文里出现它时，Markdown
  // 插件会把它就地替换成图片，不再额外追加到答案尾部。正文里其他图片路径
  // （例如模型抄错的历史路径）不解析，保留原路径文本。
  // 模型经常把长目录缩写成 `.../images/x.png` 再写进正文，而后端预览接口本来就
  // 支持“丢前缀按尾部后缀在本会话根内找回”。所以这里不能只做精确相等：
  // 结构化路径或它去掉前缀后的尾部后缀唯一命中时就放行，并且改用结构化路径
  // 本身去请求预览（缩写路径直接请求会拼出错误候选）。0.0.32 的全放行会串图，
  // 这里的门禁本身没错，错在只有精确相等一种匹配。
  const answerImagePathBySuffix = React.useMemo(() => {
    const map = new Map();
    const add = (suffix, path) => {
      map.set(suffix, map.has(suffix) && map.get(suffix) !== path ? '' : path);
    };
    for (const img of answerImages) {
      const normalized = normalizeLocalImagePath(img.path);
      if (!normalized) continue;
      const segments = normalized.split('/').filter(Boolean);
      // 从整条路径到“目录/文件名”两层，尾部越深越转异性越高；只剩纯文件名时
      // 不同代同名图会冲突，不再作为匹配依据。
      for (let depth = segments.length; depth >= 2; depth -= 1) {
        add(segments.slice(segments.length - depth).join('/'), normalized);
      }
    }
    return map;
  }, [answerImages]);
  const resolveAnswerImagePath = React.useCallback((raw) => {
    const normalized = normalizeLocalImagePath(raw);
    if (!normalized) return null;
    if (answerImagePathBySuffix.get(normalized)) return answerImagePathBySuffix.get(normalized);
    const segments = normalized.split('/').filter(Boolean);
    for (let depth = segments.length; depth >= 2; depth -= 1) {
      const candidate = answerImagePathBySuffix.get(segments.slice(segments.length - depth).join('/'));
      if (candidate) return candidate;
    }
    return null;
  }, [answerImagePathBySuffix]);

  // Model answers report artifacts as local paths. The preview endpoint re-checks
  // each path against this conversation's roots, so the resolver only has to build
  // the URL. 作用域始终取这一行自己的 conversationId；拿不到时不发请求，回退原文。
  const resolveImagePath = React.useMemo(() => {
    const conversationId = String(message.conversationId || '');
    return (path) => {
      if (!conversationId) return null;
      if (answerImages.length > 0) {
        // 正文路径要么指向本轮结构化绑定的同一张图，要么不解析（保留原路径文本）。
        // 命中时用结构化路径本身去拼预览，缩写尾部不再单独发请求。
        const bound = resolveAnswerImagePath(path);
        if (!bound) return null;
        return chatImagePreviewUrl({ path: bound }, conversationId) || null;
      }
      return chatImagePreviewUrl({ path }, conversationId) || null;
    };
  }, [message.conversationId, answerImages.length, resolveAnswerImagePath]);

  const imageAttachments = messageImages.length > 0 ? (
        <div className="chat-message-images" aria-label="Attached images">
          {messageImages.map((img, idx) => (
            <div key={img.image_id || `${idx}`} className="chat-message-image">
              <ChatImageThumb image={img} onPreview={onPreviewImage} />
            </div>
          ))}
        </div>
      ) : null;

  return (
    <div data-message-id={message.id} data-trace-pending={tracePending ? '' : undefined} className={`chat-message-row ${message.role}${message.streaming ? ' is-streaming' : ''}`}>
        <div
          className={`chat-bubble message-shell ${isAgent ? 'agent-response' : ''} ${message.status || ''}`}>
          {!isUser ? (
            <div className="chat-bubble-meta">
              <span className="chat-bubble-meta-main">
                <span className="chat-speaker-avatar" aria-hidden="true"><span className="ico-assistant-avatar" /></span>
                <span>{agentName || 'Assistant'}</span>
              </span>
          {showTimelineToggle ? (
            <ChatTimelineCollapsed
              onExpand={() => setTraceExpanded(!traceExpanded)}
              label={elapsed}
              expanded={traceExpanded}
            />
          ) : null}
          {/* 首字未到（排队/建连/模型首字等待期）不显示计时器 */}
          {traceForcedOpen && firstTokenMs ? <ChatTimelineElapsedPill label={elapsed} /> : null}
            </div>
          ) : <div className="chat-bubble-meta user-speaker-meta">
            {userContent.references.length > 0 && <div className="chat-message-files" aria-label="Referenced files and folders">
              {userContent.references.map((text, index) => <AttachmentFileChip key={`${index}:${text}`}
                attachment={localPathReference(text)} pathReference />)}
            </div>}
            {imageAttachments}
            <span className="chat-bubble-meta-main">
              <span>You</span>
              <span className="chat-speaker-avatar" aria-hidden="true"><UserRound size={18} strokeWidth={1.75} /></span>
            </span>
          </div>}
          <div className={`message-speech-body${editing ? ' is-editing' : ''}`} hidden={isUser && !bodyText && !message.annotations?.length && !editing}>
          {isUser && message.annotations?.length > 0 && <div className="haish-sent-annotations" aria-label="Quoted comments">
            {message.annotations.map((item, index) => <QuoteBlock key={item.id} item={item} index={annotationNumbers?.get(item.id) ?? index + 1} onJump={onAnnotationJump} />)}
          </div>}
          {!isUser ? imageAttachments : null}
          {showTimelineExpanded ? (
            <ChatAgentTimeline
              items={timeline}
              streaming={message.streaming}
              latestTodos={message.traceLatestTodos || null}
              conversationId={message.conversationId || ''}
              taskId={message.taskId || ''}
              onPreviewImage={onPreviewImage}
            />
          ) : null}
          {editing ? (
            <EditMessage value={draft} onValueChange={setDraft} busy={actionBusy} disabled={actionsDisabled}
              onCancel={() => { setEditing(false); setActionError(''); }} onSave={() => perform(() => onEdit(draft, message))} />
          ) : isAgent && message.status === 'failed' ? (
            <ErrorState title="Task failed" detail={[message.text, actionError].filter(Boolean).join('\n')} retrying={actionBusy || retryPending}
              disabled={actionsDisabled} onRetry={onRetry ? () => perform(() => onRetry(message)) : undefined} />
          ) : isAgent ? (
            <FinalAnswerMarkdown source={answerText} streaming={message.streaming} sourceMessageId={message.status === 'done' ? message.messageId : undefined} imagePathResolver={resolveImagePath} onPreviewImage={onPreviewImage} />
          ) : bodyText ? (
            <div className="chat-bubble-text">
              {(isUser || message.markdown) && Markdown
                ? <Markdown source={String(bodyText)} hardBreaks={isUser} />
                : <span className="chat-stream-text">{bodyText}</span>}
            </div>
          ) : null}
          </div>
          {actionError && !(isAgent && message.status === 'failed') ? <ErrorState variant="inline" detail={actionError} /> : null}
        </div>
      {(messageClock || copyText || onRetry || onFork || onEdit) && !editing ? (
        <div className="chat-message-actions">
          {isUser && messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
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
          {onFork ? <PortalTooltip text="Branch into new chat" position="above"><button type="button" className="chat-bubble-copy message-turn-action" aria-label="Branch into new chat" disabled={actionBusy} onClick={() => perform(() => onFork(message))}>{actionBusy ? <LoaderCircle size={14} /> : <Split size={16} strokeWidth={1.75} style={{ transform: 'rotate(90deg)' }} />}</button></PortalTooltip> : null}
          {onEdit ? <PortalTooltip text="Edit message" position="above"><button type="button" className="chat-bubble-copy message-turn-action" aria-label="Edit message" disabled={actionsDisabled || actionBusy} onClick={() => {
            // The editor is a fixed width (edit-message.css, same width as the
            // composer), so there is no bubble width to measure here.
            setActionError('');
            setDraft(visibleText);
            setEditing(true);
          }}><Pencil size={15} /></button></PortalTooltip> : null}
          {onRetry && message.status !== 'failed' ? (
            <PortalTooltip text="ReRun" position="above">
              <button
                type="button"
                className="chat-bubble-copy"
                onClick={onRetry}
                aria-label="ReRun this node"
              >
                <AppIcon name="retry" size={15} />
              </button>
            </PortalTooltip>
          ) : null}
          {!isUser && messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export const ChatMessageRow = React.memo(
  ChatMessageRowComponent,
  (previous, next) => (
    previous.message === next.message
    && previous.annotationNumbers === next.annotationNumbers
    && previous.onPreviewImage === next.onPreviewImage
    && previous.onRetry === next.onRetry
    && previous.onFork === next.onFork
    && previous.onEdit === next.onEdit
    && previous.onAnnotationJump === next.onAnnotationJump
    && previous.actionsDisabled === next.actionsDisabled
    && previous.retryPending === next.retryPending
    && previous.forceTraceOpen === next.forceTraceOpen
  ),
);

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow, ImagePreviewOverlay } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { taskDetailToRuntimeTask } from '../../src/features/tasks/model/task-runtime.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const images = ['gen-old.png', 'gen-new.png', 'gen-third.png'].map((name, index) => ({
  image_id: `image-${index}`,
  path: `/runtime/state/workspaces/w/conversations/c1/images/${name}`,
}));
const task = taskDetailToRuntimeTask({ task_id: 't1', conversation_id: 'c1', status: 'done', answer_images: images });
const base = { role: 'agent', conversationId: 'c1', status: 'done', streaming: false, traceTimeline: [] };
const changedFiles = { count: 1, nodes: [{ kind: 'file', path: 'file.txt', name: 'file.txt' }] };

function App() {
  const [preview, setPreview] = React.useState(null);
  return <AppTooltipProvider><div className="chat-panel" style={{ width: 600, padding: 24 }}>
    <ChatMessageRow message={{ ...base, id: 'complete', text: '图片已生成。', answerImages: task.answerImages, changedFiles }} onPreviewImage={setPreview} />
    <ChatMessageRow message={{ ...base, id: 'path', text: `路径：\`${images[0].path}\``, answerImages: [task.answerImages[1]] }} onPreviewImage={setPreview} />
    <ChatMessageRow message={{ ...base, id: 'empty', text: '没有生成图片。' }} />
    <ChatMessageRow message={{ ...base, id: 'streaming', status: 'running', streaming: true, text: '', answerImages: task.answerImages }} />
    <ChatMessageRow message={{ ...base, id: 'failed', status: 'failed', text: 'failed', answerImages: task.answerImages }} />
    {preview ? <ImagePreviewOverlay image={preview} onClose={() => setPreview(null)} /> : null}
  </div></AppTooltipProvider>;
}
flushSync(() => createRoot(document.getElementById('root')).render(<App />));
window.answerGalleryChecks = () => {
  const check = (value, label) => { if (!value) throw new Error(label); };
  const complete = document.querySelector('[data-message-id="complete"]');
  const answer = complete.querySelector('.chat-bubble-text');
  const gallery = complete.querySelector('.chat-answer-images');
  const tree = complete.querySelector('[data-slot="file-tree"]');
  check(answer && gallery && tree, 'answer, gallery and file tree are required');
  check(answer.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING, 'gallery must follow answer');
  check(gallery.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING, 'gallery must precede tree');
  const pictures = [...gallery.querySelectorAll('img')];
  check(pictures.length === 3, 'all task images must appear');
  check(pictures.every((img, i) => decodeURIComponent(img.src).includes(images[i].path)), 'generation order or path incorrect');
  check(pictures.every((img) => img.complete && img.naturalWidth === 320), 'images must load');
  const boxes = [...gallery.children].map((el) => el.getBoundingClientRect());
  check(boxes.every((box) => box.top === boxes[0].top), 'images must be on one row');
  check(getComputedStyle(gallery).flexWrap === 'nowrap' && gallery.scrollWidth > gallery.clientWidth, 'overflow must scroll horizontally');
  const pathRow = document.querySelector('[data-message-id="path"]');
  check(pathRow.querySelector('.chat-bubble-text').textContent.includes(images[0].path), 'answer path must remain text');
  check(!pathRow.querySelector('.chat-bubble-text img'), 'answer path must not become an image');
  check(decodeURIComponent(pathRow.querySelector('.chat-answer-images img').src).includes(images[1].path), 'gallery must use structured image only');
  for (const id of ['empty', 'streaming', 'failed']) {
    check(!document.querySelector(`[data-message-id="${id}"] .chat-answer-images`), `${id} must not show a gallery`);
  }
  return 'PASS';
};

// 会话详情滚动条 → 右缘轮次导轨（Conversation map）：真实 ChatPanel + base.css + chat.css。
//
// 产品决策：原生滚动条隐藏，右缘那条轮次导轨就是滚动条——点刻度/预览卡跳到该轮、按住
// 导轨拖动连续滚动，滚轮/触控板/键盘滚动照旧。这里锁的是它成立的前提：
//   1. 原生滚动条彻底隐藏（computed scrollbar-width: none，占位塌成 0），不再有第二条竖条；
//   2. 导轨贴着列表右缘、24px 命中区内默认刻度 12×2px，一列用户轮次一格；
//   3. 右内边距 = 这块保留带，正文右缘（含右对齐的用户气泡）仍与输入框外框右缘对齐；
//   4. 点刻度/预览卡跳转；卡片锚定悬停刻度，正文/评论优先，纯图用小缩略图与张数；
//   5. 会话短到不用滚动时对齐不变（切会话不跳）。
// 反向断言（revert）：把旧的 `gutter − 保留带` 内边距公式注回去后，正文右缘会偏离输入框
// ——说明对齐那几条确实在被测，不是常量。

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (predicate, timeout = 4000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error('Timed out waiting for fixture layout');
    await sleep(40);
  }
};

// 长会话：撑出滚动条的那一类（窗口只渲染最近若干行，所以这里只要够长就行）。
const TURNS = 26;
const longMessages = Array.from({ length: TURNS }, (_, index) => ([
  { id: `long-user-${index}`, taskId: `long-task-${index}`, role: 'user', status: 'done', text: `第 ${index} 问：正文要够长，把会话详情撑出滚动条。` },
  { id: `long-answer-${index}`, taskId: `long-task-${index}`, messageId: `long-saved-${index}`, role: 'agent', status: 'done', text: `第 ${index} 答：${'这一段说明用来占高度。'.repeat(6)}` },
])).flat();
const denseMessages = Array.from({ length: 160 }, (_, index) => ([
  { id: `dense-user-${index}`, role: 'user', status: 'done', text: `长会话第 ${index} 问：局部放大精确定位。` },
  { id: `dense-answer-${index}`, role: 'agent', status: 'done', text: `第 ${index} 答：${'保留正文按需渲染，导航使用全量轻量索引。'.repeat(3)}` },
])).flat();
const crowdedMessages = Array.from({ length: 400 }, (_, index) => ([
  { id: `crowded-user-${index}`, role: 'user', status: 'done', text: `400 轮压力场景：第 ${index} 问。` },
  { id: `crowded-answer-${index}`, role: 'agent', status: 'done', text: `第 ${index} 答：极密总览合并可视线条，精确定位仍覆盖所有用户轮次。` },
])).flat();
const readingMessages = Array.from({ length: 5 }, (_, index) => ([
  { id: `reading-user-${index}`, role: 'user', status: 'done', text: `阅读长回复第 ${index + 1} 轮` },
  { id: `reading-answer-${index}`, role: 'agent', status: 'done', text: Array.from({ length: 30 }, (_, paragraph) => `第 ${paragraph + 1} 段：这是一条跨多屏的回复，用来验证用户消息已经离开视口时的轮次高亮。`).join('\n\n') },
])).flat();

const shortMessages = [
  { id: 'short-user-0', taskId: 'short-task-0', role: 'user', status: 'done', text: '短会话问一句。' },
  { id: 'short-answer-0', taskId: 'short-task-0', messageId: 'short-saved-0', role: 'agent', status: 'done', text: '短会话答一句。' },
];

const imageSource = (background, accent) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="${background}"/><circle cx="120" cy="24" r="12" fill="${accent}"/><path d="M0 90 52 25 98 78 127 51 160 90" fill="${accent}"/></svg>`,
)}`;
const previewImages = [
  { image_id: 'preview-blue', previewUrl: imageSource('#183044', '#81c6da') },
  { image_id: 'preview-gold', previewUrl: imageSource('#46301b', '#e7ba64') },
  { image_id: 'preview-green', previewUrl: imageSource('#19382e', '#86c6a1') },
];
const quote = (id, comment = '', text = 'skill-creator 资源已被暂存删除，但技能草稿生成代码仍要依赖它。') => ({
  id, comment, text, source_message_id: 'preview-saved-source', start: 0, end: text.length, prefix: '', suffix: '',
});
const previewMessages = [
  { id: 'preview-source', role: 'agent', status: 'done', messageId: 'preview-saved-source', text: 'skill-creator 资源已被暂存删除，但技能草稿生成代码仍要依赖它。' },
  { id: 'preview-comment', role: 'user', status: 'done', messageId: 'preview-saved-comment', text: '', annotations: [quote('comment-1', '这个是啥啊')] },
  { id: 'preview-comments', role: 'user', status: 'done', messageId: 'preview-saved-comments', text: '', annotations: [quote('comment-2', '先说明原因'), quote('comment-3', '再给修复建议')] },
  { id: 'preview-quote', role: 'user', status: 'done', messageId: 'preview-saved-quote', text: '', annotations: [quote('comment-4', '', '只有引用，没有评论时显示这段摘要。')] },
  { id: 'preview-body', role: 'user', status: 'done', text: '优先展示我补充的问题', annotations: [quote('comment-5', '不是这条评论')], images: [previewImages[0]] },
  { id: 'preview-single', role: 'user', status: 'done', text: '', images: [previewImages[0]] },
  { id: 'preview-multi', role: 'user', status: 'done', text: '', images: previewImages },
  { id: 'preview-unavailable', role: 'user', status: 'done', text: '', images: [{ image_id: 'missing-image', previewUrl: 'data:image/png;base64,AAAA' }] },
  { id: 'preview-caption', role: 'user', status: 'done', text: '这张图里有什么？', images: [previewImages[1]] },
  { id: 'preview-image-comment', role: 'user', status: 'done', text: '', annotations: [quote('comment-6', '图片也有评论时优先看这句')], images: [previewImages[2]] },
].flatMap((message, index) => [message, {
  id: `preview-answer-${index}`, role: 'agent', status: 'done', text: `预览场景 ${index + 1}：${'这里保留回复以验证点击卡片仍然定位到原消息。'.repeat(3)}`,
}]);

const PROVIDER_OPTIONS = [{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }];
const originalFetch = window.fetch;
window.fetch = (input, init) => (String(input).includes('/api/')
  ? Promise.reject(new Error('Offline fixture: unexpected API call'))
  : originalFetch(input, init));

const root = createRoot(document.getElementById('root'));
const render = (conversationId, messages) => flushSync(() => root.render(
  <AppTooltipProvider>
    <ChatPanel conversationId={conversationId} messages={messages} providerOptions={PROVIDER_OPTIONS} />
  </AppTooltipProvider>,
));

const listNode = () => document.querySelector('.chat-message-list');
const editorNode = () => document.querySelector('.chat-composer-editor');
const round = (value) => Math.round(value * 10) / 10;

// 滚动条占位宽度：经典滚动条下 offsetWidth 比 clientWidth 多出的那一条。
const scrollbarStrip = (element) => element.offsetWidth - element.clientWidth;

// 正文能画到的最右处：列表盒子右缘扣掉右边框和右内边距（原生滚动条已隐藏，不再占位）。
const contentRight = (element) => {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return round(box.right
    - parseFloat(style.borderRightWidth || '0')
    - parseFloat(style.paddingRight || '0'));
};

const railNode = () => document.querySelector('.conversation-map');
const railTicks = () => [...document.querySelectorAll('.conversation-map-tick')];
const cardNode = () => document.querySelector('.conversation-map-card');
const localTick = (id) => document.querySelector(`.conversation-map-lens-tick[data-id="${id}"]`);
const previewAnchor = (id) => localTick(id) || document.querySelector(`.conversation-map-tick[data-id="${id}"]`);
const turnCount = () => Number(railNode()?.dataset.turnCount || 0);
const hoverOverview = async (id) => {
  // Leave any previously frozen local lens before pointing at the overview.
  const rail = document.querySelector('.conversation-map-rail');
  rail?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  const index = /^(?:dense|crowded)-user-(\d+)$/.exec(id)?.[1];
  const tick = index === undefined ? document.querySelector(`.conversation-map-tick[data-id="${id}"]`)
    : railTicks().find((node) => Number(node.dataset.startIndex) <= Number(index) && Number(node.dataset.endIndex) >= Number(index));
  const box = tick.getBoundingClientRect();
  const clientY = index === undefined ? box.top + box.height / 2
    : box.top + (Number(index) - Number(tick.dataset.startIndex) + 0.5) * box.height / (Number(tick.dataset.endIndex) - Number(tick.dataset.startIndex) + 1);
  tick.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body, clientY }));
  await sleep(120);
  return cardNode();
};
// 面板只渲染窗口内的最近若干行，且旧会话的行组留在 DOM 里（display:none）——
// 所以「本轮渲染出来的用户行」要按可见性过滤，不能数 DOM 节点。
const visibleUserRows = () => [...document.querySelectorAll('.chat-message-row.user')]
  .filter((row) => row.getClientRects().length);
const settleScroll = async (element, timeout = 2500) => {
  const start = performance.now();
  let last = element.scrollTop;
  let still = 0;
  while (performance.now() - start < timeout) {
    await sleep(80);
    if (Math.abs(element.scrollTop - last) < 0.5) {
      still += 1;
      if (still >= 3) return;
    } else {
      still = 0;
      last = element.scrollTop;
    }
  }
};

// 与组件同样的点击路径：pointerdown 记住命中的刻度，pointerup 原地松手 = 跳转。
const tapTick = (tick) => {
  const rail = document.querySelector('.conversation-map-rail');
  if (!tick || !rail) return false;
  const box = tick.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: box.right - 6, clientY: box.top + box.height / 2 };
  tick.dispatchEvent(new PointerEvent('pointerdown', opts));
  rail.dispatchEvent(new PointerEvent('pointerup', opts));
  return true;
};

// 对照物：输入框那条外框的右缘（.chat-composer 的 border box）。
// --chat-gutter 的约定就是「正文右缘 = 输入框外框右缘」——两边同源，改一边要改另一边。
const composerFrameRight = () => round(document.querySelector('.chat-composer').getBoundingClientRect().right);

const barSnapshot = () => {
  const list = listNode();
  const style = getComputedStyle(list);
  const strip = scrollbarStrip(list);
  const viewport = list.clientHeight;
  const content = list.scrollHeight;
  const rail = railNode();
  return {
    strip,
    scrollbarWidth: style.scrollbarWidth,
    gutter: style.scrollbarGutter,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    railWidth: rail ? round(rail.getBoundingClientRect().width) : 0,
    railRight: rail ? round(rail.getBoundingClientRect().right) : 0,
    listRight: round(list.getBoundingClientRect().right),
    ticks: railTicks().length,
    viewport,
    content,
    // 浏览器按这个比例算滑块长度：内容越长滑块越短（我们只定宽度，长度是自适应的）。
    thumb: round((viewport * viewport) / content),
    overflow: content - viewport,
    bodyRight: contentRight(list),
    composerRight: composerFrameRight(),
    hit: document.elementFromPoint(
      list.getBoundingClientRect().right - strip / 2,
      list.getBoundingClientRect().top + 40,
    ),
  };
};

async function runChecks() {
  results.length = 0;
  render('fixture-long', longMessages);
  await document.fonts.ready;
  await waitUntil(() => railTicks().length === TURNS);
  await settleScroll(listNode());

  const long = barSnapshot();
  check(
    'the conversation body and the composer rendered',
    Boolean(listNode()) && Boolean(editorNode()),
    `list=${Boolean(listNode())} editor=${Boolean(editorNode())}`,
  );
  check(
    'the long conversation overflows, so there is something to scroll',
    long.overflow > 300,
    `content=${long.content} viewport=${long.viewport} overflow=${long.overflow}`,
  );

  // 1. 原生滚动条隐藏：占位 0、computed scrollbar-width 就是 none
  check(
    'the native scrollbar is gone (no second vertical bar, no reserved strip)',
    long.strip === 0 && long.scrollbarWidth === 'none',
    `strip=${long.strip} scrollbar-width=${long.scrollbarWidth}`,
  );

  // 2. 导轨顶替它：贴列表右缘、宽度就是保留带、一格一个用户轮次
  const renderedRows = visibleUserRows().length;
  check(
    'the conversation map indexes every user turn before older rows are mounted',
    Math.abs(long.railRight - long.listRight) <= 1
      && long.railWidth === 24
      && long.ticks === TURNS
      && long.ticks > renderedRows,
    `railRight=${long.railRight} listRight=${long.listRight} width=${long.railWidth} ticks=${long.ticks} renderedRows=${renderedRows}`,
  );

  // 3. 点刻度 = 跳到该轮并居中（导轨就是滚动条的定位职责）
  const list = listNode();
  const rowOf = (id) => document.querySelector(`.chat-message-row.user[data-message-id="${id}"]`);
  // 刻度节点会随补页重排：每次从实时 DOM 取，别缓存节点（缓存过就点错过目标）。
  const tickIdAt = (index) => railTicks()[index]?.dataset.id || '';
  // 直接点，不先强设 scrollTop：程序化改位置会被面板的「跟随最新」拉回，也不是用户手势。
  const clickTarget = Math.max(0, Math.min(6, railTicks().length - 1));
  const clickTargetId = tickIdAt(clickTarget);
  const caret = railTicks()[clickTarget];
  if (caret) tapTick(caret);
  await waitUntil(() => {
    const target = rowOf(clickTargetId)?.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    return target && Math.abs(target.top + target.height / 2 - viewport.top - viewport.height / 2) <= 24;
  });
  await settleScroll(list);
  const viewportBox = list.getBoundingClientRect();
  const targetRow = rowOf(clickTargetId)?.getBoundingClientRect();
  check(
    'clicking a tick jumps to that turn and centres it in the viewport',
    Boolean(targetRow)
      && Math.abs((targetRow.top + targetRow.height / 2) - (viewportBox.top + viewportBox.height / 2)) <= 24,
    `rowCenter=${targetRow ? round(targetRow.top + targetRow.height / 2) : 'n/a'} viewportCenter=${round(viewportBox.top + viewportBox.height / 2)} scrollTop=${round(list.scrollTop)}`,
  );

  check(
    'jumping to a centred message highlights that same turn',
    document.querySelector('.conversation-map-tick.is-active')?.dataset.id === clickTargetId,
    `expected=${clickTargetId} active=${document.querySelector('.conversation-map-tick.is-active')?.dataset.id}`,
  );

  // 4. 卡片锚定刻度（不是导轨中线），标题可点击，无复制按钮/额外标题头。
  const hoverIndex = Math.min(3, railTicks().length - 1);
  const hoverTargetId = tickIdAt(hoverIndex);
  await hoverOverview(hoverTargetId);
  const card = cardNode();
  const anchorBox = previewAnchor(hoverTargetId).getBoundingClientRect();
  check('overflowing content with well-spaced turns shows only a title preview, not a local lens',
    Boolean(card) && !document.querySelector('.conversation-map-lens, .conversation-map-range'));
  const cardBox = card?.getBoundingClientRect();
  check(
    'the preview is anchored to its tick and contains only the message title',
    Boolean(cardBox) && Math.abs((cardBox.top + cardBox.height / 2) - (anchorBox.top + anchorBox.height / 2)) <= 2
      && card.textContent === rowOf(hoverTargetId)?.querySelector('.chat-bubble-text')?.textContent
      && !card.querySelector('button, svg, .conversation-map-card-head, .ico-copy-message'),
    cardBox ? `cardCenter=${round(cardBox.top + cardBox.height / 2)} tickCenter=${round(anchorBox.top + anchorBox.height / 2)}` : 'no card',
  );
  const otherIndex = Math.min(hoverIndex + 5, railTicks().length - 1);
  await hoverOverview(tickIdAt(otherIndex));
  const movedCard = cardNode()?.getBoundingClientRect();
  const otherAnchor = previewAnchor(tickIdAt(otherIndex)).getBoundingClientRect();
  check(
    'switching ticks moves the card with its anchor instead of pinning it to the rail centre',
    Boolean(movedCard) && Math.abs((movedCard.top + movedCard.height / 2) - (otherAnchor.top + otherAnchor.height / 2)) <= 2
      && Math.abs(movedCard.top - cardBox.top) > 10,
    movedCard ? `cardTop=${round(cardBox.top)}→${round(movedCard.top)}` : 'no card',
  );
  await hoverOverview(hoverTargetId);
  if (cardBox) {
    cardNode()?.click();
    await settleScroll(list);
    const row = rowOf(hoverTargetId)?.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    check(
      'clicking the preview card jumps to that turn too',
      Boolean(row) && Math.abs((row.top + row.height / 2) - (box.top + box.height / 2)) <= 24,
      row ? `rowCenter=${round(row.top + row.height / 2)} viewportCenter=${round(box.top + box.height / 2)}` : 'no row',
    );
  }
  railTicks()[hoverIndex]?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

  // 4. 正文右缘与输入框外框右缘对齐（右内边距扣掉了滚动条占位）
  check(
    'the message body still lines up with the composer frame on the right',
    Math.abs(long.bodyRight - long.composerRight) <= 1.5,
    `body=${long.bodyRight} composer=${long.composerRight} paddingRight=${long.paddingRight}`,
  );
  check(
    'the right padding is the rail strip itself (the left padding stays on the shared gutter)',
    parseFloat(long.paddingRight) === long.railWidth && parseFloat(long.paddingLeft) === 10,
    `padding=${long.paddingLeft}/${long.paddingRight} railWidth=${long.railWidth}`,
  );

  // The same turns can become dense when the message viewport shrinks. Do not
  // leave an open local lens behind after the viewport has enough space again.
  const workspace = document.querySelector('.chat-workspace');
  workspace.style.height = '300px';
  await waitUntil(() => listNode().clientHeight < 200);
  await sleep(100);
  await hoverOverview(hoverTargetId);
  check('shrinking the pane enables local magnification only once the same turns become dense',
    Boolean(document.querySelector('.conversation-map-lens'))
      && document.querySelectorAll('.conversation-map-lens-tick').length === 7);
  workspace.style.height = '';
  await waitUntil(() => listNode().clientHeight === long.viewport && !document.querySelector('.conversation-map-lens'));
  await hoverOverview(hoverTargetId);
  check('growing the pane returns to direct title previews without stale local controls',
    Boolean(cardNode()) && !document.querySelector('.conversation-map-lens, .conversation-map-range')
      && Math.abs(cardNode().getBoundingClientRect().top + cardNode().getBoundingClientRect().height / 2
        - previewAnchor(hoverTargetId).getBoundingClientRect().top - previewAnchor(hoverTargetId).getBoundingClientRect().height / 2) <= 2);

  // 短会话：占位与对齐不变（不滚动也不跳）
  render('fixture-short', shortMessages);
  await sleep(200);
  const short = barSnapshot();
  check(
    'a conversation that does not overflow hides the rail but keeps the same alignment',
    short.overflow <= 2
      && short.railWidth === 0
      && Math.abs(short.bodyRight - long.bodyRight) <= 1.5
      && Math.abs(short.bodyRight - short.composerRight) <= 1.5,
    `overflow=${short.overflow} railWidth=${short.railWidth} bodyRight=${short.bodyRight} longBodyRight=${long.bodyRight}`,
  );

  // Regression: only assistant text is in view, so the current turn must NOT revert to tick 0.
  render('fixture-reading', readingMessages);
  await waitUntil(() => document.querySelector('.conversation-map-tick[data-id="reading-user-2"]'));
  await sleep(120);
  const readingList = listNode();
  readingList.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true }));
  const user = rowOf('reading-user-2');
  readingList.scrollTop += user.getBoundingClientRect().bottom - readingList.getBoundingClientRect().top + 350;
  await sleep(250);
  const active = document.querySelector('.conversation-map-tick.is-active');
  const readingViewport = readingList.getBoundingClientRect();
  check(
    'a long assistant reply keeps its own turn active, not a hardcoded first tick',
    user.getBoundingClientRect().bottom < readingViewport.top
      && rowOf('reading-user-3').getBoundingClientRect().top > readingViewport.bottom
      && active?.dataset.id === 'reading-user-2',
    `active=${active?.dataset.id} userBottom=${round(user.getBoundingClientRect().bottom)} viewportTop=${round(readingViewport.top)}`,
  );
  const activeStyle = getComputedStyle(active, '::before');
  const inactive = document.querySelector('.conversation-map-tick:not(.is-active)');
  const inactiveStyle = getComputedStyle(inactive, '::before');
  check(
    'the idle rail uses the reference 12×2px ticks with a 12×3px current tick',
    inactiveStyle.width === '12px' && inactiveStyle.height === '2px'
      && activeStyle.width === '12px' && activeStyle.height === '3px',
    `idle=${inactiveStyle.width}×${inactiveStyle.height} current=${activeStyle.width}×${activeStyle.height}`,
  );

  await hoverOverview('reading-user-2');
  check('a handful of multi-screen replies never opens the seven-turn detail box',
    Boolean(cardNode()) && !document.querySelector('.conversation-map-lens, .conversation-map-range'));
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  await sleep(80);

  // Use actual ChatMessageRow / QuoteBlock / ChatImageThumb, not look-alike markup.
  render('fixture-previews', previewMessages);
  await waitUntil(() => document.querySelector('.conversation-map-tick[data-id="preview-comment"]'));
  await sleep(120);
  const showPreview = hoverOverview;
  for (const [id, title] of [
    ['preview-comment', '这个是啥啊'],
    ['preview-comments', '先说明原因 · 再给修复建议'],
    ['preview-quote', '只有引用，没有评论时显示这段摘要。'],
    ['preview-body', '优先展示我补充的问题'],
    ['preview-caption', '这张图里有什么？'],
    ['preview-image-comment', '图片也有评论时优先看这句'],
  ]) {
    const preview = await showPreview(id);
    check(
      `intent title: ${id}`,
      preview?.textContent === title && !preview.querySelector('.conversation-map-thumbnails, .haish-quote-number, button'),
      `expected=${title} actual=${preview?.textContent}`,
    );
  }
  for (const [id, title, count] of [
    ['preview-single', 'Image', 1], ['preview-multi', '3 images', 2], ['preview-unavailable', 'Image', 1],
  ]) {
    const preview = await showPreview(id);
    const thumbnails = [...(preview?.querySelectorAll('.conversation-map-thumbnail') || [])];
    const tickBox = previewAnchor(id).getBoundingClientRect();
    const box = preview?.getBoundingClientRect();
    check(
      `compact image preview: ${id}`,
      preview?.textContent === title && thumbnails.length === count
        && thumbnails.every((node) => node.clientWidth === 32 && node.clientHeight === 32)
        && Math.abs(box.top + box.height / 2 - tickBox.top - tickBox.height / 2) <= 2
        && !preview.querySelector('button'),
      `title=${preview?.textContent} thumbnails=${thumbnails.length} height=${box?.height}`,
    );
    if (id === 'preview-unavailable') {
      check('unavailable images retain their placeholder and count', Boolean(preview?.querySelector('.conversation-map-thumbnail svg')) && !preview?.querySelector('img'));
    }
  }
  const singleCard = await showPreview('preview-single');
  const thumb = singleCard.querySelector('img');
  await sleep(80);
  check('the single-image thumbnail really loads with cover cropping', thumb.complete && thumb.naturalWidth > 0 && getComputedStyle(thumb).objectFit === 'cover');
  thumb.dispatchEvent(new Event('error'));
  await sleep(80);
  check('a preview thumbnail failure falls back without hiding its title', Boolean(cardNode()?.querySelector('.conversation-map-thumbnail svg')) && cardNode()?.textContent === 'Image');
  const sourceImage = rowOf('preview-single').querySelector('.chat-message-images img');
  sourceImage.src = previewImages[1].previewUrl;
  await sleep(200);
  check('changing an image source refreshes an open preview even if its title/count did not change', cardNode()?.querySelector('img')?.getAttribute('src') === previewImages[1].previewUrl);
  sourceImage.src = previewImages[0].previewUrl;
  const imageCard = await showPreview('preview-multi');
  imageCard.querySelector('img').click();
  await settleScroll(listNode());
  const imageRow = rowOf('preview-multi').getBoundingClientRect();
  const imageViewport = listNode().getBoundingClientRect();
  check(
    'clicking a thumbnail navigates to the message instead of opening an image overlay',
    Math.abs(imageRow.top + imageRow.height / 2 - imageViewport.top - imageViewport.height / 2) <= 24
      && document.querySelector('.conversation-map-tick.is-active')?.dataset.id === 'preview-multi'
      && !document.querySelector('.image-preview-backdrop'),
  );
  document.querySelector('.conversation-map-tick[data-id="preview-multi"]')
    ?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  await sleep(200);

  // Full lightweight index, transient 7-row lens, and navigation into unmounted history.
  render('fixture-dense', denseMessages);
  await waitUntil(() => turnCount() === 160);
  await settleScroll(listNode());
  check('160 turns are indexed without mounting all 160 Markdown rows', visibleUserRows().length < 160 && turnCount() === 160);
  const overviewMarks = railTicks().length;
  check('dense overview merges visual marks rather than thickening all ticks', overviewMarks <= 82, `marks=${overviewMarks}`);
  await hoverOverview('dense-user-80');
  const lensNode = () => document.querySelector('.conversation-map-lens');
  const lensBounds = lensNode().getBoundingClientRect();
  check('hover expands exactly seven nearby turns with no visible instruction',
    document.querySelectorAll('.conversation-map-lens-tick').length === 7
      && lensNode().textContent === ''
      && cardNode()?.dataset.messageId === 'dense-user-80');
  localTick('dense-user-81').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  await sleep(80);
  const switchedBounds = lensNode().getBoundingClientRect();
  const selectedBounds = localTick('dense-user-81').getBoundingClientRect();
  const switchedCard = cardNode().getBoundingClientRect();
  check('entering local turns freezes the lens but anchors the card to the selected row',
    lensBounds.top === switchedBounds.top && lensBounds.left === switchedBounds.left
      && Math.abs(switchedCard.top + switchedCard.height / 2 - selectedBounds.top - selectedBounds.height / 2) <= 2);
  const bodyScroll = listNode().scrollTop;
  lensNode().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
  await sleep(100);
  check('local wheel browses one turn without scrolling the message body or moving the lens',
    cardNode()?.dataset.messageId === 'dense-user-82' && listNode().scrollTop === bodyScroll
      && lensNode().getBoundingClientRect().top === lensBounds.top);
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  await sleep(80);
  check('Escape dismisses a mouse-opened lens without requiring keyboard focus', !lensNode() && !cardNode());
  await hoverOverview('dense-user-2');
  const wasUnmounted = !rowOf('dense-user-2');
  cardNode().click();
  await waitUntil(() => rowOf('dense-user-2')?.getClientRects().length);
  await sleep(1000);
  await settleScroll(listNode());
  const historicalRow = rowOf('dense-user-2').getBoundingClientRect();
  const historicalView = listNode().getBoundingClientRect();
  check('clicking early history reveals the missing window and settles on the target, not the latest message',
    wasUnmounted && Math.abs(historicalRow.top + historicalRow.height / 2 - historicalView.top - historicalView.height / 2) <= 2
      && document.querySelector('.conversation-map-tick.is-active')?.dataset.id === 'dense-user-2');
  for (const [id, delta] of [['dense-user-0', -100], ['dense-user-159', 100]]) {
    await hoverOverview(id);
    const beforeId = cardNode()?.dataset.messageId;
    lensNode().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: delta }));
    await sleep(100);
    const box = lensNode().getBoundingClientRect();
    const viewport = listNode().getBoundingClientRect();
    check(`lens clamps range and position at ${id}`, cardNode()?.dataset.messageId === beforeId
      && box.top >= viewport.top && box.bottom <= viewport.bottom);
  }
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(80);
  check('clicking outside dismisses the lens and preview together', !lensNode() && !cardNode());

  render('fixture-crowded', crowdedMessages);
  await waitUntil(() => turnCount() === 400);
  await settleScroll(listNode());
  check('400-turn overview is complete while the initial body remains windowed',
    turnCount() === 400 && railTicks().length < 400 && visibleUserRows().length < 400);
  await hoverOverview('crowded-user-200');
  check('an extremely dense overview still exposes seven individually selectable turns',
    document.querySelectorAll('.conversation-map-lens-tick').length === 7
      && Boolean(localTick('crowded-user-200')) && cardNode()?.dataset.messageId === 'crowded-user-200');

  localTick('crowded-user-200').click();
  await waitUntil(() => rowOf('crowded-user-200')?.getClientRects().length);
  await sleep(1500);
  const crowdedRow = rowOf('crowded-user-200').getBoundingClientRect();
  const crowdedViewport = listNode().getBoundingClientRect();
  check('a cold 400-turn local selection reveals and centres the exact historical turn',
    Math.abs(crowdedRow.top + crowdedRow.height / 2 - crowdedViewport.top - crowdedViewport.height / 2) <= 2
      && document.querySelector('.conversation-map-tick.is-active')?.dataset.id === 'crowded-user-200');

  check('no page error was raised while scrolling the conversation', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

// revert：把旧的 `gutter − 保留带` 内边距公式注回去——正文右缘应该偏离输入框外框，
// 反向证明对齐那条断言确实在被测。（隐藏滚动条后该公式会算成 0，正文压到导轨底下。）
async function revertChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .chat-message-region > .chat-message-list {
      padding: 24px calc(var(--chat-gutter, 10px) - var(--chat-scrollbar-width, 24px)) 24px var(--chat-gutter, 10px) !important;
    }
  `;
  document.head.appendChild(style);
  render('fixture-long', longMessages);
  await sleep(200);
  const list = listNode();
  const reverted = barSnapshot();
  const bodyRight = contentRight(list);
  style.remove();
  return [
    {
      name: 'revert: the old "gutter minus strip" padding collapses to 0 under the rail',
      pass: parseFloat(reverted.paddingRight) === 0,
      detail: `paddingRight=${reverted.paddingRight}`,
    },
    {
      name: 'revert: with that padding the body no longer lines up with the composer frame',
      pass: Math.abs(bodyRight - reverted.composerRight) > 1,
      detail: `body=${bodyRight} composer=${reverted.composerRight}`,
    },
  ];
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` [${entry.detail}]` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

window.__chatScrollbarChecks = async () => report(await runChecks());
window.__chatScrollbarRevertChecks = async () => report(await revertChecks());
// 手动看/量的时候用：把长会话或短会话摆出来（长会话才有滑块可拖）。
window.__chatScrollbarShow = (which = 'long') => {
  if (which === 'short') render('fixture-short', shortMessages);
  else if (which === 'reading') render('fixture-reading', readingMessages);
  else if (which === 'previews') render('fixture-previews', previewMessages);
  else if (which === 'dense') render('fixture-dense', denseMessages);
  else if (which === 'crowded') render('fixture-crowded', crowdedMessages);
  else render('fixture-long', longMessages);
};
window.__chatScrollbarAutoRun = () => {
  runChecks().then(report).catch((error) => {
    report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
  });
};

window.__chatScrollbarAutoRun();

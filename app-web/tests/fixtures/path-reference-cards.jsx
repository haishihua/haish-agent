import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';
import '../../styles/markdown.css';

// 用户消息气泡里的路径卡片（生产 ChatMessageRow）。
//
// 截图里那条回归：`那就把修复分支合并到release/20260917` 没有空格、带一个斜杠，
// 旧判定把整行当成相对路径 → 气泡正文被抠空，只剩一张写着 `20260917 / FOLDER` 的
// 卡片（完整的话只能从悬浮提示里看到）。现在这类形状（分支名、版本号、中文短语、
// 夹在中文句子里的斜杠 token）必须原样留在正文里；真路径仍然出卡片：
// 绝对路径 = FOLDER，段名清晰且末段有后缀的相对路径 = 文件类型。
//
// `window.__pathCardChecks()` 返回逐项断言；页面加载后自动跑一次。

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push('rejection: ' + String(event.reason)));

const PROJECT_PATH = '/Users/zhanruitao/py-project/haish-agent-core';
const API_PATH = `${PROJECT_PATH}/src/app/api.py`;

const CASES = [
  { id: 'reported', text: '那就把修复分支合并到release/20260917' },
  { id: 'branch', text: 'release/20260917' },
  { id: 'project', text: PROJECT_PATH },
  { id: 'relative-file', text: 'src/main/main.ts' },
  { id: 'path-plus-prose', text: `${API_PATH} 帮我看看这个文件` },
];

const message = (entry, index) => ({
  id: `${entry.id}-row`, messageId: `saved-${index}`, role: 'user', status: 'done',
  text: entry.text, conversationId: 'fixture', taskId: `task-${index}`, createdAt: Date.now(),
});

flushSync(() => createRoot(document.getElementById('root')).render(
  <AppTooltipProvider>
    <main className="app-shell" style={{ padding: 24, width: 'min(860px, 96vw)' }}>
      {CASES.map((entry, index) => (
        <div className="chat-message-list" id={entry.id} key={entry.id}>
          <ChatMessageRow message={message(entry, index)} annotationNumbers={new Map()} />
        </div>
      ))}
    </main>
  </AppTooltipProvider>,
));

const row = (id) => document.querySelector(`#${id} .chat-message-row`);
const chips = (id) => [...row(id).querySelectorAll('.chat-message-files .composer-file-chip')].map((chip) => ({
  name: chip.querySelector('.composer-file-name')?.textContent || '',
  kind: chip.querySelector('.composer-file-kind')?.textContent || '',
  path: chip.getAttribute('aria-label') || '',
}));
const bodyText = (id) => {
  const body = row(id).querySelector('.chat-bubble-text');
  if (!body) return '';
  // innerText 要排版：后台标签页里 Chromium 直接给空串（文档 hidden 时不排版），
  // 那就退回 textContent —— 本用例的正文没有软换行，两者等价。
  const text = body.innerText || (document.visibilityState === 'hidden' ? body.textContent : '');
  return String(text || '').trim();
};
const bodyHidden = (id) => Boolean(row(id).querySelector('.message-speech-body')?.hidden);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });

const frame = () => new Promise((resolve) => setTimeout(resolve, 16));
// Streamdown 在 effect 里解析正文：模块求值那一刻 innerText 还是空的。先等正文落地
// （最多 5s，后台标签页的定时器会被拖到 ~1s 一次），再多等一拍让 innerText 有排版。
// 用 setTimeout 而不是 rAF：后台标签页 rAF 不跑，页面会永远停在 Running checks…。
const bodiesPainted = () => ['reported', 'branch', 'path-plus-prose']
  .every((id) => bodyText(id).length > 0);

async function settle() {
  const deadline = performance.now() + 5000;
  while (!bodiesPainted() && performance.now() < deadline) await frame();
  await frame();
}

async function runChecks() {
  results.length = 0;
  await settle();
  for (const id of ['reported', 'branch']) {
    const expected = CASES.find((entry) => entry.id === id).text;
    check(`${id}: no path card is invented`, chips(id).length === 0, JSON.stringify(chips(id)));
    check(`${id}: the sentence stays in the bubble`, bodyText(id) === expected, JSON.stringify(bodyText(id)));
    check(`${id}: the bubble body is not collapsed`, bodyHidden(id) === false, `hidden=${bodyHidden(id)}`);
  }

  check(
    'an absolute folder path still becomes a FOLDER card',
    JSON.stringify(chips('project')) === JSON.stringify([{ name: 'haish-agent-core', kind: 'FOLDER', path: PROJECT_PATH }]),
    JSON.stringify(chips('project')),
  );
  check('a path-only message keeps just the card', bodyHidden('project') === true, `hidden=${bodyHidden('project')}`);

  check(
    'a relative file path still becomes a file card',
    JSON.stringify(chips('relative-file')) === JSON.stringify([{ name: 'main.ts', kind: 'TS', path: 'src/main/main.ts' }]),
    JSON.stringify(chips('relative-file')),
  );

  check(
    'a real path next to prose keeps the prose',
    bodyText('path-plus-prose') === '帮我看看这个文件'
      && JSON.stringify(chips('path-plus-prose')) === JSON.stringify([{ name: 'api.py', kind: 'PY', path: API_PATH }]),
    `${JSON.stringify(bodyText('path-plus-prose'))} ${JSON.stringify(chips('path-plus-prose'))}`,
  );

  check('no page error was raised', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail && !entry.pass ? ` (${entry.detail})` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

let checksPromise = null;
function start() {
  if (!checksPromise) checksPromise = runChecks();
  return checksPromise;
}

window.__pathCardChecks = async () => report(await start());
start()
  .then(report)
  .catch((error) => report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]));

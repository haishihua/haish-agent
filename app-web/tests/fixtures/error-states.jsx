import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorState } from '../../src/shared/ui/agent-elements/ErrorState.jsx';
import { ErrorBoundary } from '../../src/shared/ui/ErrorBoundary.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

// 失败提示统一到 ErrorState 之后的样子：
//  chat 失败轮 = block（16px 圆角红卡 + 胶囊 Retry）
//  设置 / 对话框 = inline（12px 圆角、更紧，没有重试入口时不该出现按钮）
//  崩溃屏 = 同一张卡的全屏版 + 折叠的原始堆栈（陈旧分片的按钮是 Reload app）
// 逐项断言由 window.__errorStateChecks() 返回。

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

function Boom({ error }) {
  throw error;
}

function App() {
  return (
    <div className="fixture-stack">
      <section id="chat-block">
        <p className="fixture-label">① 聊天里一轮失败（block）</p>
        <ErrorState
          title="Task failed"
          detail="stream error: the upstream model returned 502 after 3 retries"
          retrying={false}
          onRetry={() => {}}
        />
      </section>
      <section id="inline-plain">
        <p className="fixture-label">② 设置 / 对话框（inline，无重试入口）</p>
        <ErrorState variant="inline" detail="Connection failed: 401 Unauthorized" />
      </section>
      <section id="inline-retry">
        <p className="fixture-label">③ inline + 真重试入口</p>
        <ErrorState variant="inline" detail="Saving failed: the runtime is offline" onRetry={() => {}} />
      </section>
      <section id="inline-fill">
        <p className="fixture-label">④ 审批卡 / 设置面板：inline 卡铺满容器</p>
        <div className="fixture-container">
          <ErrorState variant="inline" detail="Approval decision failed: the runtime is offline" />
        </div>
      </section>
      <section id="chat-action">
        <p className="fixture-label">⑤ 聊天气泡里的操作失败：贴着正文、留 8px</p>
        <div className="chat-bubble message-shell">
          <div className="message-speech-body">Could you re-run that?</div>
          <ErrorState variant="inline" detail="Could not copy the message" />
        </div>
      </section>
      <section id="retrying">
        <p className="fixture-label">⑥ 重试中</p>
        <ErrorState title="Task failed" detail="ignored while retrying" retrying onRetry={() => {}} />
      </section>
      <section id="screen-stale" className="fixture-frame">
        <p className="fixture-label">⑦ 崩溃屏：陈旧分片</p>
        <ErrorBoundary title="HAISH UI ERROR">
          <Boom error={new TypeError('Failed to fetch dynamically imported module: haish://app/assets/js/SettingsPage-B3kFDkHg.js')} />
        </ErrorBoundary>
      </section>
      <section id="screen-plain" className="fixture-frame">
        <p className="fixture-label">⑧ 崩溃屏：普通渲染崩溃</p>
        <ErrorBoundary title="HAISH UI ERROR">
          <Boom error={new Error('render exploded')} />
        </ErrorBoundary>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

function runChecks() {
  const block = document.querySelector('#chat-block .aui-error-state');
  check('block 卡用 role=alert', block?.getAttribute('role') === 'alert');
  check('block 卡同时有标题和详情',
    block?.querySelector('.aui-error-title')?.textContent === 'Task failed'
    && /502/.test(block?.querySelector('.aui-error-detail')?.textContent || ''));
  const blockStyle = block ? getComputedStyle(block) : null;
  check('block 卡是 16px 圆角的红卡',
    blockStyle?.borderRadius === '16px' && blockStyle?.backgroundColor === 'rgba(239, 68, 68, 0.1)',
    `${blockStyle?.borderRadius} / ${blockStyle?.backgroundColor}`);
  const retry = block?.querySelector('button');
  check('Retry 是胶囊按钮',
    Boolean(retry) && getComputedStyle(retry).borderRadius === '9999px' && retry.textContent.includes('Retry'),
    retry ? `${getComputedStyle(retry).borderRadius} / ${retry.textContent}` : 'no button');

  const inlinePlain = document.querySelector('#inline-plain .aui-error-state');
  check('inline 变体带 is-inline', Boolean(inlinePlain?.classList.contains('is-inline')));
  check('inline 没有重试入口时不渲染按钮', inlinePlain?.querySelector('button') === null);
  const inlineStyle = inlinePlain ? getComputedStyle(inlinePlain) : null;
  check('inline 比聊天卡更紧凑',
    inlineStyle?.padding === '8px 12px' && inlineStyle?.borderRadius === '12px',
    `${inlineStyle?.padding} / ${inlineStyle?.borderRadius}`);
  check('inline 的失败文案还在', /401/.test(inlinePlain?.querySelector('.aui-error-detail')?.textContent || ''));

  const inlineRetry = document.querySelector('#inline-retry .aui-error-state button');
  check('inline + handler 时 Retry 按钮回来', inlineRetry?.textContent.includes('Retry'));

  // 审批卡与设置面板都是把 inline 卡放进一个有宽度的容器：它是块级 flex，必须铺满内容区，
  // 否则「Retry 胶囊贴着左边、卡片缩成一颗药丸」那种走样就会回来。
  const fillCard = document.querySelector('#inline-fill .aui-error-state');
  const fillBox = document.querySelector('#inline-fill .fixture-container');
  const fillBoxStyle = getComputedStyle(fillBox);
  const fillContentWidth = fillBox.clientWidth
    - parseFloat(fillBoxStyle.paddingLeft) - parseFloat(fillBoxStyle.paddingRight);
  check('inline 卡铺满容器的内容区',
    Math.abs(fillCard.getBoundingClientRect().width - fillContentWidth) <= 1,
    `${fillCard.getBoundingClientRect().width} vs ${fillContentWidth}`);

  // 聊天气泡里的操作失败：正文之后留 8px（旧版错误文字的那点间距）。
  const chatBody = document.querySelector('#chat-action .message-speech-body');
  const chatCard = document.querySelector('#chat-action .aui-error-state');
  check('气泡里的失败卡与正文留出 8px',
    Math.round(chatCard.getBoundingClientRect().top - chatBody.getBoundingClientRect().bottom) === 8,
    `${chatCard.getBoundingClientRect().top - chatBody.getBoundingClientRect().bottom}`);

  const retrying = document.querySelector('#retrying .aui-error-state');
  check('重试中是 status 而不是 alert',
    retrying?.getAttribute('role') === 'status' && /Retrying/.test(retrying?.textContent || ''),
    `${retrying?.getAttribute('role')} / ${retrying?.textContent}`);

  const staleScreen = document.querySelector('#screen-stale .aui-error-screen');
  check('崩溃屏复用同一张卡', Boolean(staleScreen?.querySelector('.aui-error-state[role="alert"]')));
  check('崩溃屏标题仍是 HAISH UI ERROR', staleScreen?.querySelector('.aui-error-title')?.textContent === 'HAISH UI ERROR');
  check('崩溃屏把原始堆栈收进 Technical details',
    document.querySelector('#screen-stale summary')?.textContent === 'Technical details'
    && Boolean(document.querySelector('#screen-stale pre')));
  check('陈旧分片给出 Reload app',
    document.querySelector('#screen-stale button')?.textContent.trim() === 'Reload app',
    document.querySelector('#screen-stale button')?.textContent);
  check('普通崩溃给出 Try again',
    document.querySelector('#screen-plain button')?.textContent.trim() === 'Try again',
    document.querySelector('#screen-plain button')?.textContent);
  check('崩溃屏的卡不再是内联样式搭的方框',
    getComputedStyle(document.querySelector('#screen-stale .aui-error-state')).maxWidth === 'none',
    getComputedStyle(document.querySelector('#screen-stale .aui-error-state')).maxWidth);
  return results;
}

let checksPromise = null;
function start() {
  if (!checksPromise) {
    // React's root render commits on a macrotask, so a microtask would read an empty
    // page; poll for the first card instead of guessing a delay.
    checksPromise = new Promise((resolve, reject) => {
      let tries = 0;
      const poll = () => {
        if (document.querySelector('#chat-block .aui-error-state')) {
          try { resolve(runChecks()); } catch (error) { reject(error); }
          return;
        }
        if (++tries > 120) { reject(new Error('the fixture never rendered')); return; }
        setTimeout(poll, 16);
      };
      poll();
    });
  }
  return checksPromise;
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail && !entry.pass ? ` (${entry.detail})` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

window.__errorStateChecks = async () => report(await start());
window.__errorStateAutoRun = () => {
  start()
    .then(report)
    .catch((error) => report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]));
};

window.__errorStateAutoRun();

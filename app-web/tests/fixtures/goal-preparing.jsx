import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoalPreparingPage } from '../../src/features/app/components/GoalPreparingPage.jsx';
import '../../styles/base.css';
import '../../styles/surfaces.css';
import '../../styles/app-shell.css';

// 盖在真实 app-body 上：底下的 Chat/Bot 内容还在（输入草稿不丢），但用户只能看到
// 标准整页 Loader，直到 Goal 任务交接完成。
createRoot(document.getElementById('root')).render(
  <div className="app-shell" style={{ height: '100vh' }}>
    <div className="app-body" id="stage" style={{ height: '100vh' }}>
      <div style={{ gridColumn: '1 / -1', height: '100%' }}>Underlying chat or bot page</div>
      <GoalPreparingPage />
    </div>
  </div>,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
function check(ok, label) { failed ||= !ok; report.textContent += `${ok ? 'PASS' : 'FAIL'} ${label}\n`; }
(async () => {
  for (let i = 0; i < 40 && !document.querySelector('.goal-preparing-overlay'); i++) await sleep(50);
  const overlay = document.querySelector('.goal-preparing-overlay');
  const stage = document.getElementById('stage');
  const style = getComputedStyle(overlay);
  const box = overlay.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  check(Boolean(overlay), 'the shell has a Goal preparation page');
  check(overlay.textContent.includes('Preparing Goal Loop'), 'the page uses the standard loading label');
  const stageStyle = getComputedStyle(stage);
  check(style.position === 'absolute' && style.zIndex === '30' && stageStyle.position === 'relative', 'the page covers the body without unmounting the page underneath');
  check(style.backgroundImage !== 'none', 'the page paints an opaque shell background instead of leaving the draft visible');
  check(Math.abs(box.left - stageBox.left) < 1 && Math.abs(box.right - stageBox.right) < 1
    && Math.abs(box.top - stageBox.top) < 1 && Math.abs(box.bottom - stageBox.bottom) < 1,
  'the page fills the whole app body, including its padding');
  check(document.body.textContent.includes('Underlying chat or bot page'), 'the composer/draft host stays mounted behind the loader');
  check(!document.body.textContent.includes('Describe the task for Goal Loop'), 'the input box never shows a Goal placeholder');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

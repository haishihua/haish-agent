import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatTimelineToolNode } from '../../src/features/chat/components/ChatTimelineNodes.jsx';
import '../../styles.css';

// 生产工具节点与真实结构化响应，覆盖折叠、旧标题和窄卡片。
// 页面加载后自动跑 window.__checkpointChecks()，结果写进 #result / #checks。
const clock = (hour, minute) => {
  const stamp = new Date();
  stamp.setHours(hour, minute, 0, 0);
  return stamp.toISOString();
};

const GROUPS = [
  {
    task_id: 'task-format',
    task_title: 'Formatting sweep',
    updated_at: clock(10, 20),
    paths: Array.from({ length: 31 }, (_, index) => `app-web/src/f${index}.js`),
  },
  {
    task_id: 'task-tests',
    task_title: "[TextPart(text='Tests added', kind='text'), ImagePart(url='/private/image.png', kind='image')]",
    updated_at: clock(10, 12),
    paths: ['a.js', 'b.js', 'c.js', 'd.js'],
    current: true,
  },
  {
    task_id: 'task-converter',
    task_title: 'Converter guarded',
    updated_at: clock(9, 58),
    paths: ['app-web/src/convert.js', 'app-web/src/convert.test.js'],
  },
  {
    task_id: 'task-before',
    task_title: 'Before the converter change',
    updated_at: clock(9, 41),
    paths: [],
  },
];

const LONG_GROUPS = [
  {
    task_id: 'task-long',
    task_title: 'Refactor the checkpoint history element so long titles still ellipsize inside a narrow tool card',
    updated_at: clock(11, 5),
    paths: ['x.js'],
    current: true,
  },
];

const itemFor = (groups) => ({
  id: groups[0].task_id,
  callId: groups[0].task_id,
  toolName: 'list_checkpoints',
  status: 'done',
  toolInput: { limit: 20 },
  toolResponse: { status: 'ok', data: { groups, count: groups.length, total_groups: groups.length } },
});

function Card({ item, width }) {
  return <div className="chat-timeline" style={{ width }}><ChatTimelineToolNode item={item} /></div>;
}

function App() {
  const wide = React.useMemo(() => itemFor(GROUPS), []);
  const narrow = React.useMemo(() => itemFor(LONG_GROUPS), []);
  return (
    <div style={{ padding: '16px 24px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      <div id="wide-card"><Card item={wide} width={420} /></div>
      <div id="narrow-card"><Card item={narrow} width={220} /></div>
    </div>
  );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkpointChecks() {
  const checks = [];
  const push = (name, ok) => checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);

  const wide = document.querySelector('#wide-card .aui-checkpoint-history');
  const narrow = document.querySelector('#narrow-card .aui-checkpoint-history');
  const rows = [...(wide?.querySelectorAll('.aui-checkpoint-row') || [])];
  const labels = rows.map((row) => row.querySelector('.aui-checkpoint-label')?.textContent || '');
  const meta = rows.map((row) => row.querySelector('.aui-checkpoint-meta')?.textContent || '');

  // 1) 后端旧 current 不可信，列表不显示错误高亮或未来状态。
  push('四组 checkpoint 各一行', rows.length === 4);
  push('按旧 → 新排列', labels[0] === 'Before the converter change' && labels[3] === 'Formatting sweep');
  push('历史多模态标题只显示文本', labels[2] === 'Tests added');
  push('不使用旧的 current 标记', rows.every((row) => row.dataset.current === 'false'));
  push('所有行正常显示，不误标为未来', rows.every((row) => getComputedStyle(row).opacity === '1' && !row.classList.contains('is-ahead')));

  // 3) 只读：卡里没有任何按钮（工具卡头部那个 trigger 不算），也没有原生 title。
  push('列表里没有 Restore 按钮', wide.querySelectorAll('button').length === 0);
  push('没有原生 title 提示', wide.querySelector('[title]') === null);

  // 4) 文案与排版：时间 + 文件数、行紧凑、字体跟正文一套。
  push('元信息是「时间 · N files」', meta[0] === '09:41 · 0 files' && meta[3] === '10:20 · 31 files');
  push('单个文件用单数', (narrow.querySelector('.aui-checkpoint-meta')?.textContent || '').endsWith('1 file'));
  push('标题和时间分两行', rows.every((row) => row.querySelector('.aui-checkpoint-meta').getBoundingClientRect().top >= row.querySelector('.aui-checkpoint-label').getBoundingClientRect().bottom - 1));
  push('卡片宽度不超过官方 max-w-sm', wide.getBoundingClientRect().width <= 384);
  push('时间是等宽数字', getComputedStyle(wide.querySelector('.aui-checkpoint-meta')).fontVariantNumeric === 'tabular-nums');
  push('字体不是等宽', !/mono/i.test(getComputedStyle(wide.querySelector('.aui-checkpoint-label')).fontFamily));

  // 5) 窄卡片：长标题单行省略，卡片不撑宽容器。
  const longLabel = narrow.querySelector('.aui-checkpoint-label');
  const labelStyle = getComputedStyle(longLabel);
  push('长标题单行省略', longLabel.scrollWidth > longLabel.clientWidth + 1
    && labelStyle.textOverflow === 'ellipsis' && labelStyle.whiteSpace === 'nowrap');
  const narrowBox = narrow.getBoundingClientRect();
  const narrowHost = narrow.parentElement.getBoundingClientRect();
  push('窄卡里的列表不超过容器宽度', narrowBox.width <= narrowHost.width + 1);

  push('根节点带 data-slot', wide.getAttribute('data-slot') === 'checkpoint-history');
  return checks;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
await wait(100);
document.querySelectorAll('.aui-tool-trigger[aria-expanded="false"]').forEach((button) => button.click());
await wait(400);

let checks = [];
try {
  checks = await checkpointChecks();
} catch (error) {
  checks = [`FAIL 断言抛错：${error && error.message ? error.message : error}`];
}
const list = document.getElementById('checks');
const result = document.getElementById('result');
const failed = checks.filter((line) => line.startsWith('FAIL'));
if (list) list.textContent = checks.join('\n');
if (result) {
  result.textContent = failed.length ? `FAIL — ${failed.length} of ${checks.length}` : `PASS — ${checks.length} checkpoint checks`;
  result.dataset.result = failed.length ? 'fail' : 'pass';
}
window.__checkpointChecks = checkpointChecks;

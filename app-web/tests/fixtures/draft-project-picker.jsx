import React from 'react';
import { createRoot } from 'react-dom/client';
import { DraftProjectPicker } from '../../src/features/chat/components/DraftProjectPicker.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// 首页的项目选择器向上展开，外面套着 .chat-workspace（overflow: clip）。
// 这里把面板故意压到 420px 高，验证项目多时菜单不会被面板上沿裁掉。
const projects = [
  ['p1', 'haish-agent'],
  ['p2', 'haish-agent-core'],
  ['p3', 'zhanruitao'],
  ['p4', 'master'],
  ['p5', 'hilaw-contract-review-test'],
  ['p6', 'ai-agent-core'],
  ['p7', 'hilaw-contract-review'],
  ['p8', 'agent-runtime'],
  ['p9', 'design-system'],
  ['p10', 'docs'],
  ['p11', 'marketing-site'],
  ['p12', 'mobile-client'],
  ['p13', 'playground'],
  ['p14', 'research-notes'],
].map(([id, name]) => ({ id, name, workspacePath: `/Users/zhanruitao/front-end-project/${name}` }));

function Fixture() {
  const [selected, setSelected] = React.useState('p2');
  return (
    <AppTooltipProvider>
      <div className="chat-workspace" style={{ height: 420, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <DraftProjectPicker
          projects={projects}
          selectedId={selected}
          onSelect={setSelected}
          onAddProject={() => {}}
        />
      </div>
    </AppTooltipProvider>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
const report = document.getElementById('checks');
const check = (ok, label) => { report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; report.dataset.result = ok ? 'PASS' : 'FAIL'; };
const tick = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await tick(300);
  document.querySelector('.draft-project-trigger').click();
  await tick(300);
  const workspace = document.querySelector('.chat-workspace').getBoundingClientRect();
  const menu = document.querySelector('.draft-project-menu');
  const list = document.querySelector('.draft-project-options');
  const menuRect = menu.getBoundingClientRect();
  check(menuRect.top >= workspace.top - 0.5, `menu top ${Math.round(menuRect.top)} stays inside workspace top ${Math.round(workspace.top)}`);
  check(menuRect.height <= 360.5, `menu height ${Math.round(menuRect.height)} is capped`);
  check(list.scrollHeight > list.clientHeight + 1, 'project list scrolls instead of growing');
  const add = document.querySelector('.draft-project-add').getBoundingClientRect();
  check(add.bottom <= menuRect.bottom + 0.5 && add.top >= menuRect.top, 'Add Project stays visible at the menu bottom');
  list.scrollTop = 400;
  await tick(120);
  check(list.scrollTop > 0, 'wheel offset reaches the later projects');
  window.__projectPickerChecks = () => report.textContent;
})();

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkflowRuntimeEntry } from '../../src/features/workflow/components/WorkflowRuntimeEntry.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/workflow-runtime.css';

const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = createRoot(document.getElementById('root'));
const render = (loading) => flushSync(() => root.render(
  <div className="app-shell">
    <header />
    <div className="app-body workflow-mode">
      <aside style={{ gridColumn: 1 }} />
      <div className="app-workflow-stage">
        <WorkflowRuntimeEntry loading={loading} />
      </div>
    </div>
  </div>,
));
function checkLoader(prefix) {
  const loaders = document.querySelectorAll('[data-slot="generation-loader"]');
  check(`${prefix}: exactly one nine-dot shared loader`, loaders.length === 1 && loaders[0].querySelectorAll('.aui-loader-cell.is-dots').length === 9);
  check(`${prefix}: accessible status and workflow label`, document.querySelector('[role="status"]')?.textContent.includes('Loading workflow'));
  const bounds = loaders[0]?.getBoundingClientRect();
  const stage = document.querySelector('.app-workflow-stage').getBoundingClientRect();
  check(`${prefix}: centered horizontally and vertically`, bounds && Math.abs(bounds.x + bounds.width / 2 - stage.x - stage.width / 2) < 2 && Math.abs(bounds.y + bounds.height / 2 - stage.y - stage.height / 2) < 2);
  check(`${prefix}: no premature canvas or composer`, !document.querySelector('.workflow-run-layout, .workflow-run-empty, .workflow-composer-dock'));
}
async function run() {
  render(false);
  checkLoader('first Bot chunk load');
  render(true);
  await sleep(500);
  checkLoader('conversation restoring');
  render(false);
  for (let index = 0; index < 100 && !document.querySelector('.workflow-run-empty'); index += 1) await sleep(100);
  check('loaded empty workflow shows normal selection state', Boolean(document.querySelector('.workflow-run-empty')));
  check('loader unmounts after loading', !document.querySelector('[data-slot="generation-loader"]'));
  render(true);
  await sleep(100);
  checkLoader('subsequent task load');
  window.__workflowLoadingResults = results;
  const output = document.getElementById('checks');
  output.dataset.result = results.every((item) => item.pass) ? 'PASS' : 'FAIL';
  output.textContent = `${output.dataset.result}\n${results.map((item) => `${item.pass ? '✓' : '✗'} ${item.name}`).join('\n')}`;
}
run().catch((error) => { document.getElementById('checks').dataset.result = 'FAIL'; document.getElementById('checks').textContent = String(error.stack || error); });

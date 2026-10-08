import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToolsConfigEditor } from '../../src/features/settings/components/ToolsConfigEditor.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../src/features/settings/settings.css';

const skill = { name: 'example-skill', description: 'Example skill description.', root: '/fixture/skills/example-skill', source: 'haish', enabled: true };
let records = { tools: [{ id: 'tools-skills', skill_can_install: false, skills: [skill] }] };
const calls = [];
const root = createRoot(document.getElementById('root'));
const draw = () => root.render(
  <div className="settings-theme dark" data-settings-portal="">
    <ToolsConfigEditor selectedId="tools-skills-global" records={records}
      onRecordsChange={() => {}}
      onToggleSkill={(name, enabled) => {
        calls.push({ name, enabled });
        records = { tools: [{ ...records.tools[0], skills: [{ ...skill, enabled }] }] };
        draw();
      }} />
  </div>,
);
const wait = async (predicate) => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for fixture UI');
};
const checks = [];
const check = (condition, message) => {
  checks.push(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) throw new Error(message);
};
async function main() {
  draw();
  await wait(() => document.querySelector('[aria-label="Enable example-skill"]'));
  check(document.querySelectorAll('[role="switch"]').length === 1, 'one outer enable control');
  document.querySelector('[aria-label="Enable example-skill"]').click();
  await wait(() => calls.length === 1);
  check(calls[0].name === skill.name && calls[0].enabled === false, 'outer switch still toggles skill');
  await wait(() => document.querySelector('[aria-label="Enable example-skill"]').getAttribute('aria-checked') === 'false');
  document.querySelector('[aria-label="Edit example-skill"]').click();
  await wait(() => document.querySelector('.skill-details'));
  const detail = document.querySelector('.skill-details');
  check(detail.textContent.includes(skill.description), 'detail preserves description');
  check(detail.textContent.includes(skill.root), 'detail preserves location');
  check(!detail.querySelector('[role="switch"]') && !detail.textContent.includes('Enable skill'), 'detail has no duplicate enable control');
  check(document.querySelectorAll('[role="switch"]').length === 1, 'only outer switch remains while details open');
  check(calls.length === 1, 'opening details does not change enablement');
  await wait(() => document.querySelector('[role="dialog"] button') !== null);
  document.querySelector('[role="dialog"] [aria-label="Close editor"]').click();
  await wait(() => !document.querySelector('.skill-details'));
  check(Boolean(document.querySelector('[aria-label="Enable example-skill"]')), 'outer control remains after closing');
  document.querySelector('[aria-label="Edit example-skill"]').click();
  await wait(() => document.querySelector('.skill-details'));
}
main().then(() => {
  const report = document.getElementById('checks');
  report.dataset.result = 'PASS';
  report.textContent = checks.join('\n');
}).catch(error => {
  const report = document.getElementById('checks');
  report.dataset.result = 'FAIL';
  report.textContent = `${checks.join('\n')}\n${error.stack || error}`;
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentConfigEditor } from '../../src/features/settings/components/AgentConfigEditor.jsx';
import { normalizeAgentSettings } from '../../src/features/agents/model/agent-settings.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const id = 'custom.code-mode-fixture';
const initial = normalizeAgentSettings({ custom: [{
  agent_id: id, custom: true, display_name: 'Tool Script fixture',
  tool_policy: { allow: [], deny: [] },
  mcp_policy: { allow_servers: [], allow_tools: [] },
}] });
function Harness() {
  const [settings, setSettings] = React.useState(initial);
  const [generation, setGeneration] = React.useState(0);
  return <AppTooltipProvider>
    <AgentConfigEditor key={generation} selectedId={id} settings={settings} onSettingsChange={setSettings} />
    <button id="save" onClick={() => localStorage.setItem('code-mode-fixture', JSON.stringify(settings))}>Save fixture</button>
    <button id="reload" onClick={() => {
      setSettings(normalizeAgentSettings(JSON.parse(localStorage.getItem('code-mode-fixture'))));
      setGeneration(value => value + 1);
    }}>Reload fixture</button>
    <pre id="policy">{JSON.stringify(settings.custom[0].tool_policy.allow)}</pre>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Harness />);
const tick = () => new Promise(resolve => setTimeout(resolve, 100));
const results = [];
const check = (condition, label) => results.push(`${condition ? 'PASS' : 'FAIL'} ${label}`);
const checkbox = label => [...document.querySelectorAll('.settings-check-row')]
  .find(row => row.querySelector('.settings-check-label')?.textContent === label)?.querySelector('[role="checkbox"]');
const policy = () => JSON.parse(document.getElementById('policy').textContent);
async function run() {
  await tick();
  check(Boolean(checkbox('Tool Script')), 'Tool Script appears in the real editor');
  check(checkbox('Tool Script').getAttribute('aria-checked') === 'false', 'Tool Script starts unselected');
  checkbox('Tool Script').click();
  await tick();
  check(JSON.stringify(policy()) === '["code_mode"]', 'Checking Tool Script grants only its entry tool');
  check(['File edits', 'Terminal'].every(label => checkbox(label).getAttribute('aria-checked') === 'false'), 'File edits and Terminal remain unselected');
  document.getElementById('save').click();
  document.getElementById('reload').click();
  await tick();
  check(checkbox('Tool Script').getAttribute('aria-checked') === 'true', 'Saved selection survives editor remount');
  checkbox('File read').click();
  await tick();
  checkbox('Tool Script').click();
  await tick();
  check(!policy().includes('code_mode') && policy().includes('read_file'), 'Unchecking removes Tool Script but retains selected read tools');
  document.getElementById('save').click();
  document.getElementById('reload').click();
  await tick();
  check(checkbox('Tool Script').getAttribute('aria-checked') === 'false', 'Saved deselection survives editor remount');
}
run().catch(error => check(false, error.message)).finally(() => {
  localStorage.removeItem('code-mode-fixture');
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});

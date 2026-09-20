import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression: the workflow stage used to render its own "Task Delegation" card
// (features/tasks/components/TaskDelegation.jsx + .task-delegation styles). Two
// composers meant every input fix had to be made twice, and the two boxes had
// drifted apart. The workflow stage now mounts the chat composer
// (features/chat/components/ChatComposer.jsx) inside a positioning dock.
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const appShellSource = read('src/features/app/AppShell.jsx');
const chatPanelSource = read('src/features/chat/components/ChatPanel.jsx');
const workflowPageSource = read('src/features/workflow/components/WorkflowRuntimePage.jsx');
const workflowRuntimeStyles = read('styles/workflow-runtime.css');

test('the delegation card is deleted instead of kept as a second composer', () => {
  assert.equal(
    fs.existsSync(new URL('../../src/features/tasks/components/TaskDelegation.jsx', import.meta.url)),
    false,
    'TaskDelegation.jsx must not come back: the chat composer is the only input box',
  );
  for (const name of fs.readdirSync(new URL('../../styles', import.meta.url))) {
    if (!name.endsWith('.css')) continue;
    const source = withoutComments(read(`styles/${name}`));
    assert.doesNotMatch(
      source,
      /\.task-delegation|\.td-(?:head|title|input-row|actions|tools|glyph|submit-cluster)\b/,
      `${name} must not keep the removed delegation chrome`,
    );
  }
});

test('the workflow stage docks the shared composer into the canvas footer', () => {
  assert.match(workflowPageSource, /<div className="workflow-composer-dock">\{composer\}<\/div>/);
  assert.match(workflowRuntimeStyles, /\.workflow-composer-dock\s*\{[^}]*position: absolute/);
  assert.match(workflowRuntimeStyles, /\.workflow-composer-dock\s*\{[^}]*left: var\(--task-panel-edge-x\)/);
  // The dock owns the placement, so the chat-side margins have to step aside —
  // otherwise the composer keeps its own 28px gutter and double-insets.
  assert.match(workflowRuntimeStyles, /\.workflow-composer-dock \.chat-composer\s*\{[^}]*margin: 0;/);
});

test('chat mode renders the same component instead of a copy of the markup', () => {
  assert.match(chatPanelSource, /<ChatComposer/);
  // ChatPanel keeps the surrounding surface (search, rows, separators) only.
  assert.doesNotMatch(chatPanelSource, /className="chat-composer"|chat-composer-editor|chat-composer-submit|chat-send-icon/);
});

test('the workflow composer drives the workflow picker and cannot steer a running task', () => {
  const mount = appShellSource.match(/composer=\{<ChatComposer[\s\S]*?\n\s*\/>\}/);
  assert.ok(mount, 'AppShell must mount ChatComposer for the workflow stage');
  const props = mount[0];
  assert.match(props, /agentOptions=\{workflowOptions\}/);
  assert.match(props, /defaultAgentId=\{defaultWorkflowId\}/);
  assert.match(props, /onAgentChange=\{setSelectedWorkflowId\}/);
  assert.match(props, /onSend=\{handleDeploy\}/);
  assert.match(props, /onStop=\{handleStop\}/);
  // Steering a live workflow run is not supported, so the composer offers Stop.
  assert.match(props, /allowRuntimeInput=\{false\}/);
  assert.doesNotMatch(props, /skills=|history=|pendingCommentCount=/);
});

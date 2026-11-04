import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../src/features/${path}`, import.meta.url), 'utf8');

test('activity selection belongs to the shell and survives sidebar unmounting', () => {
  const shell = source('app/AppShell.jsx');
  const view = source('app/AppShellView.jsx');
  const panel = source('conversations/components/ConversationsPanel.jsx');
  assert.match(shell, /const \[activityOpen, setActivityOpen\] = useState\(false\)/);
  assert.match(shell, /sidebar=\{\{[\s\S]*?activityOpen, setActivityOpen/);
  assert.match(view, /activityOpen=\{activityOpen\}\s+onActivityOpenChange=\{setActivityOpen\}/);
  assert.match(panel, /activityOpen: controlledActivityOpen/);
  assert.match(panel, /controlledActivityOpen \?\? uncontrolledActivityOpen/);
  assert.match(panel, /onActivityOpenChange\?\.\(next\)/);
});

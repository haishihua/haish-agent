import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const projectNodeSource = read('../../src/features/conversations/components/ProjectNode.jsx');
const conversationsPanelSource = read('../../src/features/conversations/components/ConversationsPanel.jsx');
const appShellSource = read('../../src/features/app/AppShell.jsx');
const listPreviewSource = read('../../src/features/conversations/model/list-preview.js');

test('a folded-away conversation list reopens at the default five-row preview', () => {
  // Reported flow: expand a project with "Show more", click the project icon to
  // fold the list, click it again — the previously expanded list came back.
  // The preview expansion is view state: hiding the list must drop it.
  assert.match(projectNodeSource, /const listVisible = Boolean\(project\.expanded\) && !panelCollapsed;/);
  assert.match(projectNodeSource, /setExtraVisible\(\(previous\) => previewWhenHidden\(previous, listVisible\)\)/);
  assert.match(projectNodeSource, /\}, \[listVisible\]\);/);
  assert.match(projectNodeSource, /useState\(DEFAULT_PREVIEW\)/);
  assert.match(listPreviewSource, /return listVisible \? extraVisible : DEFAULT_PREVIEW;/);
});

test('the collapsed conversation panel also folds every project preview back', () => {
  // The same rule applies when the panel toggle hides the whole list column —
  // and collapsed project nodes stay mounted, so they must be told.
  assert.match(conversationsPanelSource, /panelCollapsed=\{collapsed\}/);
  assert.match(conversationsPanelSource, /collapsed = false,/);
  assert.match(appShellSource, /collapsed=\{conversationPanelCollapsed\}/);
});

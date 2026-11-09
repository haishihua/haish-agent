import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../../../src/features/${name}`, import.meta.url), 'utf8');
test('empty-chat provider onboarding is wired to the existing new chat-provider flow', () => {
  const shell = source('app/AppShell.jsx');
  const view = source('app/AppShellView.jsx');
  const panel = source('chat/components/ChatPanel.jsx');
  const composer = source('chat/components/ChatComposer.jsx');
  const settings = source('settings/components/SettingsPage.jsx');
  assert.match(shell, /setSettingsSection\('llm'\)/);
  assert.match(shell, /llm: 'chat'/);
  assert.match(shell, /action: 'create-chat-provider'/);
  assert.match(view, /showAddProvider=\{llmCatalogReady && llmProviderOptions\.length === 0\}/);
  assert.match(panel, /!loading && messages\.length === 0 && showAddProvider/);
  assert.match(composer, /type="button" className="chat-add-provider" onClick=\{onAddProvider\}/);
  assert.match(settings, /request\?\.action !== 'create-chat-provider'/);
  assert.match(settings, /void addItem\(\)/);
});

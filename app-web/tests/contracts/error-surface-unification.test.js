import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// One failure surface for the whole client: the crash screen, failed chat turns, settings
// sheets, dialogs and the remote dialog all render the shared ErrorState. Before this
// contract each spot carried its own class (.message-action-error, .settings-inline-error,
// .haish-dialog-error, .remote-settings-error, .form-error), so the same failure looked
// different depending on where it happened. See tests/fixtures/error-states.html for the
// rendered variants.
const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
const stylesRoot = fileURLToPath(new URL('../../styles', import.meta.url));

function filesUnder(dir, extensions) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found;
}

const LEGACY_CLASSES = [
  'message-action-error',
  'settings-inline-error',
  'haish-dialog-error',
  'haish-approval-error',
  'remote-settings-error',
  'form-error',
];

const ERRORSTATE_CONSUMERS = [
  'shared/ui/ErrorBoundary.jsx',
  'features/chat/components/ChatMessageRow.jsx',
  'features/settings/components/SettingsPage.jsx',
  'features/settings/components/SettingsPrimitives.jsx',
  'features/settings/components/LlmConfigEditor.jsx',
  'features/settings/components/ToolsConfigEditor.jsx',
  'features/settings/components/AgentConfigEditor.jsx',
  'features/settings/components/SkillUpload.jsx',
  'features/conversations/components/ConversationTaskCards.jsx',
  'features/remote/components/RemoteControlDialog.jsx',
  'features/approvals/components/ApprovalOverlay.jsx',
  'features/chat/components/AskUserInlineForm.jsx',
  'shared/ui/agent-elements/ToolDetails.jsx',
];

test('no failure surface keeps a private error card', () => {
  const files = [
    ...filesUnder(srcRoot, ['.js', '.jsx', '.css']),
    ...filesUnder(stylesRoot, ['.css']),
  ];
  assert.ok(files.length > 150, 'the scan has to see the real source tree');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const legacy of LEGACY_CLASSES) {
      assert.ok(!source.includes(legacy), `${file} still styles its own failure banner (${legacy})`);
    }
  }
});

test('every failure surface renders the shared ErrorState', () => {
  for (const relative of ERRORSTATE_CONSUMERS) {
    const source = readFileSync(join(srcRoot, relative), 'utf8');
    assert.match(source, /import \{ ErrorState \} from '[^']*ErrorState\.jsx';/, `${relative} imports ErrorState`);
    assert.match(source, /<ErrorState/, `${relative} renders ErrorState`);
  }
});

test('feature code never hand-rolls its own alert card', () => {
  // The private classes above are one way to grow a second failure UI; a fresh
  // `role="alert"` div is the other. Feature code has to go through ErrorState, which
  // is the only file allowed to announce a failure itself.
  for (const file of filesUnder(join(srcRoot, 'features'), ['.js', '.jsx'])) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!source.includes('role="alert"'), `${file} announces a failure without ErrorState`);
  }
});

test('ErrorState keeps the one red card vocabulary', () => {
  const source = readFileSync(join(srcRoot, 'shared/ui/agent-elements/ErrorState.jsx'), 'utf8');
  assert.match(source, /role="alert"/, 'the card announces itself to screen readers');
  assert.match(source, /data-slot="error-state"/, 'the card keeps its identifying slot');
  assert.match(source, /variant = 'block'/, 'block stays the default density');
  assert.match(source, /is-inline/, 'the inline density exists for sheets and dialogs');

  const css = readFileSync(join(srcRoot, 'shared/ui/agent-elements/error-state.css'), 'utf8');
  assert.match(css, /\.aui-error-state \{/, 'the card itself');
  assert.match(css, /border-radius: 16px/, 'the chat card radius');
  assert.match(css, /background: rgb\(239 68 68 \/ 10%\)/, 'the shared red tint');
  assert.match(css, /border-radius: 9999px/, 'the retry button stays a pill');
  assert.match(css, /#f87171/, 'the shared red title');
  assert.match(css, /\.aui-error-state\.is-inline \{/, 'the inline density has its own metrics');
  assert.match(css, /\.aui-error-screen \{/, 'the crash screen reuses the same stylesheet');
  assert.match(css, /prefers-reduced-motion/, 'the reduced-motion opt-out survives');
});

test('the crash screen reuses ErrorState and keeps stale-bundle detection', () => {
  const source = readFileSync(join(srcRoot, 'shared/ui/ErrorBoundary.jsx'), 'utf8');
  assert.match(source, /import \{ ErrorState \} from '\.\/agent-elements\/ErrorState\.jsx';/);
  assert.match(source, /<ErrorState/, 'the crash screen is the shared card, not an inline-styled box');
  assert.match(source, /Failed to fetch dynamically imported module/, 'stale-chunk detection stays');
  assert.match(source, /needsReload \? 'Reload app' : 'Try again'/, 'the two recovery labels stay');
  assert.match(source, /Technical details/, 'the raw stack is still reachable');
  assert.doesNotMatch(source, /style=\{\{/, 'the crash screen must not fall back to ad-hoc inline styles');
});

test('a stale renderer bundle self-recovers once per session', () => {
  const source = readFileSync(join(srcRoot, 'shared/lib/preload-recovery.js'), 'utf8');
  assert.match(source, /addEventListener\('vite:preloadError'/, "Vite's own signal for a chunk that 404s");
  assert.match(source, /sessionStorage\.getItem\(CHUNK_RELOAD_FLAG\)/, 'the loop guard is read');
  assert.match(source, /sessionStorage\.setItem\(CHUNK_RELOAD_FLAG/, 'the loop guard is written before reloading');
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /target\.location\.reload\(\)/);

  const entry = readFileSync(join(srcRoot, 'main.jsx'), 'utf8');
  const recovery = entry.indexOf("import './shared/lib/preload-recovery.js';");
  const app = entry.indexOf("import './app.jsx';");
  assert.ok(recovery !== -1, 'main.jsx imports the recovery module');
  assert.ok(app !== -1 && recovery < app, 'the listener has to exist before the app module evaluates');
});

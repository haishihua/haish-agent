import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: every "new conversation" used to mint a fresh `draft-<hex>` id,
// and the unsent composer text is keyed by conversation id — so leaving the
// blank chat orphaned whatever the user had typed. The draft id must be stable
// per project while the draft is unsent, and released once it becomes real.
const handlers = readFileSync(new URL('../../src/features/conversations/hooks/createDraftConversationHandlers.js', import.meta.url), 'utf8');
const appShell = readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');

test('opening a new conversation reuses the remembered draft id', () => {
  assert.match(
    handlers,
    /const draftId = rememberDraftConversationId\(\s*draftConversationIdsRef\.current,\s*project\.id,\s*generateHexId,/,
    'a fresh id per click is what lost the draft text',
  );
  assert.doesNotMatch(handlers, /const draftId = `draft-\$\{generateHexId\(\)\}`/, 'the random per-click id must be gone');
});

test('a materialized draft releases its id for the next new conversation', () => {
  assert.match(
    handlers,
    /forgetDraftConversationId\(draftConversationIdsRef\.current, draft\.projectId\)/,
    'a consumed draft id would otherwise seed the next blank chat with old text',
  );
});

test('AppShell provides the per-project draft id registry', () => {
  assert.match(appShell, /const draftConversationIdsRef = useRef\(new Map\(\)\);/);
  assert.match(appShell, /draftConversationIdsRef,\s*draftConversationRef,/, 'the handlers need the registry');
});

test('the unsent text stays keyed by conversation id', () => {
  assert.match(
    appShell,
    /} = usePerConversationDraft\(conversationId\);/,
    'a draft id that changes per click can only be survived while the hook reads the conversation id',
  );
});

test('a discarded draft returns its text to the draft id', () => {
  assert.match(
    handlers,
    /if \(draft\?\.localDraftId && draft\.localDraftId !== draft\.id\) \{\s*rekeyChatDraft\?\.\(draft\.id, draft\.localDraftId\);\s*\}/,
    'a server-created draft must hand its text back before the conversation is deleted',
  );
  assert.match(
    handlers,
    /localDraftId: previousDraftId,/,
    'the server-created draft must remember which blank chat it came from',
  );
});

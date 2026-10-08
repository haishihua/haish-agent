import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8');
const search = read('features/chat/components/ConversationSearch.jsx');
const panel = read('features/chat/components/ChatPanel.jsx');
const row = read('features/chat/components/ChatMessageRow.jsx');
const follow = read('shared/ui/ScrollToBottomButton.jsx');

test('search refresh is not an implicit navigation request and focus return cannot scroll', () => {
  assert.match(search, /if \(navigationRef\.current === key\) return;/);
  assert.match(search, /collectedQueryRef\.current === query/);
  assert.match(search, /focus\?\.\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(search, /scrollToConversationMatch\(scrollRef\.current, active\?\.range\)/);
});

test('search retains discovered history and expanded traces when closed', () => {
  assert.match(panel, /setRowWindow\(\(count\) => Math\.max\(count, context\.rowCount\)\)/);
  assert.match(panel, /searchExpandedConversation === conversationId/);
  assert.match(panel, /onSearchChange=\{handleSearchChange\}/);
  assert.match(row, /if \(forceTraceOpen\) setTraceExpanded\(true\)/);
});

test('enabling autoFollow again does not reinstall the bottom-reset effect', () => {
  assert.match(follow, /if \(!autoFollow\) followLatestRef\.current = false;/);
  assert.match(follow, /\}, \[resetKey, scrollRef\]\);/);
  assert.doesNotMatch(follow, /\[autoFollow, resetKey, scrollRef\]/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../../../src/features/settings/components/${name}`, import.meta.url), 'utf8');

test('settings deletion uses a direct swipe action instead of a menu', () => {
  const row = read('SettingsPrimitives.jsx');
  assert.doesNotMatch(row, /DropdownMenu|Ellipsis/);
  assert.match(row, /return onDelete \? <SettingsSwipeRow/);
  assert.match(row, /SettingsDeleteDialog/);
});

test('delete button is only visible after swiping, never on hover', () => {
  const swipe = read('SettingsSwipeRow.jsx');
  assert.doesNotMatch(swipe, /settings-row-delete/);
  assert.match(swipe, /visibility: offset < 0 \? 'visible' : 'hidden'/);
});

test('swiping only reveals the action and isolates toggles and vertical scrolling', () => {
  const swipe = read('SettingsSwipeRow.jsx');
  const finish = swipe.slice(swipe.indexOf('const finish'), swipe.indexOf('return <motion.div'));
  assert.doesNotMatch(finish, /onDelete\(/);
  assert.match(swipe, /pointercancel/);
  assert.match(swipe, /item-actions/);
  assert.match(swipe, /Math.abs\(dy\) > Math.abs\(dx\)/);
  assert.match(swipe, /event.preventDefault\(\); event.stopPropagation\(\)/);
  assert.match(swipe, /useReducedMotion/);
  assert.match(swipe, /removeEventListener/);
});

test('unsaved new entries cannot reveal or request deletion', () => {
  const page = read('SettingsPage.jsx');
  assert.match(page, /onDelete=\{\(item.canDelete \|\| item.custom\) && !isUnsavedListItem\(activeSection, item.id\)/);
  assert.match(page, /if \(isUnsavedListItem\(section, id\)\) return;/);
  const predicate = page.slice(page.indexOf('const isUnsavedListItem'), page.indexOf('const requestDelete'));
  const isUnsaved = new Function('editingSettings', 'workflowById', 'workflowSettings', `${predicate}; return isUnsavedListItem;`);
  for (const section of ['llm', 'compact', 'embedding', 'agent', 'workflow']) {
    const check = isUnsaved({ section, id: 'new-id', mode: 'new' }, () => null, {});
    assert.equal(check(section, 'new-id'), true);
    assert.equal(check(section, 'saved-id'), false);
    assert.equal(isUnsaved(null, () => null, {})(section, 'new-id'), false);
  }
  assert.equal(isUnsaved(null, () => ({ draft: true }), {})('workflow', 'draft'), true);
  assert.match(page, /previous.id === id && previous.mode === 'new' \? 'new' : mode/);
});

test('reselecting the current draft does not cancel or discard its data', async () => {
  const page = read('SettingsPage.jsx');
  const source = page.slice(page.indexOf('const selectListItem'), page.indexOf('const openEditor'));
  let cancelled = 0;
  let selected = 0;
  const create = new Function('editingSettings', 'activeSection', 'cancelEditor', 'selectItem', `${source}; return selectListItem;`);
  const select = create({ section: 'llm', id: 'draft' }, 'llm', async () => { cancelled++; return true; }, () => { selected++; });
  assert.equal(await select('draft'), true);
  assert.equal(cancelled, 0);
  assert.equal(selected, 0);
  const blocked = create(null, 'llm', async () => false, () => { selected++; });
  assert.equal(await blocked('other'), false);
  assert.equal(selected, 0);
  assert.match(page, /await selectListItem\(item.id\) === false/);
});

test('both configuration and skill lists support successful removal transitions', () => {
  for (const name of ['SettingsPage.jsx', 'ToolsConfigEditor.jsx']) {
    assert.match(read(name), /<AnimatePresence[^>]*initial=\{false\}>/);
    assert.match(read(name), /reducedMotion="user"/);
  }
  assert.match(read('ToolsConfigEditor.jsx'), /item.can_uninstall/);
});

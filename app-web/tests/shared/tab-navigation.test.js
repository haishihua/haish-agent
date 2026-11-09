import test from 'node:test';
import assert from 'node:assert/strict';
import { TAB_NAVIGATION_KEYS, tabNavigationTarget } from '../../src/shared/lib/tab-navigation.js';

const tabs = ['config', 'result'];

test('Home and End jump to the first and last tab', () => {
  assert.equal(tabNavigationTarget('Home', tabs, 'result'), 'config');
  assert.equal(tabNavigationTarget('End', tabs, 'config'), 'result');
});

test('arrow keys wrap around both ends instead of dead-ending', () => {
  assert.equal(tabNavigationTarget('ArrowRight', tabs, 'config'), 'result');
  assert.equal(tabNavigationTarget('ArrowRight', tabs, 'result'), 'config');
  assert.equal(tabNavigationTarget('ArrowLeft', tabs, 'config'), 'result');
  assert.equal(tabNavigationTarget('ArrowLeft', tabs, 'result'), 'config');
});

test('three or more tabs move one step rather than jumping to "the other" tab', () => {
  const many = ['one', 'two', 'three'];
  assert.equal(tabNavigationTarget('ArrowRight', many, 'one'), 'two');
  assert.equal(tabNavigationTarget('ArrowLeft', many, 'three'), 'two');
});

test('non-navigation keys and empty tab lists are ignored', () => {
  assert.equal(TAB_NAVIGATION_KEYS.length, 4);
  assert.equal(tabNavigationTarget('Enter', tabs, 'config'), null);
  assert.equal(tabNavigationTarget('ArrowDown', tabs, 'config'), null);
  assert.equal(tabNavigationTarget('Home', [], 'config'), null);
  assert.equal(tabNavigationTarget('Home', null, 'config'), null);
});

test('an unknown active tab falls back to an end the arrow points at', () => {
  assert.equal(tabNavigationTarget('ArrowRight', tabs, 'missing'), 'config');
  assert.equal(tabNavigationTarget('ArrowLeft', tabs, 'missing'), 'result');
});

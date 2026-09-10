import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/shared/ui/ScrollToBottomButton.jsx', import.meta.url), 'utf8');
// Execute the production effect with deterministic browser scheduling, without JSX rendering.
const effectBody = source.split('React.useLayoutEffect(() => {')[1].split('}, [autoFollow, resetKey, scrollRef]);')[0];
const createEffect = new Function(
  'scrollRef', 'frameRef', 'followLatestRef', 'autoFollow', 'setVisible',
  'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'MutationObserver', 'SHOW_THRESHOLD',
  effectBody,
);
const SHOW_THRESHOLD = Number(source.match(/const SHOW_THRESHOLD = (\d+)/)[1]);
const CONTENT_HEIGHT = 1000;
const VIEWPORT_HEIGHT = 500;

for (const firstFrameId of [0, 1]) {
  test(`button updates after a pending frame is canceled (first frame ID ${firstFrameId})`, () => {
    const frames = new Map();
    const listeners = new Map();
    let nextFrameId = firstFrameId;
    let visible = false;
    const frameRef = { current: null };
    const followLatestRef = { current: true };
    const element = {
      scrollHeight: CONTENT_HEIGHT, clientHeight: VIEWPORT_HEIGHT, scrollTop: 0, children: [],
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type) => listeners.delete(type),
    };
    class Observer {
      observe() {}
      disconnect() {}
    }
    const setup = () => createEffect(
      { current: element }, frameRef, followLatestRef, false, (value) => { visible = value; },
      (callback) => { const id = nextFrameId++; frames.set(id, callback); return id; },
      (id) => frames.delete(id), Observer, Observer, SHOW_THRESHOLD,
    );
    const flush = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    };

    let cleanup = setup();
    assert.equal(frames.size, 1, 'multiple notifications share one frame, including ID zero');
    flush();
    assert.equal(visible, true, 'away from the bottom');

    listeners.get('scroll')();
    cleanup(); // A conversation/search/send dependency changes before the frame runs.
    assert.equal(frames.size, 0, 'cleanup cancels pending work');
    element.scrollTop = CONTENT_HEIGHT - VIEWPORT_HEIGHT;
    cleanup = setup();
    assert.equal(frames.size, 1, 'the new effect can schedule a fresh update');
    flush();
    assert.equal(visible, false, 'at the bottom, the stale visible state must clear');

    element.scrollTop -= SHOW_THRESHOLD;
    listeners.get('scroll')();
    flush();
    assert.equal(visible, false, 'within the bottom threshold');
    element.scrollTop -= 1;
    listeners.get('scroll')();
    flush();
    assert.equal(visible, true, 'scrolling beyond the threshold still shows the button');
    cleanup();
    assert.equal(listeners.size, 0);
    assert.equal(frames.size, 0);
  });
}

test('streaming follows the bottom but preserves even a small upward scroll', () => {
  const frames = new Map();
  const listeners = new Map();
  let nextId = 1;
  let visible = false;
  let resize;
  let scrollTop = 0;
  const element = {
    scrollHeight: CONTENT_HEIGHT, clientHeight: VIEWPORT_HEIGHT, children: [],
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
  };
  class ResizeObserver {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  }
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const cleanup = createEffect(
    { current: element }, { current: null }, { current: true }, true,
    (value) => { visible = value; },
    (callback) => { const id = nextId++; frames.set(id, callback); return id; },
    (id) => frames.delete(id), ResizeObserver, MutationObserver, SHOW_THRESHOLD,
  );
  const flush = () => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach((callback) => callback());
  };
  flush();
  assert.equal(visible, false);
  const growth = 100;
  element.scrollHeight += growth;
  resize(); flush();
  assert.equal(element.scrollTop, element.scrollHeight - VIEWPORT_HEIGHT);
  assert.equal(visible, false);

  // Opening long histories: estimated row heights can shrink, then expand as
  // markdown/images become visible. Neither is a user request to stop following.
  element.scrollHeight -= growth;
  element.scrollTop -= growth * 2;
  listeners.get('scroll')();
  resize(); flush();
  assert.equal(element.scrollTop, element.scrollHeight - VIEWPORT_HEIGHT);
  element.scrollHeight += growth * 3;
  resize(); flush();
  assert.equal(element.scrollTop, element.scrollHeight - VIEWPORT_HEIGHT);
  assert.equal(visible, false);

  const smallUpwardScroll = 20;
  resize(); // Already queued when the user scrolls away.
  listeners.get('wheel')({ deltaY: -smallUpwardScroll });
  element.scrollTop -= smallUpwardScroll;
  listeners.get('scroll')();
  const readingPosition = element.scrollTop;
  element.scrollHeight += growth;
  resize(); flush();
  assert.equal(element.scrollTop, readingPosition, 'new tokens must not pull the reader down');
  assert.equal(visible, true);

  element.scrollTop = element.scrollHeight;
  listeners.get('scroll')(); flush();
  assert.equal(visible, false);
  element.scrollHeight += growth;
  resize(); flush();
  assert.equal(element.scrollTop, element.scrollHeight - VIEWPORT_HEIGHT, 'follow resumes at the bottom');
  for (const [type, event] of [
    ['keydown', { key: 'PageUp' }],
    ['touchstart', {}],
    ['pointerdown', { target: element }],
  ]) {
    listeners.get(type)(event);
    element.scrollTop -= smallUpwardScroll;
    listeners.get('scroll')();
    const position = element.scrollTop;
    element.scrollHeight += growth;
    resize(); flush();
    assert.equal(element.scrollTop, position, `${type} releases bottom lock`);
    element.scrollTop = element.scrollHeight;
    listeners.get('scroll')(); flush();
  }
  cleanup();
  assert.equal(listeners.size, 0);
});

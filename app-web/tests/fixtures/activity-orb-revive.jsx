import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/chat.css';
import '../../styles/markdown.css';

// ---------------------------------------------------------------------------
// Live check for the frozen activity orb ("the orb stops animating when I
// switch conversations", reported 2026-09-16).
//
// thinking-orbs stops its rAF loop when the canvas leaves the viewport or the
// window is hidden, and only starts it again when its own bookkeeping agrees.
// The app cannot restart that loop, so ActivityOrb remounts the library
// component when the canvas stops changing while it is on screen. This fixture
// reproduces the two ways a loop can end up permanently stopped and checks that
// the orb comes back - and that a healthy orb is never remounted.
//
// Run with vite: open /tests/fixtures/activity-orb-revive.html and execute
// `await window.__orbChecks()`.
// ---------------------------------------------------------------------------
const FILLER = 'Filler answer line.\n\n- one\n- two\n\n```js\nconst a = 1;\n```';

function fillerRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index}`,
    taskId: `task${index}`,
    conversationId: 'orb',
    messageId: `msg${index}`,
    role: 'agent',
    status: 'done',
    streaming: false,
    text: `${FILLER}\n\nrow ${index}`,
    createdAt: Date.now() - (count - index) * 60_000,
    completedAt: Date.now() - (count - index) * 60_000 + 4_000,
  }));
}

function streamingRow() {
  const now = Date.now();
  return {
    id: 'streaming',
    taskId: 'running',
    conversationId: 'orb',
    messageId: 'agentmsg',
    role: 'agent',
    status: 'running',
    streaming: true,
    text: '',
    progressLines: [],
    traceTimeline: [
      { id: 'text-1', kind: 'text', text: 'working on it', status: 'running' },
      { id: 'tool-1', kind: 'tool', toolName: 'exec_command', status: 'running', summary: 'Bash' },
    ],
    traceLatestTodos: null,
    createdAt: now,
    firstTokenAt: now,
  };
}

function App() {
  const listRef = React.useRef(null);
  const [messages] = React.useState(() => [...fillerRows(14), streamingRow()]);

  // ChatPanel keeps the same list node and settles it at the bottom.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let cancelled = false;
    const settle = async (steps = 12) => {
      let previous = -1;
      for (let index = 0; index < steps && !cancelled; index += 1) {
        list.scrollTop = list.scrollHeight;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        if (list.scrollTop === previous) break;
        previous = list.scrollTop;
      }
    };
    settle();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    window.__scrollBottom = async (steps = 8) => {
      const list = listRef.current;
      if (!list) return null;
      let previous = -1;
      // setTimeout instead of rAF: an occluded automation window stops rAF, and this helper
      // must not hang when that happens.
      for (let index = 0; index < steps; index += 1) {
        list.scrollTop = list.scrollHeight;
        // eslint-disable-next-line no-await-in-loop
        await sleep(60);
        if (list.scrollTop === previous) break;
        previous = list.scrollTop;
      }
      return Math.round(list.scrollTop);
    };
    window.__scrollTop = async () => {
      const list = listRef.current;
      if (!list) return null;
      list.scrollTop = 0;
      await sleep(200);
      return Math.round(list.scrollTop);
    };
  }, []);

  return (
    <div className="app-shell">
      {/* AppShell renders TopBar first, so .app-body lands in the 1fr row. */}
      <div className="topbar" aria-hidden="true" />
      <div className="app-body chat-mode">
        <div className="app-chat-stage">
          <div className="app-chat-main">
            <section className="chat-workspace" aria-label="Chat">
              <div className="chat-message-region">
                <div ref={listRef} className="chat-message-list">
                  {messages.map((message) => (
                    <ChatMessageRow key={message.id} message={message} annotationNumbers={new Map()} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <AppTooltipProvider>
    <App />
  </AppTooltipProvider>,
);

// ------------------------------ check helpers ------------------------------
window.__visibilityTrace = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function orbCanvas() {
  return document.querySelector('.chat-timeline-activity canvas');
}

function activityHost() {
  return document.querySelector('.chat-timeline-activity');
}

function signature(canvas) {
  const context = canvas.getContext('2d');
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 4) {
    hash = ((hash ^ (data[index] + data[index + 3] * 31)) * 16777619) >>> 0;
  }
  return hash;
}

/** Collect pixel signatures of the orb canvas for `durationMs`. */
async function sample(durationMs, stepMs = 150) {
  const started = performance.now();
  const values = [];
  while (performance.now() - started < durationMs) {
    const canvas = orbCanvas();
    if (canvas) values.push(signature(canvas));
    window.__visibilityTrace.push(document.visibilityState);
    // eslint-disable-next-line no-await-in-loop
    await sleep(stepMs);
  }
  return values;
}

/** An occluded automation window stops rAF: only samples taken while visible judge the orb. */
const visibilitySeen = () => [...new Set(window.__visibilityTrace)];
const visibleSamples = () => window.__visibilityTrace.filter((value) => value === 'visible').length;

const distinct = (values) => new Set(values).size;

/** Longest run of consecutive identical frames: how long the orb really stood still. */
function longestStillRun(values) {
  let best = 0;
  let run = 0;
  for (let index = 1; index < values.length; index += 1) {
    run = values[index] === values[index - 1] ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Count how many orb canvases the app renders: a remount replaces the canvas element. */
function watchCanvasRemounts() {
  const host = activityHost();
  let created = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.tagName === 'CANVAS') created += 1;
      }
    }
  });
  observer.observe(host, { childList: true, subtree: true });
  return {
    get count() { return created; },
    stop() { observer.disconnect(); },
  };
}

/** Wait until the orb animates again or the timeout runs out. */
async function waitForAnimation(timeoutMs = 4000) {
  const started = performance.now();
  let measured = 0;
  while (performance.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const values = await sample(700, 140);
    measured = distinct(values);
    if (measured >= 4) return { animated: true, waitedMs: Math.round(performance.now() - started), distinct: measured };
  }
  return { animated: false, waitedMs: timeoutMs, distinct: measured };
}

/** Wait until the watchdog replaced the canvas. */
async function waitForRemount(remounts, timeoutMs = 4000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (remounts.count >= 1) return { remounted: true, waitedMs: Math.round(performance.now() - started) };
    // eslint-disable-next-line no-await-in-loop
    await sleep(120);
  }
  return { remounted: false, waitedMs: timeoutMs };
}

async function checkHealthyOrbIsNeverRemounted() {
  await window.__scrollBottom();
  await sleep(300);
  const remounts = watchCanvasRemounts();
  const values = await sample(2400, 150);
  const result = {
    name: 'healthy orb animates and is never remounted',
    visibility: document.visibilityState,
    canvases: document.querySelectorAll('.chat-timeline-activity canvas').length,
    distinctSignatures: distinct(values),
    remounts: remounts.count,
  };
  remounts.stop();
  result.pass = result.visibility === 'visible'
    && result.canvases === 1 && result.distinctSignatures >= 10 && result.remounts === 0;
  return result;
}

async function checkRevivesAfterLostResumeEntry() {
  window.__visibilityTrace = [];
  await window.__scrollBottom();
  await sleep(300);
  const remounts = watchCanvasRemounts();

  // 1. Send the orb off screen so the library pauses on its own terms.
  await window.__scrollTop();
  await sleep(500);

  // 2. Drop every further observer delivery, then bring the orb back: the library keeps the
  //    stale "not visible" bookkeeping and nothing it can observe will change its mind. The
  //    loop only ever starts from a delivered entry, so the orb sits on screen, frozen.
  window.__ioSuppressed = true;
  await window.__scrollBottom();
  await sleep(200);
  // Sample less than the watchdog's own quiet window (1.6s), so the still frames measured
  // here are the broken state and not the repair.
  const frozen = await sample(950, 150);
  const stillRun = longestStillRun(frozen);
  // Deliveries stay suppressed while waiting: a canvas that appears now can only come from
  // the watchdog, never from the library resuming on its own.
  const repair = stillRun >= 4 ? await waitForRemount(remounts) : { remounted: false, waitedMs: 0 };
  window.__ioSuppressed = false;
  const revived = repair.remounted ? await waitForAnimation(4000) : { animated: false, waitedMs: 0, distinct: 0 };

  return {
    name: 'a lost resume entry is repaired by the watchdog',
    visibilitySeen: visibilitySeen(),
    frozenDistinct: distinct(frozen),
    frozenStillRun: stillRun,
    repair,
    revived,
    remounts: remounts.count,
    pass: visibleSamples() >= 6 && stillRun >= 4 && repair.remounted && revived.animated,
  };
}

async function checkRevivesAfterDeadLoop() {
  window.__visibilityTrace = [];
  await window.__scrollBottom();
  await sleep(300);
  const remounts = watchCanvasRemounts();
  const before = await sample(600, 150);

  // A throwing draw leaves the loop flag set with no frame queued: cancel the queued frames
  // until the canvas stops changing.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    window.__killOrbFrames();
    // eslint-disable-next-line no-await-in-loop
    await sleep(120);
  }
  const frozen = await sample(950, 150);
  const stillRun = longestStillRun(frozen);
  const revived = stillRun >= 4 ? await waitForAnimation(4000) : { animated: false, waitedMs: 0, distinct: 0 };

  return {
    name: 'a dead loop is repaired by the watchdog',
    visibilitySeen: visibilitySeen(),
    distinctBefore: distinct(before),
    frozenDistinct: distinct(frozen),
    frozenStillRun: stillRun,
    revived,
    remounts: remounts.count,
    pass: visibleSamples() >= 6 && distinct(before) >= 3 && stillRun >= 4 && revived.animated && remounts.count >= 1,
  };
}

async function checkHiddenWindowIsLeftAlone() {
  window.__visibilityTrace = [];
  await window.__scrollBottom();
  await sleep(300);
  const remounts = watchCanvasRemounts();
  const fake = { value: 'hidden' };
  const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => fake.value });
  document.dispatchEvent(new Event('visibilitychange'));
  await sleep(1600);
  const whileHidden = remounts.count;
  fake.value = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await sleep(400);
  const afterReturn = await sample(900, 150);
  const result = {
    name: 'a hidden window is not remounted, and coming back restarts the orb',
    remountsWhileHidden: whileHidden,
    remountsAfterReturn: remounts.count - whileHidden,
    distinctAfterReturn: distinct(afterReturn),
  };
  remounts.stop();
  if (original) Object.defineProperty(document, 'visibilityState', original);
  else delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  result.pass = visibleSamples() >= 5 && result.remountsWhileHidden === 0
    && result.remountsAfterReturn >= 1 && result.distinctAfterReturn >= 5;
  return result;
}

async function checkReducedMotionStillFrame() {
  window.__visibilityTrace = [];
  await window.__scrollBottom();
  await sleep(300);
  const remounts = watchCanvasRemounts();
  const values = await sample(3000, 200);
  const result = {
    name: 'reduced motion holds one frame and is never rebuilt',
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    visibilitySeen: visibilitySeen(),
    distinctSignatures: distinct(values),
    remounts: remounts.count,
  };
  remounts.stop();
  result.pass = result.reduced === true
    && visibleSamples() >= 8 && result.distinctSignatures <= 2 && result.remounts === 0;
  return result;
}

async function checkMotionReturns() {
  window.__visibilityTrace = [];
  await window.__scrollBottom();
  await sleep(300);
  const values = await sample(1500, 150);
  return {
    name: 'the orb animates again once motion is wanted',
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    distinctSignatures: distinct(values),
    pass: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && visibleSamples() >= 5 && distinct(values) >= 5,
  };
}

// One check at a time, driven from the browser harness: an occluded automation window freezes
// rAF, and a check that runs through that window would report noise instead of the orb's own
// behaviour. Check 5 needs `Emulation.setEmulatedMedia`, so the caller sets the mode.
window.__orbCheck = {
  1: checkHealthyOrbIsNeverRemounted,
  2: checkRevivesAfterLostResumeEntry,
  3: checkRevivesAfterDeadLoop,
  4: checkHiddenWindowIsLeftAlone,
  5: checkReducedMotionStillFrame,
  6: checkMotionReturns,
};
window.__runOrbCheck = async (index) => {
  const check = window.__orbCheck[index];
  const started = performance.now();
  const result = await check();
  return {
    index,
    visibility: document.visibilityState,
    pageErrors: window.__pageErrors,
    elapsedMs: Math.round(performance.now() - started),
    result,
  };
};

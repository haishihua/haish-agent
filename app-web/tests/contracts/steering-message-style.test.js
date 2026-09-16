import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: the mid-run steering message (a `user_input` timeline item) keeps its
// place inside the interrupted assistant box, but it used to carry its own bubble
// surface — a brighter gradient, a 12px radius and a 13.5px body. Rendered under the
// user's own message it read as a quote chip instead of the instruction the user
// typed. The bubble now takes the user bubble declarations from the same rule (one
// declaration block, two selector lists) and reuses `.chat-bubble-text` plus the
// Markdown hard-break pipeline, so both messages render identically.
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const timelineNodes = readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');

const STEERING = '.chat-timeline-user-input-bubble';
const BASE_BUBBLE = '.message-shell .message-speech-body';
const USER_BUBBLE = '.chat-message-row.user .message-speech-body';

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat rule list: `selectors` holds one entry per comma-separated selector. */
function parseRules(source) {
  const cleaned = stripComments(source);
  const rules = [];
  let index = 0;
  while (index < cleaned.length) {
    const open = cleaned.indexOf('{', index);
    if (open < 0) break;
    const close = cleaned.indexOf('}', open);
    if (close < 0) break;
    const prelude = cleaned.slice(index, open).trim();
    rules.push({
      prelude,
      selectors: prelude.split(',').map((selector) => selector.trim()).filter(Boolean),
      body: cleaned.slice(open + 1, close),
    });
    index = close + 1;
  }
  return rules;
}

const rules = parseRules(chatStyles);
const steeringRules = rules.filter((rule) => rule.selectors.includes(STEERING));

const steeringNode = (() => {
  const start = timelineNodes.indexOf('export function ChatTimelineUserInputNode');
  const end = timelineNodes.indexOf('export function ChatAgentTimeline');
  assert.ok(start > 0 && end > start, 'ChatTimelineUserInputNode must stay between its neighbours');
  return timelineNodes.slice(start, end);
})();

test('the steering bubble shares the user bubble declarations', () => {
  const base = steeringRules.filter((rule) => rule.selectors.includes(BASE_BUBBLE));
  const tint = steeringRules.filter((rule) => rule.selectors.includes(USER_BUBBLE));
  assert.equal(base.length, 1, 'padding / border width / radius must come from the shared bubble rule');
  assert.equal(tint.length, 1, 'radius / border colour / background must come from the shared user rule');
  assert.match(base[0].body, /padding:\s*12px 14px/, 'sanity: the shared rule is the bubble surface');
  assert.match(tint[0].body, /background:\s*rgba\(40, 75, 134, 0\.3\)/, 'sanity: the shared rule is the user tint');
});

test('the steering bubble holds no second copy of the surface', () => {
  const own = rules.filter((rule) => rule.selectors.length === 1 && rule.selectors[0] === STEERING);
  assert.equal(own.length, 1, 'the steering bubble keeps exactly one rule of its own');
  assert.doesNotMatch(
    own[0].body,
    /padding|border|background|box-shadow/,
    'a local copy of the surface is exactly how this bubble drifted away from the user bubble',
  );
  assert.match(own[0].body, /max-width/, 'the own rule still sizes the nested bubble');
});

test('the steering body renders like the user message body', () => {
  assert.doesNotMatch(chatStyles, /chat-timeline-user-input-text/, 'the old 13.5px body class must be gone');
  assert.doesNotMatch(timelineNodes, /chat-timeline-user-input-text/);
  assert.match(
    steeringNode,
    /<div className="chat-bubble-text">\s*<Markdown source=\{text\} hardBreaks \/>/,
    'the body must reuse .chat-bubble-text and keep the typed line breaks',
  );
  assert.doesNotMatch(
    steeringNode,
    /(?:^|>)\s*(?:You|Queued instruction)\s*(?:<|$)/m,
    'the steering message carries no label the user message does not have',
  );
});

test('the steering message stays inside the interrupted assistant box', () => {
  assert.match(steeringNode, /className="chat-timeline-user-input"/, 'the nested row wrapper must stay');
  const appShell = readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(
    appShell,
    /Mid-run steering inputs \("user_input" timeline items\) stay inside the\s*\/\/ assistant trace/,
    'hoisting the correction into a standalone turn would be a different conversation layout',
  );
});

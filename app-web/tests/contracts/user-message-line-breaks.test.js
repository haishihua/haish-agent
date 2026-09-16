import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: CommonMark folds a single newline into a space, so a prompt the
// user typed on several lines (Shift+Enter) came back as one re-wrapped
// paragraph once it was sent. The user bubble has to render hard breaks; the
// assistant answer keeps plain CommonMark so streamed markdown is untouched.
const chatMessageRow = readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const markdown = readFileSync(new URL('../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');

test('user bubbles opt into hard line breaks', () => {
  assert.match(
    chatMessageRow,
    /<Markdown source=\{String\(bodyText\)\} hardBreaks=\{isUser\} \/>/,
    'the user bubble must keep the line structure the message was typed with',
  );
});

test('assistant answers keep the default soft-break rendering', () => {
  const finalAnswer = chatMessageRow.slice(
    chatMessageRow.indexOf('function FinalAnswerMarkdown'),
    chatMessageRow.indexOf('function ChatMessageRowComponent'),
  );
  assert.match(finalAnswer, /<Markdown source=\{text\} \/>/, 'the answer body must render without hardBreaks');
  assert.doesNotMatch(finalAnswer, /hardBreaks/);
});

test('Markdown wires the plugin only for hard-break callers', () => {
  assert.match(markdown, /import \{ remarkHardBreaks \} from '\.\.\/lib\/remark-hard-breaks\.js';/);
  assert.match(
    markdown,
    /hardBreaks \? \[remarkHardBreaks\] : undefined/,
    'the plugin list must stay opt-in per caller',
  );
  assert.match(markdown, /remarkPlugins=\{remarkPlugins\}/, 'Streamdown must receive the remark plugin list');
});

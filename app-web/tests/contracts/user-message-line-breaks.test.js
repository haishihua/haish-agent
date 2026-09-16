import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripInjectedSkillInstruction } from '../../src/features/chat/model/chat-text.js';

// Regression: CommonMark folds a single newline into a space, so a prompt the
// user typed on several lines (Shift+Enter) came back as one re-wrapped
// paragraph once it was sent. The user bubble has to render hard breaks; the
// assistant answer keeps plain CommonMark so streamed markdown is untouched.
const chatMessageRow = readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const markdown = readFileSync(new URL('../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
const appShell = readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');

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

test('an edited-and-resent message keeps its line structure in the user row', () => {
  // Edit-and-resend starts a new full attempt: AppShell builds its user row from
  // `task.displayText ?? task.title`, which is the persisted prompt for both a
  // normal send and a resend. Nothing in that path may fold the typed lines.
  assert.match(
    appShell,
    /role: 'user',\s*\n\s*text: stripInjectedSkillInstruction\(task\.displayText \?\? task\.title\),/,
    'resend rows must reuse the same user row text as normal sends',
  );
  const resentPrompt = '1. 第一项\n2. 共用\n3. 删干净吧\n先在/docs 落设计文档，然后再开始改';
  assert.equal(stripInjectedSkillInstruction(`  ${resentPrompt}\n`), resentPrompt,
    'the row text helper may trim the edges but never the inner line breaks');
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

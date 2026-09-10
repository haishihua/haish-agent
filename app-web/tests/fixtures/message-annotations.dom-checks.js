// Run automatically by message-annotations.html in a real browser (Selection/Range).
import { annotationText, captureAnnotationSelection, findAnnotationRange } from '../../src/features/chat/model/message-annotations.js';

export function runAnnotationDomChecks() {
  const document = globalThis.document;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0';
  const first = document.createElement('div');
  first.dataset.annotationSource = 'assistant-one';
  const lead = document.createTextNode('😀 Start ');
  const bold = document.createElement('strong');
  bold.textContent = 'bold text';
  const middle = document.createTextNode(' and ');
  const code = document.createElement('code');
  code.textContent = 'inline code';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  first.append(lead, bold, middle, code, copy);
  const second = document.createElement('div');
  second.dataset.annotationSource = 'assistant-two';
  second.textContent = 'Another answer';
  host.append(first, second);
  document.body.append(host);
  const passed = [];
  const check = (value, name) => { if (!value) throw Error(name); passed.push(name); };
  const range = document.createRange();
  const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range };
  try {
    range.setStart(bold.firstChild, 0);
    range.setEnd(code.firstChild, code.textContent.length);
    const captured = captureAnnotationSelection(host, selection);
    check(captured.annotation.text === 'bold text and inline code', 'cross-Markdown selection');
    check(captured.annotation.start === 9 && captured.annotation.end === 34, 'UTF-16 offsets');
    check(annotationText(first).text === '😀 Start bold text and inline code', 'exclude copy buttons');
    check(findAnnotationRange(host, captured.annotation).toString() === captured.annotation.text, 'restore original range');
    lead.data = 'New prefix. ' + lead.data;
    check(findAnnotationRange(host, captured.annotation).toString() === captured.annotation.text, 'relocate after prefix shifts');
    range.setEnd(second.firstChild, 5);
    check(captureAnnotationSelection(host, selection) === null, 'reject cross-message selection');
    first.removeAttribute('data-annotation-source');
    range.selectNodeContents(bold);
    check(captureAnnotationSelection(host, selection) === null, 'reject non-eligible source');
    return passed;
  } finally { host.remove(); }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const sections = read('../../src/features/settings/components/WorkflowNodeDetails.jsx');
const controls = read('../../src/features/settings/components/WorkflowFormControls.jsx');
const styles = read('../../src/features/settings/components/workflow-agent-details.css');

test('Workflow IO disclosures expose accessible state and keep editors mounted', () => {
  assert.match(sections, /type="button" className="workflow-section-toggle"/);
  assert.match(sections, /aria-expanded=\{isExpanded\} aria-controls=\{bodyId\}/);
  assert.match(sections, /id=\{bodyId\} className="workflow-section-body" hidden=\{!isExpanded\}>\{children\}/);
  assert.match(styles, /workflow-section-body\[hidden\] \{ display: none;/);
});

test('Inputs start open and adding an input expands them; generated Outputs start closed', () => {
  assert.match(controls, /const \[expanded, setExpanded\] = React\.useState\(true\)/);
  assert.match(controls, /onClick=\{\(\) => \{\s+setExpanded\(true\);\s+onChange\(/);
  assert.match(sections, /collapsible defaultExpanded=\{title !== 'Outputs'\}/);
  assert.match(controls, /WorkflowDetailFields key=\{node\.id\} title="Outputs"/);
});

test('Disclosure headers fill the row without nested highlight or trailing padding', () => {
  assert.match(styles, /workflow-collapsible-section > \.workflow-agent-section-head \{ padding: 0; gap: 0;[^}]+background: transparent;/);
  assert.match(styles, /workflow-section-toggle \{[^}]+border-radius: 0; background: transparent;/);
  assert.match(styles, /workflow-section-toggle:hover:not\(:active\) \{ background: transparent;/);
});

test('Disclosure feedback includes keyboard focus, gated hover, pressed and reduced motion', () => {
  assert.match(styles, /workflow-section-toggle:focus-visible[^}]+box-shadow: inset/);
  assert.match(styles, /workflow-section-toggle:active/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\) \{\s+\.workflow-agent-detail \.workflow-section-toggle:hover/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s+\.workflow-agent-detail \.workflow-section-toggle, \.workflow-section-chevron \{ transition: none;/);
});

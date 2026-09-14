// Run in a real browser (WebGL canvas + computed styles) against the production
// MetalActionEffect and the production .chat-send button.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import { MetalActionEffect } from '../../src/shared/ui/MotionEffects.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';
import './send-beam.css';

const DECORATIVE = '.metal-fx-canvas, .metal-fx-glow-svg, [data-metal-fx-reflection]';
let beamActive = true;
const root = createRoot(document.getElementById('root'));

function render() {
  flushSync(() => root.render(
    <main className="beam-fixture">
      <h1>Send beam regression</h1>
      <p>
        The chromatic ring is an in-progress signal, not decoration: it shows while the
        conversation has work in flight and disappears when it settles. The metal shell stays
        mounted either way so the button never changes shape or disc color.
      </p>
      <section className="beam-row" aria-label="Send buttons">
        <span className="beam-state">Task running</span>
        <MetalActionEffect active={beamActive}>
          <button type="button" className="chat-send" aria-label="Send">
            <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
          </button>
        </MetalActionEffect>
        <span className="beam-state">Idle conversation</span>
        <MetalActionEffect active={false}>
          <button type="button" className="chat-send" aria-label="Send">
            <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
          </button>
        </MetalActionEffect>
      </section>
      <pre id="checks" role="status">Running checks…</pre>
    </main>,
  ));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 260));
const shells = () => [...document.querySelectorAll('.beam-row .metal-fx-root')];
const runningShell = () => shells()[0];
const idleShell = () => shells()[1];
const layers = (shell) => [...shell.querySelectorAll(DECORATIVE)];
const opacity = (shell) => layers(shell).map((layer) => getComputedStyle(layer).opacity);
// Shader layers only exist once metal-fx has painted; on a reduced-motion host
// the active instance is frozen too, but its layers are still visible.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
}
// The glow layer carries its own design opacity (0.7), so "shown" means any
// painted alpha while "hidden" means exactly 0.
const allVisible = (values) => values.length > 0 && values.every((value) => Number(value) > 0);
const allHidden = (values) => values.every((value) => Number(value) === 0);

async function run() {
  render();
  await tick();
  await tick();

  check(shells().length === 2, 'One metal shell per send button');
  check(shells().every((shell) => shell.querySelector('.chat-send') && layers(shell).length > 0),
    'The shell and its shader canvas stay mounted in both states');
  check(runningShell().classList.contains('is-active') && idleShell().classList.contains('is-idle'),
    'Active and idle shells carry distinct state classes');

  check(allVisible(opacity(runningShell())), 'A running conversation keeps the metal ring visible');
  check(allHidden(opacity(idleShell())), 'An idle conversation hides every decorative layer');
  check(Number(getComputedStyle(idleShell()).opacity) === 1
    && getComputedStyle(idleShell()).visibility === 'visible',
    'Hiding the ring leaves the button itself fully opaque');

  check(idleShell().getAttribute('data-paused') === 'true',
    'Idle shell freezes the shader instead of leaving a stuck last frame');
  check(reducedMotion() || runningShell().getAttribute('data-paused') === null,
    'Running shell keeps animating unless the OS asks for reduced motion');

  const disc = (shell) => {
    const style = getComputedStyle(shell);
    const box = shell.querySelector('.chat-send').getBoundingClientRect();
    return { background: style.backgroundColor, radius: style.borderRadius, w: Math.round(box.width), h: Math.round(box.height) };
  };
  check(JSON.stringify(disc(runningShell())) === JSON.stringify(disc(idleShell())),
    'Idle and running buttons share the same disc color, radius and size');
  check(disc(idleShell()).w === 40 && disc(idleShell()).h === 40, 'Send button stays a 40px circle');

  beamActive = false;
  render();
  await tick();
  check(shells().length === 2 && allHidden(opacity(runningShell())),
    'Settling a run hides the ring without remounting the shell');

  beamActive = true;
  render();
  await tick();
  await tick();
  check(allVisible(opacity(runningShell())), 'Starting the next run brings the ring back');

  document.getElementById('checks').dataset.result = 'PASS';
  document.getElementById('checks').textContent = checks.join('\n');
}

run().catch((error) => {
  document.getElementById('checks').dataset.result = 'FAIL';
  document.getElementById('checks').textContent = [...checks, `FAIL ${error.message}`].join('\n');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORB_LIVENESS_SAMPLE_MS,
  ORB_LIVENESS_STUCK_SAMPLES,
  createOrbLiveness,
  sampleOrbLiveness,
} from '../../../src/features/chat/model/orb-liveness.js';

/** Feed a run of samples and report how many of them asked for a revive. */
function run(samples, state = createOrbLiveness()) {
  let revives = 0;
  let current = state;
  for (const sample of samples) {
    const result = sampleOrbLiveness(current, sample);
    current = result.state;
    if (result.revive) revives += 1;
  }
  return { revives, state: current };
}

const visible = (signature) => ({ onScreen: true, visible: true, signature });

test('an animating orb is never restarted', () => {
  // Every preset changes pixels faster than one sample window (measured: <150ms for all
  // nine modes), so a healthy orb always shows a new signature from sample to sample.
  const { revives } = run([1, 2, 3, 4, 5, 6, 7, 8].map(visible));
  assert.equal(revives, 0);
});

test('a canvas that stops changing while visible is restarted after the quiet window', () => {
  const { revives } = run([10, 11, 12, 12, 12, 12].map(visible));
  assert.equal(revives, 1);
});

test('the restart waits a full quiet window instead of reacting to one still frame', () => {
  const first = sampleOrbLiveness(createOrbLiveness(), visible(7));
  assert.equal(first.revive, false);
  const second = sampleOrbLiveness(first.state, visible(7));
  assert.equal(second.revive, false);
  assert.ok(ORB_LIVENESS_STUCK_SAMPLES * ORB_LIVENESS_SAMPLE_MS >= 1000,
    'the quiet window has to sit well above the sub-150ms frame cadence of every preset');
});

test('a hidden window never triggers a restart', () => {
  const samples = Array.from({ length: 6 }, () => ({ onScreen: true, visible: false, signature: 42 }));
  assert.equal(run(samples).revives, 0);
});

test('an off-screen orb is left alone (the library pauses it on purpose)', () => {
  const samples = Array.from({ length: 6 }, () => ({ onScreen: false, visible: true, signature: null }));
  assert.equal(run(samples).revives, 0);
});

test('an orb holding the reduced-motion still frame is left alone', () => {
  // Under prefers-reduced-motion the library draws one frame and never starts a loop, so an
  // unchanging canvas is the requested behaviour and must be reported as such (measured in
  // the live fixture: one frame in four seconds, with the watchdog rebuilding it twice).
  const samples = Array.from({ length: 6 }, () => ({
    onScreen: true, visible: true, reducedMotion: true, signature: 88,
  }));
  assert.equal(run(samples).revives, 0);
});

test('motion wanted again turns a still canvas back into a stuck one', () => {
  const { revives } = run([
    { onScreen: true, visible: true, reducedMotion: true, signature: 5 },
    { onScreen: true, visible: true, reducedMotion: true, signature: 5 },
    visible(5),
    visible(5),
    visible(5),
    visible(5),
  ]);
  assert.equal(revives, 1, 'the reduced-motion gap resets the counter instead of hiding a freeze');
});

test('an unreadable canvas is not treated as frozen', () => {
  const samples = Array.from({ length: 6 }, () => visible(null));
  assert.equal(run(samples).revives, 0);
});

test('scrolling away and back measures from scratch', () => {
  const { revives } = run([
    visible(3),
    visible(3),
    { onScreen: false, visible: true, signature: null },
    visible(3),
    visible(3),
  ]);
  assert.equal(revives, 0, 'the off-screen gap must reset the identical-frame counter');
});

test('a revived orb that animates again is not restarted twice', () => {
  const { revives } = run([5, 5, 5, 5, 9, 9, 9, 9].map(visible));
  assert.equal(revives, 2, 'two separate still windows, one restart each');
});

test('the state machine never mutates the state it is given', () => {
  const state = createOrbLiveness();
  const frozen = { signature: 4, stillFrames: 0 };
  sampleOrbLiveness(frozen, visible(4));
  assert.deepEqual(frozen, { signature: 4, stillFrames: 0 });
  assert.deepEqual(state, { signature: null, stillFrames: 0 });
});

/**
 * Liveness sampling for the chat activity orb (the `thinking-orbs` canvas).
 *
 * The library drives its canvas from a requestAnimationFrame loop that it stops in two
 * places: when the canvas is not intersecting (its own IntersectionObserver) and when the
 * page is hidden (`visibilitychange`). It only starts again when the observer bookkeeping
 * it kept agrees that the canvas is visible, so a stale entry - a conversation switch that
 * re-lays out the message list right as the window goes to the background is the usual way -
 * leaves the loop stopped while the orb sits on screen, and nothing the app renders can
 * restart it. A draw that throws does the same thing permanently, because the exception
 * escapes the rAF callback and the next frame is never scheduled.
 *
 * Sampling every mode the app can show (12s at 150ms per sample, all nine presets) never
 * saw two identical frames in a row, so four samples in a row with the same pixels - 1.6s
 * without a single new frame, ten times the slowest healthy gap - mean the loop is gone.
 *
 * Some still frames are intended, and each of them has to reach this module as "not
 * judgeable": an off-screen canvas, a hidden window, and the reduced-motion preference,
 * where the library draws the marking once and never starts a loop (measured: one frame for
 * four seconds). Judging those as frozen would rebuild an orb that is doing exactly what the
 * user asked for.
 */
export const ORB_LIVENESS_SAMPLE_MS = 400;
export const ORB_LIVENESS_STUCK_SAMPLES = 4;

/** Fresh sampling state for one orb host. */
export function createOrbLiveness() {
  return { signature: null, stillFrames: 0 };
}

/**
 * Feed one sample of the orb canvas and decide whether the animation loop needs a restart.
 *
 * @param {{signature: number|null, stillFrames: number}} state
 * @param {{onScreen?: boolean, visible?: boolean, reducedMotion?: boolean, signature?: number|null}} sample
 * @returns {{state: object, revive: boolean}}
 */
export function sampleOrbLiveness(state, sample) {
  const onScreen = sample?.onScreen === true;
  const visible = sample?.visible !== false;
  const stillFrameWanted = sample?.reducedMotion === true;
  const signature = sample?.signature ?? null;
  if (!onScreen || !visible || stillFrameWanted || signature === null) {
    // Nothing to judge here. Start measuring again from scratch, so a gap (scrolled away,
    // window in the background, reduced motion turned on) is never read as a freeze.
    return { state: { signature: null, stillFrames: 0 }, revive: false };
  }
  if (signature !== state.signature) {
    // New pixels: the loop is alive. This frame is the first of a new run, so a still window
    // has to be counted from here.
    return { state: { signature, stillFrames: 1 }, revive: false };
  }
  const stillFrames = state.stillFrames + 1;
  if (stillFrames < ORB_LIVENESS_STUCK_SAMPLES) {
    return { state: { signature, stillFrames }, revive: false };
  }
  // Same pixels for a whole quiet window while the orb is on screen and motion is wanted:
  // the loop is gone, not slow.
  return { state: { signature: null, stillFrames: 0 }, revive: true };
}

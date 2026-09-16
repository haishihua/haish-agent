import React from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { prefersReducedMotion } from '../../../shared/lib/reduced-motion.js';
import {
  ORB_LIVENESS_SAMPLE_MS,
  createOrbLiveness,
  sampleOrbLiveness,
} from '../model/orb-liveness.js';

/**
 * The activity orb, guarded against the ways `thinking-orbs` can stop animating for good.
 *
 * Conversation switches re-lay out the message list while the orb is mounted, and a window
 * that is in the background cannot hand the library a fresh intersection entry, so its
 * "resume when visible" branch can end up seeing stale state and never restarting the loop.
 * The app cannot reach into the library, but it can rebuild the orb: remounting is the one
 * action that always starts a clean loop, an observer and a first frame.
 *
 * Two triggers, both cheap:
 *  - the watchdog from ./model/orb-liveness.js, which revives a canvas that stayed
 *    bit-identical while it was on screen and the page was visible;
 *  - `visibilitychange`, because a window coming back from being hidden is exactly when the
 *    library's own resume check is most likely to be stale.
 *
 * Under the reduced-motion preference the library draws a single frame and never starts a
 * loop, so both triggers stand down: a still orb is the requested behaviour, not a freeze.
 */
function hashCanvasPixels(canvas) {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return null;
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 16) {
      hash = (hash ^ (data[index] + data[index + 3] * 31)) * 16777619;
    }
    return hash >>> 0;
  } catch {
    // A read failure is not evidence of a stopped loop; skip this sample.
    return null;
  }
}

function isOnScreen(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
}

export function ActivityOrb(props) {
  const hostRef = React.useRef(null);
  const [generation, setGeneration] = React.useState(0);

  React.useEffect(() => {
    let liveness = createOrbLiveness();
    const timer = window.setInterval(() => {
      const canvas = hostRef.current?.querySelector('canvas');
      if (!canvas) return;
      const visible = document.visibilityState !== 'hidden';
      // Read live: the setting can change while the orb is mounted, and the library follows it.
      const reducedMotion = prefersReducedMotion();
      const onScreen = isOnScreen(canvas);
      // Only read pixels for a sample that can judge the loop: a hidden window does not
      // repaint, and a still frame is what the user asked for under reduced motion.
      const signature = onScreen && visible && !reducedMotion ? hashCanvasPixels(canvas) : null;
      const result = sampleOrbLiveness(liveness, { onScreen, visible, reducedMotion, signature });
      liveness = result.state;
      if (result.revive) setGeneration((value) => value + 1);
    }, ORB_LIVENESS_SAMPLE_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || prefersReducedMotion()) return;
      setGeneration((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    // `display: contents` keeps the canvas a direct flex item of .chat-timeline-activity.
    <span ref={hostRef} style={{ display: 'contents' }}>
      <ThinkingOrb key={generation} {...props} />
    </span>
  );
}

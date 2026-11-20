import { REDUCED_MOTION_QUERY } from '../../../shared/lib/reduced-motion.js';
import { play, snapshot } from './dissolve-atlas.js';

// Toast drawing follows rs-4/dissolve web/cp/core.js (MIT, adjacent license).
// Only text wrapping and four Haish tones extend the upstream card rendering.
const DOT = { success: '#34C759', error: '#FF3B30', warn: '#FFCC00', info: '#8E8E93' };
export function animateToastParticles(element, leaving) {
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return () => {};
  const r = element.getBoundingClientRect();
  const message = element.querySelector('.app-toast-message');
  if (!r.width || !r.height || !message) return () => {};
  const tone = Object.keys(DOT).find(key => element.classList.contains(`app-toast-${key}`)) || 'info';
  const source = snapshot(r.width, r.height, ctx => {
    ctx.fillStyle = '#1C1C1E';
    ctx.beginPath(); ctx.roundRect(0, 0, r.width, r.height, 18); ctx.fill();
    ctx.fillStyle = DOT[tone]; ctx.beginPath(); ctx.arc(18, r.height / 2, 4, 0, Math.PI * 2); ctx.fill();
    for (const node of message.children) {
      const computed = getComputedStyle(node);
      const range = document.createRange();
      const textNode = node.firstChild;
      if (!textNode) continue;
      ctx.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      ctx.fillStyle = computed.color;
      ctx.textBaseline = 'alphabetic';
      // Read actual browser line boxes, so Canvas and DOM wrap identically.
      for (let index = 0; index < textNode.length; index++) {
        range.setStart(textNode, index); range.setEnd(textNode, index + 1);
        const rect = range.getBoundingClientRect();
        ctx.fillText(textNode.textContent[index], rect.x - r.x, rect.y - r.y + (parseFloat(computed.fontSize) - ctx.measureText('Hg').fontBoundingBoxAscent - ctx.measureText('Hg').fontBoundingBoxDescent) / 2 + ctx.measureText('Hg').fontBoundingBoxAscent);
      }
    }
  });
  // Keep the exact same raster for the settled card. Switching from Canvas
  // glyphs back to browser text changes kerning/baselines and visibly flashes.
  source.className = 'app-toast-settled-snapshot';
  source.setAttribute('aria-hidden', 'true');
  Object.assign(source.style, { position: 'absolute', inset: '0', width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none', opacity: '0' });
  element.appendChild(source);
  element.classList.add('has-toast-snapshot');
  element.style.opacity = '0';
  const handle = play({ source, x: r.x, y: r.y, w: r.width, h: r.height, preset: leaving ? 'dust' : 'gather', direction: leaving ? 'out' : 'in', duration: leaving ? 1100 : 900, fixed: true });
  let cancelled = false;
  handle.done.then(() => {
    if (!cancelled && !leaving) { source.style.opacity = '1'; element.style.opacity = '1'; }
  });
  return () => {
    cancelled = true; handle.cancel(); source.remove();
    element.classList.remove('has-toast-snapshot'); element.style.opacity = '';
  };
}

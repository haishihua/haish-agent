import React from 'react';
import { createRoot } from 'react-dom/client';
import { PenguinCards } from '../../src/features/chat/components/PenguinCards.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

createRoot(document.getElementById('root')).render(<AppTooltipProvider><PenguinCards /></AppTooltipProvider>);
const results = [];
const check = (ok, label) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
const tick = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const image = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};
const pixels = (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
};
async function run() {
  await tick(400);
  for (const name of ['hug', 'relax', 'sleepy']) {
    for (const layer of ['card', 'plate', 'smooth']) {
      const path = `/assets/ui/empty-state/penguin-${name}-${layer}`;
      const [png, webp] = await Promise.all([image(`${path}.png`), image(`${path}.webp`)]);
      const a = pixels(png);
      const b = pixels(webp);
      check(png.naturalWidth === webp.naturalWidth && png.naturalHeight === webp.naturalHeight, `${name} ${layer}: original dimensions`);
      check(a.length === b.length && a.every((value, index) => value === b[index]), `${name} ${layer}: Chromium RGBA pixels identical`);
    }
  }
  check(document.querySelectorAll('.chat-empty-card').length === 3, 'Three production cards render');
  check([...document.querySelectorAll('.chat-empty-card img')].every(img => img.complete && img.naturalWidth > 0), 'All original card and paper layers load');
  for (const card of document.querySelectorAll('.chat-empty-card')) {
    card.click();
    await tick(450);
    check(card.classList.contains('is-greeting'), `${card.getAttribute('aria-label')}: activates`);
    const sprite = card.querySelector('image');
    check(sprite.getAttribute('href').includes('.webp') && sprite.getAttribute('filter').startsWith('url('), 'SVG sprite retains lossless texture and chroma filter');
    card.click();
    await tick(50);
    check(card.querySelector('svg').getAnimations().length > 0, 'Click gesture still animates');
  }
  document.querySelector('.chat-empty-illustration').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick(300);
  check(!document.querySelector('.chat-empty-card.is-greeting'), 'Escape resets cards');
  check(window.__artworkErrors.length === 0, 'No page errors');
}
run().catch(error => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ImageGenerateToolDetail } from '../../src/features/chat/components/ImageGenerateToolDetail.jsx';
import { ImagePreviewOverlay } from '../../src/shared/ui/ImagePreviewOverlay.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

function App() {
  const [preview, setPreview] = React.useState(null);
  const [running, setRunning] = React.useState(true);
  return <AppTooltipProvider><div id="clipped-parent" style={{ transform: 'translateX(0)', width: 480, height: 300, overflow: 'hidden' }}>
    <button type="button" onClick={() => setRunning(false)}>Finish generation</button>
    <section data-case="historical"><ImageGenerateToolDetail conversationId="c1" view={{ isRunning: false, generatedImagePath: '/wide.png', task: 'wide' }} onPreviewImage={setPreview} /></section>
    <section data-case="portrait"><ImageGenerateToolDetail conversationId="c1" view={{ isRunning: false, generatedImagePath: '/portrait.png', task: 'portrait' }} onPreviewImage={setPreview} /></section>
    <section data-case="live"><ImageGenerateToolDetail conversationId="c1" view={{ isRunning: running, generatedImagePath: running ? '' : '/live.png', task: 'live' }} onPreviewImage={setPreview} /></section>
    {preview && <ImagePreviewOverlay image={preview} onClose={() => setPreview(null)} />}
  </div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<App />);

// Run after images load and after clicking Finish generation. All measurements
// are against production components, including the img-fx reveal wrapper.
window.assertImageDisplay = () => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const near = (a, b) => Math.abs(a - b) < 1;
  const sameRatio = (a, b) => Math.abs(a - b) < 0.01;
  for (const name of ['historical', 'portrait', 'live']) {
    const section = document.querySelector(`[data-case="${name}"]`);
    const image = section.querySelector('img');
    check(image?.naturalWidth > 0, `${name}: image not loaded`);
    const rect = image.getBoundingClientRect();
    check(sameRatio(rect.width / rect.height, image.naturalWidth / image.naturalHeight), `${name}: image ratio`);
    check(rect.width <= 420 && rect.height <= 420, `${name}: image bounds`);
    const frame = section.querySelector('.aui-imagegen-frame');
    if (frame) {
      const box = frame.getBoundingClientRect();
      check(near(box.width, rect.width) && near(box.height, rect.height), `${name}: reveal frame ratio`);
    }
  }
  const backdrop = document.querySelector('.image-preview-backdrop');
  const stage = document.querySelector('.image-preview-stage');
  const image = stage?.querySelector('img');
  check(backdrop?.parentElement === document.body, 'preview must escape clipped ancestor');
  check(image && getComputedStyle(image).visibility === 'visible', 'preview not ready');
  const bounds = stage.getBoundingClientRect();
  const rect = image.getBoundingClientRect();
  check(rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, 'preview image clipped');
  check(sameRatio(rect.width / rect.height, image.naturalWidth / image.naturalHeight), 'preview image ratio');
  return 'PASS';
};

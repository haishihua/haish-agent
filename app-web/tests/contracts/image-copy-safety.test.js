import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(new URL('../../src/shared/ui/ImagePreviewOverlay.jsx', import.meta.url), 'utf8');
const rowSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');

test('image copy avoids a full-size canvas and enforces byte and pixel limits', () => {
  assert.doesNotMatch(overlaySource, /createImageBitmap|toDataURL\('image\/png'\)/);
  assert.doesNotMatch(rowSource, /createImageBitmap|toDataURL\('image\/png'\)/);
  assert.match(overlaySource, /blob\.size > IMAGE_COPY_MAX_BYTES/);
  assert.match(overlaySource, /width \* height > IMAGE_COPY_MAX_PIXELS/);
  assert.match(mainSource, /dataUrl\.length > CLIPBOARD_IMAGE_MAX_DATA_URL_LENGTH/);
  assert.match(mainSource, /width \* height > CLIPBOARD_IMAGE_MAX_PIXELS/);
});

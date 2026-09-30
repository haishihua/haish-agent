import { app, nativeImage } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pass the packaged Resources/app directory to verify a built application too.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.resolve(process.argv[2] || root);
const packaged = Boolean(process.argv[2]);
app.whenReady().then(() => {
  try {
    const original = nativeImage.createFromPath(path.join(root, 'build/icon.png'));
    const logoPath = path.join(appRoot, 'app-web', packaged ? 'dist' : '.', 'assets/ui/penguin_logo_user.png');
    assert.ok(fs.existsSync(logoPath), 'Shared Dock logo must exist');
    const shared = nativeImage.createFromPath(logoPath);
    assert.equal(shared.isEmpty(), false);
    assert.deepEqual(shared.getSize(), original.getSize());
    assert.ok(shared.toBitmap().equals(original.toBitmap()), 'Shared Dock pixels must match the original');
    if (packaged) assert.equal(fs.existsSync(path.join(appRoot, 'build/icon.png')), false, 'No duplicate Dock PNG');
    console.log(`PASS: ${packaged ? 'packaged' : 'development'} shared Dock logo decodes with identical pixels`);
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
});

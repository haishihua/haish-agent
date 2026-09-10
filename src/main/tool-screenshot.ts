import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;

/** Only immutable browser PNG artifacts from this runtime and task are readable. */
export async function readToolScreenshot(appHome: string, imagePath: string, taskId: string): Promise<string> {
  if (typeof imagePath !== 'string' || typeof taskId !== 'string' || !taskId || !path.isAbsolute(imagePath)) {
    throw new Error('Invalid screenshot reference');
  }
  const safeTaskId = taskId.replace(/[^\p{L}\p{N}_.-]/gu, '_').replace(/^[._]+|[._]+$/g, '').slice(0, 128) || 'unknown';
  const root = await fs.realpath(path.join(appHome, 'cache', 'workspaces'));
  const target = await fs.realpath(imagePath);
  const relative = path.relative(root, target).split(path.sep);
  if (relative.length !== 6 || !/^[a-f0-9]{20}$/.test(relative[0]) || relative[1] !== 'tasks'
    || relative[2] !== safeTaskId || relative[3] !== 'artifacts' || relative[4] !== 'browser'
    || !/^screenshot-[A-Za-z0-9_-]+\.png$/.test(relative[5])) {
    throw new Error('Screenshot is outside the task artifact directory');
  }
  const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 24 || stat.size > MAX_BYTES) throw new Error('Invalid screenshot size');
    const bytes = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== bytes.length || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Screenshot must be a PNG');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('Screenshot dimensions exceed limit');
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } finally {
    await file.close();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createChatImageCache } from '../../../src/shared/lib/chat-image-cache.js';

const ARTIFACT = '/runtime/cache/workspaces/w/tasks/task1/artifacts/images/gen.png';
const preview = (path, conversation = 'c1', origin = '') => `${origin}/api/conversations/${conversation}/messages/images/preview?image_path=${encodeURIComponent(path)}`;
const decoded = (src, width = 320, height = 180) => ({ src, currentSrc: src, complete: true, naturalWidth: width, naturalHeight: height });
const adopted = (path, conversation = 'c1') => `/runtime/state/workspaces/w/conversations/${conversation}/images/${createHash('sha1').update(path).digest('hex').slice(0, 16)}-${path.split('/').at(-1).slice(0, 120)}`;

test('decoded previews are reused by exact path, including a successful retry', async () => {
    const cache = createChatImageCache();
    const url = preview(ARTIFACT);
    const image = decoded(`${url}&haish_retry=1`);
    await cache.remember(url, image);
    assert.equal(cache.get(url).image, image);
    assert.equal(cache.get(url).src, image.src);
});

test('the durable alias is verified by the full source path hash within one conversation', async () => {
    const cache = createChatImageCache();
    const image = decoded(preview(ARTIFACT));
    await cache.remember(preview(ARTIFACT), image);
    assert.equal(cache.get(preview(adopted(ARTIFACT))).image, image);
    // 同名但不同任务、不同会话/运行时都不能误命中，也不猜外来会话的路径。
    assert.equal(cache.get(preview(adopted(ARTIFACT.replace('task1', 'task2')))), null);
    assert.equal(cache.get(preview(adopted(ARTIFACT, 'c2'), 'c2')), null);
    assert.equal(cache.get(preview(adopted(ARTIFACT, 'c2'), 'c1')), null);
    assert.equal(cache.get(preview(ARTIFACT, 'c2')), null);
    assert.equal(cache.get(preview(adopted(ARTIFACT), 'c1', 'http://other-runtime')), null);
});

test('failures, unrelated URLs and oversize images are never marked loaded', async () => {
    const cache = createChatImageCache({ maxPixels: 100 });
    await cache.remember(preview(ARTIFACT), decoded(preview(ARTIFACT), 0, 0));
    await cache.remember(preview(ARTIFACT), { ...decoded(preview(ARTIFACT), 5, 5), complete: false });
    await cache.remember(preview(ARTIFACT), decoded(preview(ARTIFACT), 20, 20));
    assert.equal(cache.get(preview(ARTIFACT)), null);
    assert.equal(await cache.remember('https://example.com/a.png', decoded('https://example.com/a.png')), null);
});

test('late alias publication notifies mounted answers, and failed reuse removes stale cache', async () => {
    const cache = createChatImageCache();
    const states = [];
    const unsubscribe = cache.subscribe(() => states.push(Boolean(cache.get(preview(adopted(ARTIFACT))))));
    await cache.remember(preview(ARTIFACT), decoded(preview(ARTIFACT)));
    assert.deepEqual(states, [false, true]);
    cache.forget(preview(adopted(ARTIFACT)));
    assert.equal(cache.get(preview(ARTIFACT)), null);
    assert.equal(states.at(-1), false);
    unsubscribe();
});

test('decoded cache has entry and pixel budgets and evicts the least recently used', async () => {
    const cache = createChatImageCache({ maxEntries: 2, maxPixels: 200 });
    for (const path of ['/tmp/a.png', '/tmp/b.png']) await cache.remember(preview(path), decoded(preview(path), 10, 10));
    cache.get(preview('/tmp/a.png'));
    await cache.remember(preview('/tmp/c.png'), decoded(preview('/tmp/c.png'), 10, 10));
    assert.equal(cache.get(preview('/tmp/b.png')), null);
    assert.ok(cache.get(preview('/tmp/a.png')));
    assert.ok(cache.get(preview('/tmp/c.png')));
});

import test from 'node:test';
import assert from 'node:assert/strict';

for (const mode of ['getter', 'quota']) {
  test(`avatar memory snapshot survives ${mode} storage failures`, async t => {
    const previous = globalThis.window;
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    globalThis.window = mode === 'getter'
      ? Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } })
      : { localStorage: storage };
    t.after(() => { globalThis.window = previous; });
    const avatars = await import(`../../../src/shared/lib/agent-avatars.js?failure=${mode}`);
    let calls = 0;
    const unsubscribe = avatars.subscribeAgentAvatars(() => { calls += 1; });
    const saved = avatars.saveAgentAvatar('agent-a', 'penguin-03');
    assert.equal(avatars.getAgentAvatarMap(), saved);
    assert.equal(avatars.getAgentAvatarMap(), saved);
    assert.equal(avatars.agentAvatarIdFor('agent-a'), 'penguin-03');
    avatars.saveAgentAvatar('agent-b', 'penguin-04');
    assert.equal(avatars.agentAvatarIdFor('agent-a'), 'penguin-03');
    assert.equal(avatars.agentAvatarIdFor('agent-b'), 'penguin-04');
    assert.equal(calls, 2);
    unsubscribe();
  });
}

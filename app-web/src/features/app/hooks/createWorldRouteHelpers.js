// @haish-esm
// Extracted from AppShell.jsx (Phase C3). Behavior-preserving factory.
export function createWorldRouteHelpers(ctx) {
  const {
    MAP_H,
    MAP_W,
    npcStatesRef,
    orientToward,
    setBursts,
    setNpcStates,
    sleep,
  } = ctx;

  function pushBurst(pos, color) {
    const id = Math.random().toString(36).slice(2);
    const x = pos.x * MAP_W;
    const y = pos.y * MAP_H - 32;
    setBursts(B => [...B, { id, x, y, color }]);
    setTimeout(() => setBursts(B => B.filter(b => b.id !== id)), 1400);
  }

  function updateNpc(actor, patchOrFn) {
    setNpcStates(state => {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(state[actor]) : patchOrFn;
      const next = { ...state, [actor]: { ...state[actor], ...patch } };
      npcStatesRef.current = next;
      return next;
    });
  }

  function dirFromTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'side' : 'side-left';
    return dy > 0 ? 'front' : 'back';
  }

  function walkDirFor(actor, from, to, meta = {}) {
    const dx = to.x - from.x;
    if (meta.preferSideWalk) {
      return dx >= 0 ? 'side' : 'side-left';
    }
    return dirFromTo(from, to);
  }

  function getProviderToToolManagerRoute(actor) {
    if (actor === 'okabe' || actor === 'kurisu') return 'planningToLelouch';
    return null;
  }

  function getToolManagerToProviderRoute(actor) {
    if (actor === 'okabe' || actor === 'kurisu') return 'lelouchToPlanning';
    return null;
  }

  function getExecutorReportRoute(actor) {
    if (actor === 'levi') return 'leviToLelouch';
    if (actor === 'itachi') return 'itachiToLelouch';
    if (actor === 'mikey') return 'mikeyToLelouch';
    return null;
  }

  function getActorReturnMeta(actor) {
    return actor === 'itachi' ? { preferSideWalk: true } : {};
  }

  async function pauseForHandoff(actor, target, delay = 420) {
    orientToward(actor, target);
    orientToward(target, actor);
    await sleep(delay);
  }

  function getProviderToolRequestAction(actor) {
    if (actor === 'okabe') return { kind: 'mcp', label: 'DELEGATE' };
    return { kind: 'deliver', label: 'DELEGATE' };
  }

  return {
    pushBurst,
    updateNpc,
    dirFromTo,
    walkDirFor,
    getProviderToToolManagerRoute,
    getToolManagerToProviderRoute,
    getExecutorReportRoute,
    getActorReturnMeta,
    pauseForHandoff,
    getProviderToolRequestAction,
  };
}

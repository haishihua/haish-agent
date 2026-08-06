// @haish-esm
// Extracted from AppShell.jsx (Phase C). Behavior-preserving factory.
export function createWorldCalibrationHandlers(ctx) {
  const {
    MEET_POINTS,
    NAV_POINTS,
    ROUTES,
    STATIONS,
    clamp01,
    dirFromTo,
    npcStatesRef,
    roundCoord,
    setMeetDrafts,
    setNavDrafts,
    setNpcStates,
    setStationDrafts,
    stageRef,
    updateNpc,
  } = ctx;

  function resolvePoint(ref) {
    if (!ref) return null;
    if (typeof ref === 'string') {
      return STATIONS[ref] || NAV_POINTS?.[ref] || MEET_POINTS?.[ref] || null;
    }
    return ref;
  }

  function resolvePathSpec(spec) {
    if (!spec) return [];
    if (Array.isArray(spec)) return spec.flatMap((item) => resolvePathSpec(item));
    if (typeof spec === 'string' && ROUTES?.[spec]) {
      return ROUTES[spec].flatMap((item) => resolvePathSpec(item));
    }
    const point = resolvePoint(spec);
    return point ? [point] : [];
  }

  function orientToward(actor, target) {
    const actorPos = npcStatesRef.current[actor]?.pos;
    const targetPos = typeof target === 'string' && npcStatesRef.current[target]
      ? npcStatesRef.current[target].pos
      : resolvePoint(target);
    if (!actorPos || !targetPos) return;
    updateNpc(actor, { dir: dirFromTo(actorPos, targetPos) });
  }

  function clearAllPoseDebug() {
    setNpcStates((state) => {
      const next = {};
      for (const id of Object.keys(state)) next[id] = { ...state[id], poseDebug: null };
      npcStatesRef.current = next;
      return next;
    });
  }

  function getSourceMapForTarget(target) {
    if (target === 'nav') return NAV_POINTS;
    if (target === 'meet') return MEET_POINTS;
    return STATIONS;
  }

  function resolvePointTarget(id) {
    if (NAV_POINTS[id]) return 'nav';
    if (MEET_POINTS[id]) return 'meet';
    if (STATIONS[id]) return 'stations';
    return null;
  }

  function setPointPosition(target, id, pos) {
    if (target === 'routes') {
      const routeTarget = resolvePointTarget(id);
      if (!routeTarget) return;
      setPointPosition(routeTarget, id, pos);
      return;
    }
    const source = getSourceMapForTarget(target);
    const current = source[id];
    if (!current) return;
    const nextPoint = { ...current, x: roundCoord(clamp01(pos.x)), y: roundCoord(clamp01(pos.y)) };
    source[id] = nextPoint;
    if (target === 'stations') {
      setStationDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
      updateNpc(id, (npc) => ({ ...npc, pos: { x: nextPoint.x, y: nextPoint.y }, walking: false, action: null, bubble: null, busy: false, thinking: false }));
    } else if (target === 'nav') {
      setNavDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
    } else {
      setMeetDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
    }
  }

  function stagePointFromClient(clientX, clientY) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  }

  return {
    resolvePathSpec,
    orientToward,
    clearAllPoseDebug,
    setPointPosition,
    stagePointFromClient,
  };
}

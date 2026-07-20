// @haish-esm
// Extracted from AppShell.jsx (Phase C). Behavior-preserving factory.
export function createWorldCalibrationHandlers(ctx) {
  const {
    CALIBRATION_IDS,
    CHAR_DEFS,
    MAP_H,
    MAP_W,
    MEET_POINTS,
    MEET_POINT_IDS,
    NAV_POINTS,
    POSE_DEBUG_DEFAULTS,
    POSE_DEBUG_OPTIONS,
    POSE_MAPPING_FIELDS,
    ROUTES,
    ROUTE_EDITOR_DEFS,
    STATIONS,
    busy,
    clamp01,
    clonePointMap,
    dirFromTo,
    dragStateRef,
    meetDrafts,
    navDrafts,
    npcStatesRef,
    roundCoord,
    selectedRouteId,
    setCalibrationTarget,
    setCopiedCoords,
    setMeetDrafts,
    setNavDrafts,
    setNpcStates,
    setSelectedMarkerId,
    setStationDrafts,
    stageRef,
    stationDrafts,
    updateNpc,
    worldCalibrationActive,
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

  function syncNpcPositions(stations) {
    setNpcStates((state) => {
      const next = { ...state };
      for (const id of Object.keys(STATIONS)) {
        const station = stations[id];
        next[id] = {
          ...state[id],
          pos: { x: station.x, y: station.y },
          walking: false,
          action: null,
          bubble: null,
          busy: false,
          thinking: false,
        };
      }
      npcStatesRef.current = next;
      return next;
    });
  }

  function clearAllPoseDebug() {
    setNpcStates((state) => {
      const next = {};
      for (const id of Object.keys(state)) next[id] = { ...state[id], poseDebug: null };
      npcStatesRef.current = next;
      return next;
    });
  }

  function setPoseDebug(id, patch) {
    updateNpc(id, (npc) => ({
      ...npc,
      poseDebug: {
        ...(npc.poseDebug || POSE_DEBUG_DEFAULTS),
        ...patch,
      },
    }));
  }

  function getPoseDebugForMapping(mappingKey) {
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!field) return { ...POSE_DEBUG_DEFAULTS };
    if (field.type === 'idle') {
      return { pose: 'idle', dir: field.dir, movement: 'idle' };
    }
    if (field.type === 'walk') {
      return { pose: 'idle', dir: field.dir, movement: 'walking' };
    }
    return { pose: field.key, dir: 'front', movement: 'idle' };
  }

  function syncPosePreview(id, mappingKey) {
    setPoseDebug(id, getPoseDebugForMapping(mappingKey));
  }

  function getCharPoseConfig(id) {
    const def = CHAR_DEFS[id];
    if (!def) return null;
    const base = def.poseConfig || {
      idle: { ...def.idle },
      walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
      poses: { ...def.poses },
    };
    if (!def.poseConfig) def.poseConfig = base;
    return def.poseConfig;
  }

  function getPoseMappingValue(id, mappingKey) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!def || !config || !field) return null;
    if (field.type === 'idle') return config.idle[field.dir];
    if (field.type === 'walk') return config.walk[field.dir]?.[0] ?? def.idle[field.dir] ?? def.idle.front;
    return config.poses[field.key];
  }

  function applyPoseMapping(id, mappingKey, frame) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!def || !config || !field || frame == null) return;
    if (field.type === 'idle') {
      config.idle[field.dir] = frame;
      if (!config.walk[field.dir]?.length) config.walk[field.dir] = [frame];
    } else if (field.type === 'walk') {
      const sourceFrames = def.walk[field.dir]?.length ? [...def.walk[field.dir]] : [...(config.walk[field.dir] || [])];
      if (!sourceFrames.length) sourceFrames.push(frame);
      sourceFrames[0] = frame;
      config.walk[field.dir] = sourceFrames;
    } else {
      config.poses[field.key] = frame;
    }
    updateNpc(id, (npc) => ({ ...npc }));
  }

  function getPoseFrameOptions(id) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    if (!def || !config) return [];
    const seen = new Set();
    const options = [];
    const pushOption = (frame, label, group, sourceKey) => {
      if (frame == null || seen.has(sourceKey)) return;
      seen.add(sourceKey);
      options.push({ frame, label, group, sourceKey });
    };
    pushOption(config.idle.front, 'Idle Front', 'idle', 'idle_front');
    pushOption(config.idle.side, 'Idle Side', 'idle', 'idle_side');
    pushOption(config.idle.back, 'Idle Back', 'idle', 'idle_back');
    pushOption(config.walk.front?.[0], 'Walk Front', 'walk', 'walk_front');
    pushOption(config.walk.side?.[0], 'Walk Side', 'walk', 'walk_side');
    pushOption(config.walk.back?.[0], 'Walk Back', 'walk', 'walk_back');
    for (const option of POSE_DEBUG_OPTIONS) {
      pushOption(config.poses[option.key], option.label, 'pose', `pose_${option.key}`);
    }
    return options;
  }

  function resetPoseMapping(id) {
    const def = CHAR_DEFS[id];
    if (!def) return;
    def.poseConfig = {
      idle: { ...def.idle },
      walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
      poses: { ...def.poses },
    };
    updateNpc(id, (npc) => ({ ...npc, poseDebug: null }));
  }

  function getIdsForTarget(target) {
    if (target === 'routes') return [...new Set((ROUTE_EDITOR_DEFS?.[selectedRouteId]?.refs || ROUTES[selectedRouteId] || []))];
    if (target === 'meet') return MEET_POINT_IDS;
    return CALIBRATION_IDS;
  }

  function getDraftsForTarget(target) {
    if (target === 'routes') {
      return Object.fromEntries(
        getIdsForTarget('routes').map((id) => {
          const sourceTarget = resolvePointTarget(id);
          const sourceDrafts = sourceTarget === 'meet' ? meetDrafts : sourceTarget === 'stations' ? stationDrafts : navDrafts;
          return [id, sourceDrafts[id]];
        })
      );
    }
    if (target === 'meet') return meetDrafts;
    return stationDrafts;
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

  function getFirstRouteRef(routeId) {
    const route = ROUTE_EDITOR_DEFS?.[routeId]?.refs || ROUTES[routeId] || [];
    return route[0] || null;
  }

  function getPointDisplayName(target, id) {
    if (target === 'stations') return CHAR_DEFS[id]?.name || id;
    if (target === 'routes') {
      const sourceTarget = resolvePointTarget(id);
      if (sourceTarget === 'meet') return `${id} · report point`;
      if (sourceTarget === 'stations') return `${CHAR_DEFS[id]?.name || id} · station`;
      return `${id} · waypoint`;
    }
    return id;
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

  function handleMarkerPointerDown(target, id, event) {
    if (!worldCalibrationActive || busy) return;
    event.preventDefault(); event.stopPropagation();
    const point = stagePointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const resolvedTarget = target === 'routes' ? resolvePointTarget(id) : target;
    const source = getSourceMapForTarget(resolvedTarget);
    const current = resolvedTarget === 'stations' ? (npcStatesRef.current[id]?.pos || source[id]) : source[id];
    setCalibrationTarget(target);
    setSelectedMarkerId(id);
    dragStateRef.current = { target, id, offsetX: point.x * MAP_W - current.x * MAP_W, offsetY: point.y * MAP_H - current.y * MAP_H };
  }

  function prepareWorldCalibration() {
    dragStateRef.current = null;
    const stationSnapshot = clonePointMap(STATIONS);
    setStationDrafts(stationSnapshot);
    setNavDrafts(clonePointMap(NAV_POINTS));
    setMeetDrafts(clonePointMap(MEET_POINTS));
    syncNpcPositions(stationSnapshot);
    clearAllPoseDebug();
    setCopiedCoords(false);
  }


  return {
    resolvePoint,
    resolvePathSpec,
    orientToward,
    syncNpcPositions,
    clearAllPoseDebug,
    setPoseDebug,
    getPoseDebugForMapping,
    syncPosePreview,
    getCharPoseConfig,
    getPoseMappingValue,
    applyPoseMapping,
    getPoseFrameOptions,
    resetPoseMapping,
    getIdsForTarget,
    getDraftsForTarget,
    getSourceMapForTarget,
    resolvePointTarget,
    getFirstRouteRef,
    getPointDisplayName,
    setPointPosition,
    stagePointFromClient,
    handleMarkerPointerDown,
    prepareWorldCalibration,
  };
}

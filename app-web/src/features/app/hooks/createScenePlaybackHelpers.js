// @haish-esm
// Extracted from AppShell.jsx (Phase C). Behavior-preserving factory.
export function createScenePlaybackHelpers(ctx) {
  const {
    MAP_H,
    MAP_W,
    PROVIDER_SCENE_EVENT_TYPES,
    SCENE_CATCHUP_KEEP_TYPES,
    SCENE_CATCHUP_TOOL_EVENT_TYPES,
    SCENE_TERMINAL_EVENT_TYPES,
    SCENE_WAIT_TIMEOUT_MS,
    STATIONS,
    THINKING_PULSE_INTERVAL_MS,
    WORLD_EVENT_ROUTE_MAP,
    WORLD_KIND_MAP,
    WORLD_ROLE_TO_ACTOR,
    animateWalk,
    busy,
    completeAgentLiveEntries,
    conversationId,
    executorActorForToolGroup,
    getTaskById,
    legacyLiveEntries,
    mergeAgentLiveEntry,
    normalizeTaskStatus,
    now,
    pendingPresentationTaskIdsRef,
    playWorldEventScene,
    resolvePathSpec,
    resolveProviderMeta,
    sceneKeyForWorldEvent,
    sceneRuntimeRef,
    setAgentLive,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    summarizeText,
    updateNpc,
    updateTaskById,
    updateWorldTaskState,
    worldEventToRuntimeLog,
  } = ctx;

  function resolveScenePlaybackContext(event, task = null) {
    const providerMeta = resolveProviderMeta(event, task);
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : event.tool_group === 'skill'
        ? providerMeta.actor
      : routeConfig?.actor || actorId;
    return {
      providerMeta,
      actorId,
      executorActorId,
      sceneKey,
      routeConfig,
      actor,
    };
  }

  function buildSceneItem(event, taskId, targetConvId = null) {
    if (!event || !taskId) return null;
    const runtime = sceneRuntimeRef.current;
    runtime.seq += 1;
    const task = getTaskById(taskId, targetConvId);
    const context = resolveScenePlaybackContext(event, task);
    return {
      queueId: `scene-${runtime.seq}`,
      taskId,
      conversationId: targetConvId || event.conversation_id || task?.conversationId || null,
      event,
      eventType: event.type,
      callId: event.call_id || null,
      actor: context.actor || null,
      executorActorId: context.executorActorId || null,
      routeKey: context.routeConfig?.route || '',
      toolName: event.tool_name || '',
      toolGroup: event.tool_group || '',
      keepPolicy: SCENE_CATCHUP_KEEP_TYPES.has(event.type) ? 'required' : 'compressible',
      signature: [
        event.type,
        event.call_id || '',
        context.actor || '',
        context.executorActorId || '',
        event.tool_name || '',
        event.tool_group || '',
        context.routeConfig?.route || '',
      ].join(':'),
    };
  }

  function appendTaskEvent(taskId, event) {
    updateTaskById(taskId, (task) => ({
      ...task,
      loopIndex: Math.max(task.loopIndex || 0, event.loop_index || 0),
      activeRole: event.actor || task.activeRole,
      eventLog: [
        ...task.eventLog,
        worldEventToRuntimeLog(event),
      ],
    }));
  }

  function dropPendingSceneItems(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    if (runtime.pending.length) {
      runtime.pending = taskId
        ? runtime.pending.filter((item) => item.taskId !== taskId)
        : [];
    }
    clearSceneWaitState(taskId);
  }

  function clearSceneWaitState(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    const shouldClear = (key) => !taskId || key.startsWith(`${taskId}:`);
    for (const [key, waiter] of runtime.toolCompletionWaiters.entries()) {
      if (!shouldClear(key)) continue;
      clearTimeout(waiter.timer);
      waiter.resolve(null);
      runtime.toolCompletionWaiters.delete(key);
    }
    for (const [key, waiter] of runtime.thinkingCompletionWaiters.entries()) {
      if (!shouldClear(key)) continue;
      clearTimeout(waiter.timer);
      waiter.resolve(null);
      runtime.thinkingCompletionWaiters.delete(key);
    }
    for (const key of Array.from(runtime.toolCompletions.keys())) {
      if (shouldClear(key)) runtime.toolCompletions.delete(key);
    }
    for (const key of Array.from(runtime.thinkingCompletions.keys())) {
      if (shouldClear(key)) runtime.thinkingCompletions.delete(key);
    }
    stopThinkingPulsesForTask(taskId);
  }

  function sceneToolKey(event, taskId) {
    return `${taskId}:${event.call_id || event.tool_name || event.event_id || 'tool'}`;
  }

  function sceneThinkingKey(event, taskId) {
    return `${taskId}:${event.provider_key || event.provider || 'provider'}:${event.loop_index || 0}`;
  }

  function rememberSceneCompletion(kind, event, taskId) {
    const runtime = sceneRuntimeRef.current;
    const key = kind === 'tool' ? sceneToolKey(event, taskId) : sceneThinkingKey(event, taskId);
    const waiterMap = kind === 'tool' ? runtime.toolCompletionWaiters : runtime.thinkingCompletionWaiters;
    const completionMap = kind === 'tool' ? runtime.toolCompletions : runtime.thinkingCompletions;
    const waiter = waiterMap.get(key);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiterMap.delete(key);
      waiter.resolve(event);
      return;
    }
    completionMap.set(key, event);
  }

  function resolveSceneThinkingWaitersForTask(taskId, event) {
    if (!taskId) return;
    const runtime = sceneRuntimeRef.current;
    for (const [key, waiter] of runtime.thinkingCompletionWaiters.entries()) {
      if (!key.startsWith(`${taskId}:`)) continue;
      if (waiter.timer) clearTimeout(waiter.timer);
      runtime.thinkingCompletionWaiters.delete(key);
      waiter.resolve(event || null);
    }
  }

  function waitForSceneCompletion(kind, event, taskId) {
    const runtime = sceneRuntimeRef.current;
    const key = kind === 'tool' ? sceneToolKey(event, taskId) : sceneThinkingKey(event, taskId);
    const completionMap = kind === 'tool' ? runtime.toolCompletions : runtime.thinkingCompletions;
    const existing = completionMap.get(key);
    if (existing) {
      if (kind === 'tool') completionMap.delete(key);
      return Promise.resolve(existing);
    }
    const waiterMap = kind === 'tool' ? runtime.toolCompletionWaiters : runtime.thinkingCompletionWaiters;
    return new Promise((resolve) => {
      const timer = kind === 'thinking'
        ? null
        : setTimeout(() => {
            waiterMap.delete(key);
            resolve(null);
          }, SCENE_WAIT_TIMEOUT_MS);
      waiterMap.set(key, { resolve, timer });
    });
  }

  function findLastSceneItem(items, predicate) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (predicate(items[index], index)) return items[index];
    }
    return null;
  }

  function compactPendingSceneItems(taskId, targetConvId = null) {
    const runtime = sceneRuntimeRef.current;
    if (!taskId || !runtime.pending.length) return;
    const targetItems = runtime.pending.filter((item) => (
      item.taskId === taskId && (!targetConvId || item.conversationId === targetConvId)
    ));
    if (!targetItems.length) return;

    const keepIds = new Set();
    const lastFinalAnswer = findLastSceneItem(targetItems, (item) => item.eventType === 'llm_final_answer');
    const lastGatewayReported = findLastSceneItem(targetItems, (item) => item.eventType === 'agent_gateway_reported');
    if (lastFinalAnswer) keepIds.add(lastFinalAnswer.queueId);
    if (lastGatewayReported) keepIds.add(lastGatewayReported.queueId);

    const toolGroups = Array.from(new Set(
      targetItems
        .filter((item) => SCENE_CATCHUP_TOOL_EVENT_TYPES.has(item.eventType))
        .map((item) => item.toolGroup)
        .filter(Boolean),
    ));

    for (const toolGroup of toolGroups) {
      const lastToolResultForGroup = findLastSceneItem(
        targetItems,
        (item) => item.toolGroup === toolGroup && item.eventType === 'tool_result_returned',
      );
      const fallbackForGroup = findLastSceneItem(
        targetItems,
        (item) => item.toolGroup === toolGroup && SCENE_CATCHUP_TOOL_EVENT_TYPES.has(item.eventType),
      );
      const keepItem = lastToolResultForGroup || fallbackForGroup;
      if (keepItem) keepIds.add(keepItem.queueId);
    }

    if (!keepIds.size) {
      const fallback = findLastSceneItem(
        targetItems,
        (item) => item.keepPolicy === 'required',
      ) || targetItems[targetItems.length - 1];
      if (fallback) keepIds.add(fallback.queueId);
    }

    const compacted = targetItems.filter((item) => keepIds.has(item.queueId));
    let inserted = false;
    runtime.pending = runtime.pending.flatMap((item) => {
      if (item.taskId !== taskId || (targetConvId && item.conversationId !== targetConvId)) return [item];
      if (inserted) return [];
      inserted = true;
      return compacted;
    });

    updateTaskById(taskId, (task) => ({
      ...task,
      sceneCatchup: true,
    }), targetConvId);
  }

  function markAgentLive(actor, payload) {
    setAgentLive((state) => ({
      ...state,
      [actor]: mergeAgentLiveEntry(state[actor], payload),
    }));
  }

  function stopThinkingPulse(actor) {
    if (!actor) return;
    const runtime = sceneRuntimeRef.current;
    const entry = runtime.thinkingPulseTimers.get(actor);
    if (!entry) return;
    clearInterval(entry.timer);
    runtime.thinkingPulseTimers.delete(actor);
  }

  function stopThinkingPulsesForTask(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    for (const [actor, entry] of runtime.thinkingPulseTimers.entries()) {
      if (!taskId || entry.taskId === taskId) {
        clearInterval(entry.timer);
        runtime.thinkingPulseTimers.delete(actor);
      }
    }
  }

  function startThinkingPulse(actor, {
    taskId,
    baseBubble = 'Reasoning',
    kind = 'llm',
    tag = 'THINKING',
    stepCurrent = 1,
    stepTotal = 1,
  } = {}) {
    if (!actor || !STATIONS[actor]) return;
    stopThinkingPulse(actor);
    const startedAt = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startedAt;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const dots = '.'.repeat((elapsedSeconds % 3) + 1);
      const bubbleText = `${baseBubble}${dots}`;
      updateNpc(actor, {
        action: { kind, label: tag },
        bubble: bubbleText,
        busy: false,
        thinking: true,
      });
    };
    tick();
    const timer = setInterval(tick, THINKING_PULSE_INTERVAL_MS);
    sceneRuntimeRef.current.thinkingPulseTimers.set(actor, { timer, taskId });
  }

  function setActorIdle(actor) {
    if (!actor || !STATIONS[actor]) return;
    stopThinkingPulse(actor);
    updateNpc(actor, {
      action: null,
      bubble: null,
      busy: false,
      thinking: false,
      walking: false,
      dir: 'front',
    });
  }

  function setActorActive(actor, { kind, bubble = '', thinking = false } = {}) {
    if (!actor || !STATIONS[actor]) return;
    updateNpc(actor, {
      action: {
        kind: kind || WORLD_KIND_MAP[actor] || 'deliver',
        label: bubble ? summarizeText(bubble, 22).toUpperCase() : 'ACTIVE',
      },
      bubble,
      busy: !thinking,
      thinking,
    });
  }

  async function returnActorHome(actor, pathSpec, meta = {}) {
    if (!actor || !STATIONS[actor]) return;
    const path = [...resolvePathSpec(pathSpec), STATIONS[actor]];
    await animateWalk(actor, path, meta);
    setActorIdle(actor);
  }

  function resetSceneActors() {
    for (const actor of Object.keys(STATIONS)) {
      setActorIdle(actor);
    }
  }

  function completeTaskAgents(taskId, outcome = 'done') {
    setAgentLive((state) => {
      const next = { ...state };
      for (const actor of Object.keys(next)) {
        const entries = legacyLiveEntries(next[actor]);
        if (next[actor]?.taskId === taskId || entries.some((entry) => entry.taskId === taskId)) {
          next[actor] = completeAgentLiveEntries(next[actor], taskId, outcome);
        }
      }
      return next;
    });
  }

  function finalizeTaskPresentation(taskId, resultText, targetConvId = null) {
    if (!taskId) return;
    pendingPresentationTaskIdsRef.current.delete(taskId);
    const task = getTaskById(taskId, targetConvId);
    const taskConvId = targetConvId || task?.conversationId || null;
    updateTaskById(taskId, (run) => ({
      ...run,
      status: ['failed', 'cancelled', 'aborted'].includes(run.status) ? normalizeTaskStatus(run.status) : 'done',
      stage: 'done',
      completedAt: run.completedAt || Date.now(),
      answerText: resultText || run.answerText,
      presentationPending: false,
      serverFinished: true,
      sceneCatchup: false,
    }), taskConvId);
    updateWorldTaskState((state) => ({ ...state, activeTaskId: null }), taskConvId);
    setRuntimeBusy(false, taskConvId);
    setRuntimeActiveTaskId(null, taskConvId);
    setRuntimeFetchController(null, taskConvId);
    dropPendingSceneItems(taskId);
    resetSceneActors();
    completeTaskAgents(taskId, 'done');
  }

  function isChatOriginTask(taskId, targetConvId = null) {
    const task = getTaskById(taskId, targetConvId);
    return task?.originViewMode === 'chat';
  }

  function isBotWorkflowTask(taskId, targetConvId = null) {
    return getTaskById(taskId, targetConvId)?.executionMode === 'bot';
  }

  function pumpSceneQueue() {
    const runtime = sceneRuntimeRef.current;
    if (runtime.running) {
      return runtime.currentPromise || Promise.resolve();
    }
    runtime.running = true;
    runtime.currentPromise = (async () => {
      while (runtime.pending.length) {
        const item = runtime.pending.shift();
        if (!item) continue;
        runtime.activeItem = item;
        await playWorldEventScene(item.event, item.taskId, item.conversationId || null);
      }
      runtime.activeItem = null;
      runtime.running = false;
      runtime.currentPromise = null;
    })().catch((error) => {
      runtime.activeItem = null;
      runtime.running = false;
      runtime.currentPromise = null;
      console.error('scene error', error);
    });
    return runtime.currentPromise;
  }

  function enqueueSceneEvent(event, taskId, targetConvId = null) {
    const item = buildSceneItem(event, taskId, targetConvId);
    if (!item) return Promise.resolve();
    sceneRuntimeRef.current.pending.push(item);
    return pumpSceneQueue();
  }

  function scheduleSceneEvent(event, taskId, targetConvId = null) {
    if (event.type === 'llm_thinking_completed') {
      rememberSceneCompletion('thinking', event, taskId);
      return Promise.resolve();
    }
    if (SCENE_TERMINAL_EVENT_TYPES.has(event.type)) {
      resolveSceneThinkingWaitersForTask(taskId, event);
      stopThinkingPulsesForTask(taskId);
    }
    if (event.type === 'tool_executor_completed') {
      rememberSceneCompletion('tool', event, taskId);
      return Promise.resolve();
    }
    return enqueueSceneEvent(event, taskId, targetConvId);
  }

  // Local helpers only — AppShell already imports sleep from workspace-state.
  // Do not re-export sleep (redeclaring it in AppShell shadows the import and
  // creates a TDZ binding for the whole component body).
  const distancePx = (from, to) => Math.hypot((to.x - from.x) * MAP_W, (to.y - from.y) * MAP_H);


  return {
    distancePx,
    resolveScenePlaybackContext,
    buildSceneItem,
    appendTaskEvent,
    dropPendingSceneItems,
    clearSceneWaitState,
    sceneToolKey,
    sceneThinkingKey,
    rememberSceneCompletion,
    resolveSceneThinkingWaitersForTask,
    waitForSceneCompletion,
    findLastSceneItem,
    compactPendingSceneItems,
    markAgentLive,
    stopThinkingPulse,
    stopThinkingPulsesForTask,
    startThinkingPulse,
    setActorIdle,
    setActorActive,
    returnActorHome,
    resetSceneActors,
    completeTaskAgents,
    finalizeTaskPresentation,
    isChatOriginTask,
    isBotWorkflowTask,
    pumpSceneQueue,
    enqueueSceneEvent,
    scheduleSceneEvent,
  };
}

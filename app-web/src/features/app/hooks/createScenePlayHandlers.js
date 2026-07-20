// @haish-esm
// Extracted from AppShell.jsx (Phase C2). Behavior-preserving factory.
export function createScenePlayHandlers(ctx) {
  const {
    DEFAULT_WALK_MIN_DURATION_MS,
    DEFAULT_WALK_SPEED_PX_PER_SEC,
    KIND_COLORS,
    PROVIDER_SCENE_EVENT_TYPES,
    STATIONS,
    WALK_MIN_DURATION_BY_ACTOR,
    WALK_SPEED_BY_ACTOR,
    WORLD_EVENT_ROUTE_MAP,
    WORLD_KIND_MAP,
    WORLD_ROLE_TO_ACTOR,
    WORKFLOW_SCENE_EVENT_TYPES,
    answerBufferRef,
    completeLatestAgentLiveEntry,
    conversationIdRef,
    distancePx,
    executorActorForToolGroup,
    finalizeTaskPresentation,
    getActorReturnMeta,
    getExecutorReportRoute,
    getLiveEventStatus,
    getProviderToToolManagerRoute,
    getProviderToolRequestAction,
    getTaskById,
    getToolManagerToProviderRoute,
    getWorldEventTag,
    markAgentLive,
    npcStatesRef,
    orientToward,
    pauseForHandoff,
    pushBurst,
    resolvePathSpec,
    resolveProviderMeta,
    returnActorHome,
    sceneKeyForWorldEvent,
    setActorActive,
    setActorIdle,
    setAgentLive,
    setHollow,
    skillLoadingBubble,
    skillReadyBubble,
    sleep,
    startThinkingPulse,
    summarizeText,
    toDisplayText,
    updateNpc,
    updateTaskById,
    waitForSceneCompletion,
    walkDirFor,
    workflowNodeActorBindings,
  } = ctx;

  async function animateWalk(actor, points, meta = {}) {
    const path = points.flatMap(p => resolvePathSpec(p));
    if (!path.length) return npcStatesRef.current[actor].pos;
    updateNpc(actor, c => ({ ...c, walking: true, dir: walkDirFor(actor, c.pos, path[0], meta), ...meta }));
    for (const target of path) {
      const from = npcStatesRef.current[actor].pos;
      const walkSpeed = WALK_SPEED_BY_ACTOR[actor] || DEFAULT_WALK_SPEED_PX_PER_SEC;
      const minDuration = WALK_MIN_DURATION_BY_ACTOR[actor] || DEFAULT_WALK_MIN_DURATION_MS;
      const duration = Math.max(minDuration, (distancePx(from, target) / walkSpeed) * 1000);
      await new Promise(r => {
        const start = performance.now();
        const tick = (nowT) => {
          const progress = Math.min(1, (nowT - start) / duration);
          const pos = { x: from.x + (target.x - from.x) * progress, y: from.y + (target.y - from.y) * progress };
          updateNpc(actor, { pos, dir: walkDirFor(actor, pos, target, meta), walking: progress < 1, ...meta });
          if (progress < 1) requestAnimationFrame(tick); else r();
        };
        requestAnimationFrame(tick);
      });
    }
    updateNpc(actor, { pos: path[path.length - 1], walking: false, ...meta });
    return path[path.length - 1];
  }

  async function runStep(step, ctx) {
    const actor = step.actor;
    const action = { kind: step.kind, label: step.label, variant: step.poseVariant || null };
    const travelPoints = [...resolvePathSpec(step.route), ...resolvePathSpec(step.path), ...resolvePathSpec(step.moveTo)];
    const tot = ctx.agentTotals[actor] || 1;
    ctx.agentSteps[actor] = (ctx.agentSteps[actor] || 0) + 1;
    const cur = ctx.agentSteps[actor];

    markAgentLive(actor, { taskId: ctx.taskId, description: step.bubble || step.log?.msg || '', stepCurrent: cur, stepTotal: tot, tag: step.label, kind: step.kind, status: 'pending' });
    if (step.questStage) {
      updateTaskById(ctx.taskId, (run) => ({
        ...run,
        stage: step.questStage,
        completedAt: step.questStage === 'done' ? Date.now() : run.completedAt,
      }));
    }
    if (travelPoints.length) {
      await animateWalk(actor, travelPoints, { action, bubble: step.bubbleAfterMove ? null : step.bubble, busy: true, thinking: step.kind === 'think' });
    } else {
      updateNpc(actor, { action, bubble: step.bubble, busy: true, thinking: step.kind === 'think' });
    }
    if (travelPoints.length && step.bubbleAfterMove && step.bubble) {
      updateNpc(actor, { action, bubble: step.bubble, busy: true, thinking: step.kind === 'think' });
    }
    if (step.faceToFaceWith) { orientToward(actor, step.faceToFaceWith); orientToward(step.faceToFaceWith, actor); }
    if (step.forceDir) updateNpc(actor, { dir: step.forceDir });
    if (step.fx || step.kind === 'llm') pushBurst(npcStatesRef.current[actor].pos, KIND_COLORS[step.kind]);
    await sleep(step.duration || 1200);
    updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
    if (step.faceToFaceWith) updateNpc(step.faceToFaceWith, { dir: 'front' });
    if (travelPoints.length && step.returnHome !== false) {
      const rp = [ ...(step.returnRoute ? resolvePathSpec(step.returnRoute) : travelPoints.slice(0, -1).reverse()), STATIONS[actor] ];
      const returnMeta = actor === 'itachi' && step.kind === 'report' ? { preferSideWalk: true } : {};
      await sleep(120); await animateWalk(actor, rp, returnMeta); updateNpc(actor, { dir: 'front', walking: false });
    }
  }

  async function playWorkflowEventScene(event, taskId, run, targetConvId = null) {
    if (!WORKFLOW_SCENE_EVENT_TYPES.has(event.type)) return;
    const bindings = workflowNodeActorBindings(run?.workflowSnapshot);
    const byNodeId = new Map(bindings.map((binding) => [binding.nodeId, binding]));
    const nodeId = event.workflow_node_id || event.node_id;
    const node = byNodeId.get(nodeId);
    const nodeKind = node?.type === 'tool' ? 'tool' : node?.type === 'llm' ? 'llm' : node?.type === 'output' ? 'report' : 'think';
    const markWorkflowLive = (binding, description, tag, kind = nodeKind, status = 'pending') => {
      if (!binding) return;
      markAgentLive(binding.actor, {
        taskId,
        description,
        stepCurrent: 1,
        stepTotal: 1,
        tag,
        kind,
        status,
      });
    };

    if (event.type === 'workflow_started') {
      const start = bindings.find((binding) => binding.type === 'start');
      if (!start) return;
      markWorkflowLive(start, 'Workflow started. Preparing the task.', 'START', 'think');
      setActorActive(start.actor, { kind: 'think', bubble: 'Workflow started. Preparing the task.', thinking: true });
      return;
    }

    if (event.type === 'workflow_edge_selected') {
      const incomingEdge = run?.workflowSnapshot?.edges?.find((edge) => (
        (edge.to || edge.target) === event.from_node_id
      ));
      const incomingSourceId = incomingEdge?.from || incomingEdge?.source;
      const source = byNodeId.get(event.from_node_id) || byNodeId.get(incomingSourceId);
      const target = byNodeId.get(event.to_node_id);
      if (!source || !target) return;
      const handoff = `${source.label} handed the task to ${target.label}.`;
      markWorkflowLive(source, handoff, 'HANDOFF', 'deliver', 'done');
      markWorkflowLive(target, 'Task received.', 'RECEIVED', 'think');
      setActorActive(source.actor, { kind: 'deliver', bubble: handoff });
      setActorActive(target.actor, { kind: 'think', bubble: 'Task received.', thinking: true });
      orientToward(source.actor, target.actor);
      orientToward(target.actor, source.actor);
      pushBurst(npcStatesRef.current[source.actor]?.pos || STATIONS[source.actor], KIND_COLORS?.deliver || '#efbf64');
      pushBurst(npcStatesRef.current[target.actor]?.pos || STATIONS[target.actor], KIND_COLORS?.think || '#efbf64');
      await sleep(440);
      setActorIdle(source.actor);
      updateNpc(target.actor, { dir: 'front' });
      return;
    }

    if (event.type === 'workflow_node_started') {
      if (!node) return;
      const bubble = node.type === 'start' ? 'Task ready. Delegating now.' : `${node.label} is working.`;
      markWorkflowLive(node, bubble, 'RUNNING', nodeKind);
      setActorActive(node.actor, { kind: nodeKind, bubble, thinking: nodeKind === 'think' || nodeKind === 'llm' });
      if (nodeKind === 'tool' || nodeKind === 'llm') {
        pushBurst(npcStatesRef.current[node.actor]?.pos || STATIONS[node.actor], KIND_COLORS?.[nodeKind] || '#efbf64');
      }
      return;
    }

    if (event.type === 'workflow_node_finished') {
      if (!node) return;
      const failed = event.success === false || event.status === 'failed';
      const bubble = failed ? `${node.label} failed.` : `${node.label} completed.`;
      markWorkflowLive(node, bubble, failed ? 'FAILED' : 'DONE', failed ? 'report' : nodeKind, failed ? 'failed' : 'done');
      setActorActive(node.actor, { kind: failed ? 'report' : nodeKind, bubble });
      await sleep(340);
      setActorIdle(node.actor);
      return;
    }

    if (event.type === 'workflow_finished' || event.type === 'workflow_failed') {
      const end = bindings.find((binding) => binding.type === 'output');
      if (!end) return;
      const failed = event.type === 'workflow_failed';
      const bubble = failed ? 'Workflow failed. Reporting the blocker.' : 'Final report ready.';
      markWorkflowLive(end, bubble, failed ? 'FAILED' : 'REPORT', 'report', failed ? 'failed' : 'done');
      setActorActive(end.actor, { kind: 'report', bubble });
      pushBurst(npcStatesRef.current[end.actor]?.pos || STATIONS[end.actor], KIND_COLORS?.report || '#efbf64');
      await sleep(640);
      setActorIdle(end.actor);
      const finalTask = getTaskById(taskId, targetConvId);
      const result = toDisplayText(event.output || event.summary || finalTask?.answerText || finalTask?.error || bubble);
      finalizeTaskPresentation(taskId, result, targetConvId);
    }
  }

  async function playWorldEventScene(event, taskId, targetConvId = null) {
    if (!taskId) return;
    const run = getTaskById(taskId, targetConvId);
    if (run?.executionMode === 'bot') {
      await playWorkflowEventScene(event, taskId, run, targetConvId);
      return;
    }
    const providerMeta = resolveProviderMeta(event, run);
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const targetActorId = event.target_actor_id || WORLD_ROLE_TO_ACTOR[event.target];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : routeConfig?.actor || actorId;
    if (!actor || !STATIONS[actor]) return;

    const bubble = event.type === 'provider_selected'
      ? providerMeta.label
      : event.message || event.data?.message || event.payload?.message || event.delta || routeConfig?.bubble || '';
    const kind = event.kind || routeConfig?.kind || WORLD_KIND_MAP[actor] || 'deliver';
    const action = { kind, label: getWorldEventTag(event.type, kind) };
    const markSceneLive = (liveActor, description, tag = action.label, liveKind = kind, liveStatus = getLiveEventStatus(event.type)) => {
      markAgentLive(liveActor, {
        taskId,
        description: summarizeText(description || bubble || event.content || event.tool_name || event.type),
        stepCurrent: Math.max(1, event.loop_index || 1),
        stepTotal: Math.max(1, event.loop_index || 1),
        tag,
        kind: liveKind,
        status: liveStatus,
      });
    };

    if (kind === 'llm' || kind === 'tool' || kind === 'mcp' || kind === 'skill') {
      pushBurst(npcStatesRef.current[actor]?.pos || STATIONS[actor], KIND_COLORS?.[kind] || '#efbf64');
    }

    if (event.type === 'user_message_received') {
      markSceneLive('gojo', bubble || 'Task submitted.', 'RECEIVED', 'deliver');
      const route = resolvePathSpec('gojoToGuts');
      await animateWalk('gojo', route, { action: { kind: 'deliver', label: 'DELEGATE' }, bubble, busy: true });
      orientToward('gojo', 'guts');
      orientToward('guts', 'gojo');
      await sleep(420);
      updateNpc('gojo', { action: null, bubble: null, busy: false });
      await returnActorHome('gojo', route.slice(0, -1).reverse());
      updateNpc('guts', { dir: 'front' });
      return;
    }

    if (event.type === 'agent_gateway_received') {
      markSceneLive('guts', bubble || 'Task received. Preparing the provider route.', 'THINKING', 'think');
      setActorActive('guts', {
        kind: 'think',
        bubble: bubble || 'Task received. Preparing the provider route.',
        thinking: true,
      });
      return;
    }

    if (event.type === 'provider_selected') {
      markSceneLive('guts', `Routing the task to ${providerMeta.label}.`, 'ROUTING', 'report');
      const route = resolvePathSpec('gutsToPlanning');
      await animateWalk('guts', route, {
        action: { kind: 'report', label: 'ROUTE' },
        bubble: `Routing the task to ${providerMeta.label}.`,
        busy: true,
      });
      orientToward('guts', providerMeta.actor);
      orientToward(providerMeta.actor, 'guts');
      await sleep(480);
      updateNpc('guts', { action: null, bubble: null, busy: false });
      updateNpc(providerMeta.actor, { bubble: `${providerMeta.label} acknowledged the task.`, busy: true, action: { kind: 'llm', label: providerMeta.label.toUpperCase() } });
      markSceneLive(providerMeta.actor, `${providerMeta.label} acknowledged the task.`, 'PROVIDER', 'llm');
      await sleep(360);
      setActorIdle(providerMeta.actor);
      await returnActorHome('guts', route.slice(0, -1).reverse());
      updateNpc(providerMeta.actor, { dir: 'front' });
      return;
    }

    if (event.type === 'context_compaction_started') {
      const compactionBubble = 'Auto-Compacting context';
      markSceneLive(providerMeta.actor, compactionBubble, 'CONTEXT', 'llm', 'pending');
      setActorActive(providerMeta.actor, {
        kind: 'llm',
        bubble: compactionBubble,
        thinking: true,
      });
      return;
    }

    if (event.type === 'context_compaction_completed') {
      const compactionBubble = 'Auto-Compacting context';
      markSceneLive(providerMeta.actor, compactionBubble, 'CONTEXT', 'llm', 'done');
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_thinking_started') {
      const reasoningBubble = bubble || `${providerMeta.label} is reasoning`;
      markSceneLive(providerMeta.actor, reasoningBubble, 'THINKING', 'llm');
      startThinkingPulse(providerMeta.actor, {
        taskId,
        baseBubble: reasoningBubble,
        kind: 'llm',
        tag: 'THINKING',
        stepCurrent: Math.max(1, event.loop_index || 1),
        stepTotal: Math.max(1, event.loop_index || 1),
      });
      await waitForSceneCompletion('thinking', event, taskId);
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_thinking_completed') {
      setAgentLive((state) => {
        const nextActorState = completeLatestAgentLiveEntry(state[providerMeta.actor], taskId, 'done');
        if (!nextActorState) return state;
        return {
          ...state,
          [providerMeta.actor]: nextActorState,
        };
      });
      await sleep(220);
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_tool_call_requested') {
      if (event.tool_group === 'skill') {
        const skillBubble = skillLoadingBubble(event, providerMeta);
        markSceneLive(providerMeta.actor, skillBubble, 'SKILL', 'skill');
        setActorActive(providerMeta.actor, {
          kind: 'skill',
          bubble: skillBubble,
          thinking: true,
        });
        await sleep(420);
        return;
      }
      markSceneLive(providerMeta.actor, bubble || 'Tool access is required.', 'TOOL', 'llm');
      const routeName = getProviderToToolManagerRoute(providerMeta.actor);
      if (!routeName) {
        setActorActive(providerMeta.actor, { kind: 'llm', bubble: bubble || 'Tool access is required.', thinking: true });
        await sleep(540);
        return;
      }
      const route = resolvePathSpec(routeName);
      await animateWalk(providerMeta.actor, route, {
        action: getProviderToolRequestAction(providerMeta.actor),
        bubble: bubble || 'Tool access is required.',
        busy: true,
        thinking: false,
      });
      await pauseForHandoff(providerMeta.actor, 'lelouch', 460);
      updateNpc(providerMeta.actor, { action: null, bubble: null, busy: false, thinking: false });
      updateNpc('lelouch', { dir: 'front' });
      await returnActorHome(providerMeta.actor, route.slice(0, -1).reverse());
      return;
    }

    if (event.tool_group === 'skill' && (event.type === 'tool_manager_received' || event.type === 'tool_dispatched')) {
      const skillBubble = skillLoadingBubble(event, providerMeta);
      markSceneLive(providerMeta.actor, skillBubble, 'SKILL', 'skill');
      setActorActive(providerMeta.actor, {
        kind: 'skill',
        bubble: skillBubble,
        thinking: true,
      });
      await sleep(180);
      return;
    }

    if (event.type === 'tool_manager_received') {
      markSceneLive('lelouch', bubble || 'Tool request received. Dispatching now.', 'RECEIVED', 'deliver');
      setActorActive('lelouch', {
        kind: 'deliver',
        bubble: bubble || 'Tool request received. Dispatching now.',
      });
      await sleep(260);
      return;
    }

    if (event.type === 'tool_executor_started') {
      const executionBubble = event.tool_group === 'skill'
        ? skillLoadingBubble(event, providerMeta)
        : (bubble || `${event.tool_name || 'Tool'} is running.`);
      markSceneLive(actor, executionBubble, 'EXECUTING', kind);
      setActorActive(actor, { kind, bubble: executionBubble });
      const completedEvent = await waitForSceneCompletion('tool', event, taskId);
      const completionBubble = event.tool_group === 'skill'
        ? skillReadyBubble(completedEvent || event)
        : (completedEvent?.output_summary || 'Execution complete. Preparing the result handoff.');
      markSceneLive(actor, completionBubble, 'COMPLETED', kind, 'done');
      setActorActive(actor, { kind, bubble: completionBubble });
      await sleep(260);
      return;
    }

    if (event.type === 'tool_executor_completed') {
      const completionBubble = event.tool_group === 'skill'
        ? skillReadyBubble(event)
        : (bubble || 'Execution complete. Preparing the result handoff.');
      markSceneLive(actor, completionBubble, 'COMPLETED', kind);
      setActorActive(actor, { kind, bubble: completionBubble });
      await sleep(220);
      return;
    }

    if (event.type === 'tool_dispatched' && routeConfig?.route) {
      markSceneLive(actor, bubble, action.label, kind);
      const dispatchRoute = resolvePathSpec(routeConfig.route);
      await animateWalk(actor, dispatchRoute, {
        action,
        bubble,
        busy: true,
        thinking: false,
      });
      if (targetActorId) {
        await pauseForHandoff(actor, targetActorId, 360);
        updateNpc(targetActorId, { dir: 'front' });
      }
      updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
      await returnActorHome(actor, dispatchRoute.slice(0, -1).reverse());
      return;
    }

    if (event.type === 'tool_result_returned') {
      if (event.tool_group === 'skill') {
        const readyBubble = event.message || 'Skill context is ready. Continuing with the provider.';
        markSceneLive(providerMeta.actor, readyBubble, 'SKILL', 'skill');
        setActorActive(providerMeta.actor, {
          kind: 'skill',
          bubble: readyBubble,
          thinking: false,
        });
        await sleep(420);
        setActorActive(providerMeta.actor, {
          kind: 'llm',
          bubble: 'Skill context loaded. Reasoning continues.',
          thinking: true,
        });
        return;
      }
      const reportActor = executorActorId;
      const reportRouteName = getExecutorReportRoute(reportActor);
      const providerRouteName = getToolManagerToProviderRoute(providerMeta.actor);
      if (!reportActor || !reportRouteName || !providerRouteName) {
        markSceneLive(actor, bubble, action.label, kind);
        updateNpc(actor, { action, bubble, busy: true, thinking: kind === 'think' });
        await sleep(640);
        updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
        return;
      }

      const reportRoute = resolvePathSpec(reportRouteName);
      const providerRoute = resolvePathSpec(providerRouteName);
      const reportBubble = `${event.tool_name || 'Tool'} finished. Reporting back to the Tool Manager.`;
      markSceneLive(reportActor, reportBubble, 'REPORT', 'report');
      await animateWalk(reportActor, reportRoute, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: reportBubble,
        busy: true,
      });
      await pauseForHandoff(reportActor, 'lelouch', 420);
      updateNpc(reportActor, { action: null, bubble: null, busy: false, thinking: false });
      updateNpc('lelouch', {
        action: { kind: 'deliver', label: 'RECEIVE' },
        bubble: 'Result received. Reporting to the LLM.',
        busy: true,
        thinking: false,
      });
      await sleep(220);
      await returnActorHome(reportActor, reportRoute.slice(0, -1).reverse(), getActorReturnMeta(reportActor));

      const providerBubble = event.message || 'Tool results are ready for review.';
      markSceneLive('lelouch', providerBubble, 'REPORT', 'report');
      await animateWalk('lelouch', providerRoute, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: providerBubble,
        busy: true,
      });
      await pauseForHandoff('lelouch', providerMeta.actor, 460);
      updateNpc('lelouch', { action: null, bubble: null, busy: false, thinking: false });
      updateNpc(providerMeta.actor, { dir: 'front' });
      markSceneLive(providerMeta.actor, 'Tool results received. Re-evaluating.', 'OBSERVED', 'llm');
      setActorActive(providerMeta.actor, { kind: 'llm', bubble: 'Tool results received. Re-evaluating.', thinking: true });
      await returnActorHome('lelouch', providerRoute.slice(0, -1).reverse());
      return;
    }

    if (event.type === 'llm_final_answer') {
      markSceneLive(providerMeta.actor, bubble || 'Final answer ready.', 'ANSWER', 'report');
      const route = resolvePathSpec('okabeToGuts');
      await animateWalk(providerMeta.actor, route, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: bubble || 'Final answer ready.',
        busy: true,
      });
      orientToward(providerMeta.actor, 'guts');
      orientToward('guts', providerMeta.actor);
      await sleep(520);
      updateNpc(providerMeta.actor, { action: null, bubble: null, busy: false, thinking: false });
      await returnActorHome(providerMeta.actor, route.slice(0, -1).reverse());
      markSceneLive('guts', 'Final answer received. Preparing the report.', 'REVIEW', 'think');
      setActorActive('guts', { kind: 'think', bubble: 'Final answer received. Preparing the report.', thinking: true });
      updateNpc('guts', { dir: 'front' });
      return;
    }

    if (routeConfig?.route) {
      markSceneLive(actor, bubble, action.label, kind);
      await animateWalk(actor, resolvePathSpec(routeConfig.route), {
        action,
        bubble,
        busy: true,
        thinking: kind === 'think',
      });
      if (targetActorId) {
        orientToward(actor, targetActorId);
        orientToward(targetActorId, actor);
      }
      await sleep(480);
      updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
      if (targetActorId) updateNpc(targetActorId, { dir: 'front' });
      const returnRouteName = actor === 'levi'
        ? 'leviToLelouch'
        : actor === 'itachi'
          ? 'itachiToLelouch'
          : actor === 'mikey'
            ? 'mikeyToLelouch'
          : actor === 'guts'
              ? 'gutsToGojo'
              : null;
      if (event.type === 'agent_gateway_reported') {
        setActorIdle(actor);
        if (targetActorId) updateNpc(targetActorId, { dir: 'front' });
        await sleep(120);
        await returnActorHome(actor, resolvePathSpec(routeConfig.route).slice(0, -1).reverse());
        setActorActive('gojo', {
          kind: 'llm',
          bubble: 'Let me review it myself.',
          thinking: false,
        });
        pushBurst(npcStatesRef.current.gojo?.pos || STATIONS.gojo, KIND_COLORS?.llm || '#efbf64');
        await sleep(760);
        setActorIdle('gojo');
        const finalTask = getTaskById(taskId, targetConvId);
        const finalResult = event.content || finalTask?.answerText || answerBufferRef.current;
        if (!targetConvId || targetConvId === conversationIdRef.current) {
          setHollow({
            title: finalTask?.title || event.message || 'Final Report',
            result: finalResult,
            taskId,
          });
        }
        finalizeTaskPresentation(taskId, finalResult, targetConvId);
      } else if (returnRouteName) {
        await sleep(120);
        await returnActorHome(actor, returnRouteName, actor === 'itachi' ? { preferSideWalk: true } : {});
      } else {
        setActorIdle(actor);
      }
      return;
    }

    markSceneLive(actor, bubble, action.label, kind);
    updateNpc(actor, { action, bubble, busy: true, thinking: kind === 'think' });
    await sleep(640);
    updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
  }

  return {
    animateWalk,
    runStep,
    playWorkflowEventScene,
    playWorldEventScene,
  };
}

// @haish-esm
import React from 'react';
import {
  actorPhase,
  actorRoute,
  actorSpriteAction,
  actorSpot,
  actorSpriteSource,
  actorTravelDuration,
  actorWalkDirection,
  buildPenguinCast,
  canPlayLeisureAction,
  createLeisureSchedule,
  leisureBehaviorStep,
  taskProgressText,
} from '../../lib/bot-scene.js';
import './BotWorld.css';

const BotWorldGame = React.lazy(() => import('./BotWorldGame.jsx').then((module) => ({
  default: module.BotWorldGame,
})));

const ACTION_FRAMES = {
  walk_front: [1, 2, 1, 4],
  walk_back: [1, 2, 1, 4],
  walk_left: [1, 2, 1, 4],
  walk_right: [1, 2, 1, 4],
  special: [1, 2, 3, 4, 3, 2],
  coffee_sit: [1, 2, 3, 4, 3, 2],
  // One full bounce: hand height -> floor contact -> hand height.
  basketball: [1, 2, 3, 4, 3, 2, 1, 8, 7, 8],
  basketball_shoot: [5, 6],
  basketball_pickup: [5, 6, 7, 8],
  belly_slide: [3, 4, 5, 6, 5, 4],
};

const ACTION_FRAME_MS = {
  walk_front: 190,
  walk_back: 190,
  walk_left: 190,
  walk_right: 190,
  idle: 420,
  thinking: 420,
  special: 420,
  coffee: 420,
  coffee_make: 360,
  coffee_sit: 460,
  basketball: 320,
  basketball_shoot: 220,
  basketball_pickup: 250,
  belly_slide: 360,
};

const PRELOAD_ACTIONS = {
  idle: 4,
  thinking: 4,
  special: 4,
  walk_front: 4,
  walk_back: 4,
  walk_left: 4,
  walk_right: 4,
  coffee: 8,
  coffee_make: 8,
  coffee_sit: 8,
  basketball: 8,
  basketball_shoot: 8,
  belly_slide: 8,
};

const BASE_ACTION_SCALE = [0.89, 0.85, 0.88, 0.88];
const GENERATED_ACTIONS = new Set([
  'coffee',
  'coffee_make',
  'coffee_sit',
  'basketball',
  'basketball_shoot',
  'basketball_pickup',
  'belly_slide',
]);
const GENERATED_ACTION_SCALE = 0.96;
// Per-IP optical correction for upright poses. The horizontal QA slide needs
// its own action-only compensation so standing QA remains aligned with peers.
const VARIANT_VISUAL_SCALE = [0.94, 1, 1, 1];
const QA_SLIDE_VISUAL_SCALE = 1.3;
const ACTION_SUBJECT_EXTENTS = {
  coffee_sit: [
    [331, 331, 332, 333],
    [229, 229, 229, 229],
    [240, 240, 240, 240],
    [276, 276, 275, 275],
  ],
  basketball_shoot: [
    [0, 0, 0, 0, 254, 251, 239],
    [0, 0, 0, 0, 226, 222, 207],
    [0, 0, 0, 0, 244, 231, 225],
    [0, 0, 0, 0, 266, 262, 240],
  ],
  belly_slide: [
    [0, 0, 266, 290, 291, 311],
    [0, 0, 277, 303, 297, 322],
    [0, 0, 272, 303, 302, 322],
    [0, 0, 275, 353, 337, 326],
  ],
};
const ACTION_TARGET_SIZE = {
  coffee_sit: 70,
  basketball_shoot: 82,
  belly_slide: 82,
};

function actionFrameSequence(action) {
  return ACTION_FRAMES[action] || Array.from({ length: PRELOAD_ACTIONS[action] || 4 }, (_, index) => index + 1);
}

function actionScale(spriteVariant, action, frame) {
  // Base sprites are tightly cropped; generated sprites use a 384px square.
  // Calibrate compact poses by their penguin body (height, or slide length),
  // not by detached props such as the basketball and snow trail.
  const subjectExtent = ACTION_SUBJECT_EXTENTS[action]?.[spriteVariant - 1]?.[frame - 1];
  const calibrated = subjectExtent
    ? (ACTION_TARGET_SIZE[action] * 3.84) / subjectExtent
    : GENERATED_ACTIONS.has(action)
    ? GENERATED_ACTION_SCALE
    : BASE_ACTION_SCALE[spriteVariant - 1] || BASE_ACTION_SCALE[0];
  const actionCorrection = action === 'belly_slide' && spriteVariant === 3
    ? QA_SLIDE_VISUAL_SCALE
    : 1;
  return Number((
    calibrated
    * (VARIANT_VISUAL_SCALE[spriteVariant - 1] || 1)
    * actionCorrection
  ).toFixed(3));
}

function useActorSpritesReady(actor) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setReady(false);
    const loads = Object.entries(PRELOAD_ACTIONS).flatMap(([action, count]) => (
      Array.from({ length: count }, (_, index) => new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          const decoded = typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve();
          decoded.finally(resolve);
        };
        image.onerror = resolve;
        image.src = `assets/world/penguins/${actor.spriteKey}/${action}_${String(index + 1).padStart(2, '0')}.png`;
      }))
    ));
    Promise.all(loads).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [actor.spriteKey]);

  return ready;
}

function useActorRoute(targetSpot, initialSpot = targetSpot, urgent = false) {
  const currentSpotRef = React.useRef(initialSpot);
  const activeSegmentRef = React.useRef(null);
  const [displaySpot, setDisplaySpot] = React.useState(initialSpot);
  const [motion, setMotion] = React.useState({
    moving: false,
    direction: 'front',
    facing: 'right',
    frame: 1,
    duration: 0,
    mode: 'idle',
    fromKind: '',
    toKind: '',
  });

  React.useEffect(() => {
    const route = actorRoute(currentSpotRef.current, targetSpot);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let cancelled = false;
    let stepTimer = 0;
    let paintTimer = 0;
    let settleTimer = 0;
    let routeIndex = 0;
    const frames = window.setInterval(() => {
      setMotion((current) => current.moving
        ? { ...current, frame: (current.frame % 4) + 1 }
        : current);
    }, 160);

    function walkNextSegment() {
      if (cancelled || routeIndex >= route.length) {
        setMotion((current) => ({
          ...current,
          moving: false,
          duration: reducedMotion ? 0 : 180,
          mode: route.length && !reducedMotion ? 'settle' : 'idle',
        }));
        settleTimer = window.setTimeout(() => {
          if (!cancelled) setMotion((current) => ({ ...current, mode: 'idle', duration: 0 }));
        }, reducedMotion ? 0 : 180);
        return;
      }
      const from = currentSpotRef.current;
      const to = route[routeIndex];
      routeIndex += 1;
      const fromIsSeat = from?.kind === 'table' || from?.id?.startsWith('coffee_seat_');
      const toIsSeat = to?.kind === 'table' || to?.id?.startsWith('coffee_seat_');
      const jumpingUp = from?.id?.endsWith('_approach') && toIsSeat;
      const jumpingDown = fromIsSeat && to?.id?.endsWith('_approach');
      const jumpDirection = jumpingUp ? 'up' : jumpingDown ? 'down' : '';
      const skatingSegment = !jumpDirection && (
        (from?.kind === 'skate' && (to?.kind === 'skate' || to?.id === 'lake_gate'))
        || (from?.id === 'lake_gate' && to?.kind === 'skate')
      );
      const travelDuration = actorTravelDuration(from, to);
      const duration = jumpingUp
        ? (to?.kind === 'table' ? 480 : 620)
        : jumpingDown
          ? (from?.kind === 'table' ? 360 : 480)
          : urgent
            ? Math.max(240, Math.round(travelDuration * 0.76))
            : travelDuration;
      setMotion({
        moving: true,
        direction: actorWalkDirection(from, to),
        facing: Number(to?.x || 0) < Number(from?.x || 0) ? 'left' : 'right',
        frame: 1,
        duration,
        mode: jumpDirection ? 'jump' : skatingSegment ? 'skate' : 'walk',
        jumpDirection,
        fromKind: from?.kind || '',
        toKind: to?.kind || '',
      });
      activeSegmentRef.current = reducedMotion ? null : {
        from,
        to,
        startedAt: performance.now() + 20,
        duration,
      };
      paintTimer = window.setTimeout(() => {
        setDisplaySpot(to);
      }, reducedMotion ? 0 : 20);
      stepTimer = window.setTimeout(() => {
        currentSpotRef.current = to;
        activeSegmentRef.current = null;
        walkNextSegment();
      }, (reducedMotion ? 0 : duration) + 24);
    }

    if (route.length && !reducedMotion) {
      const first = route[0];
      const skatingStart = (
        currentSpotRef.current?.kind === 'skate'
        && (first?.kind === 'skate' || first?.id === 'lake_gate')
      ) || (currentSpotRef.current?.id === 'lake_gate' && first?.kind === 'skate');
      const anticipateDuration = skatingStart ? 30 : 110;
      setMotion((current) => ({
        ...current,
        moving: false,
        direction: actorWalkDirection(currentSpotRef.current, first),
        facing: Number(first?.x || 0) < Number(currentSpotRef.current?.x || 0) ? 'left' : 'right',
        duration: anticipateDuration,
        mode: 'anticipate',
      }));
      stepTimer = window.setTimeout(walkNextSegment, anticipateDuration);
    } else {
      walkNextSegment();
    }
    return () => {
      cancelled = true;
      window.clearInterval(frames);
      window.clearTimeout(stepTimer);
      window.clearTimeout(paintTimer);
      window.clearTimeout(settleTimer);
      const segment = activeSegmentRef.current;
      if (segment && segment.duration > 0) {
        const progress = Math.max(0, Math.min(
          1,
          (performance.now() - segment.startedAt) / segment.duration,
        ));
        const liveSpot = {
          id: `route_interrupted_${segment.to.id}`,
          kind: 'route',
          nav: progress < 0.5 ? segment.from.nav : segment.to.nav,
          x: segment.from.x + (segment.to.x - segment.from.x) * progress,
          y: segment.from.y + (segment.to.y - segment.from.y) * progress,
        };
        // ponytail: preserve the rendered position so a new task never restarts an old route.
        currentSpotRef.current = liveSpot;
        setDisplaySpot(liveSpot);
      }
      activeSegmentRef.current = null;
    };
  }, [targetSpot, urgent]);

  const arrived = !motion.moving && (
    currentSpotRef.current?.id === targetSpot?.id
    || (Math.abs((currentSpotRef.current?.x || 0) - (targetSpot?.x || 0)) < 0.001
      && Math.abs((currentSpotRef.current?.y || 0) - (targetSpot?.y || 0)) < 0.001)
  );
  return { displaySpot, motion, arrived };
}

function useLeisureBehavior(actor, phase, spot) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [schedule, setSchedule] = React.useState(() => createLeisureSchedule(spot.kind));
  const tableSpot = actorSpot(actor, 'reporting');
  const behavior = React.useMemo(
    () => leisureBehaviorStep(spot.kind, stepIndex, actor.castIndex, spot, tableSpot, schedule),
    [actor.castIndex, schedule, spot, stepIndex, tableSpot],
  );

  React.useEffect(() => {
    if (phase === 'leisure') return;
    setStepIndex(0);
    setSchedule(createLeisureSchedule(spot.kind));
  }, [phase, spot.kind]);

  const advance = React.useCallback(() => {
    if (!behavior.scheduleComplete) {
      setStepIndex((step) => step + 1);
      return;
    }
    setStepIndex(0);
    setSchedule(createLeisureSchedule(spot.kind));
  }, [behavior.scheduleComplete, spot.kind]);
  return { behavior, advance };
}

function PenguinActor({
  actor,
  phase,
  spot,
  initialSpot,
  progressText,
  onOpenReport,
  onBallChange,
  onArrive,
}) {
  const [animationStep, setAnimationStep] = React.useState(0);
  const arrivalRef = React.useRef('');
  const spritesReady = useActorSpritesReady(actor);

  const { behavior, advance } = useLeisureBehavior(actor, phase, spot);

  const targetSpot = phase === 'leisure'
      ? behavior.spot
      : spot;
  const routeTarget = spritesReady ? targetSpot : actor.spawnSpot;
  const urgent = phase !== 'leisure';
  const { displaySpot, motion, arrived } = useActorRoute(
    routeTarget,
    initialSpot || actor.spawnSpot,
    urgent,
  );
  const leisureActionReady = canPlayLeisureAction(phase, spot.kind, arrived, motion);

  React.useEffect(() => {
    const keepLandedBallVisible = behavior.ball?.state === 'landed';
    onBallChange(
      actor.actorId,
      leisureActionReady || keepLandedBallVisible ? behavior.ball : null,
    );
  }, [actor.actorId, behavior.ball, leisureActionReady, onBallChange]);

  React.useEffect(() => () => onBallChange(actor.actorId, null), [actor.actorId, onBallChange]);

  React.useEffect(() => {
    if (!arrived || !spritesReady) return;
    const signature = `${phase}:${routeTarget?.id || ''}`;
    if (arrivalRef.current === signature) return;
    arrivalRef.current = signature;
    onArrive?.(actor, phase, routeTarget);
  }, [actor, arrived, onArrive, phase, routeTarget, spritesReady]);

  React.useEffect(() => {
    if (phase !== 'leisure' || !arrived || !spritesReady) return undefined;
    const delay = behavior.ball?.state === 'flight'
      ? behavior.duration
      : behavior.action === 'idle'
        ? 420
        : behavior.action === 'belly_slide'
          ? 40
          : behavior.duration;
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [advance, arrived, behavior.action, behavior.ball?.state, behavior.duration, phase, spritesReady]);

  const reporting = phase === 'reporting';
  const activityAction = leisureActionReady ? behavior.action : '';
  const renderAction = actorSpriteAction(phase, motion, displaySpot.kind, activityAction);
  const readingOnStool = renderAction === 'special' && actor.spriteVariant === 2;
  const frameSequence = readingOnStool ? [3] : actionFrameSequence(renderAction);

  React.useEffect(() => {
    setAnimationStep(0);
    if (!spritesReady || frameSequence.length === 1) return undefined;
    const oneShot = renderAction === 'basketball_shoot';
    const timer = window.setInterval(() => {
      setAnimationStep((step) => oneShot
        ? Math.min(step + 1, frameSequence.length - 1)
        : (step + 1) % frameSequence.length);
    }, ACTION_FRAME_MS[renderAction] || 420);
    return () => window.clearInterval(timer);
  }, [frameSequence.length, renderAction, spritesReady]);

  const animationFrame = frameSequence[Math.min(animationStep, frameSequence.length - 1)] || 1;
  const skatingLeft = renderAction === 'belly_slide' && motion.facing === 'left';
  const walking = motion.moving && motion.mode === 'walk' && activityAction !== 'belly_slide';
  const jumping = motion.moving && motion.mode === 'jump';
  const anticipating = motion.mode === 'anticipate';
  const settling = motion.mode === 'settle';
  return (
    <button
      type="button"
      className={`bot-world-actor phase-${phase} activity-${activityAction} sprite-frame-${animationFrame}${motion.moving ? ' is-moving' : ''}${walking ? ' is-walking' : ''}${jumping ? ` is-jumping is-jumping-${motion.jumpDirection}` : ''}${anticipating ? ' is-anticipating' : ''}${settling ? ' is-settling' : ''}${skatingLeft ? ' is-facing-left' : ''}`}
      style={{
        left: `${displaySpot.x * 100}%`,
        top: `${displaySpot.y * 100}%`,
        zIndex: Math.round(20 + displaySpot.y * 50),
        '--actor-move-ms': `${motion.duration}ms`,
        '--actor-depth-scale': 1,
        '--actor-label-bottom': renderAction === 'belly_slide' ? '58px' : '94px',
        '--sprite-action-scale': actionScale(
          actor.spriteVariant,
          spritesReady ? renderAction : 'idle',
          animationFrame,
        ),
      }}
      aria-disabled={!reporting}
      tabIndex={reporting ? 0 : -1}
      aria-label={reporting ? `${actor.label}，点击查看最终结果` : actor.label}
      onClick={reporting ? onOpenReport : undefined}
    >
      {progressText ? (
        <span className="bot-world-actor-progress" aria-live="polite">
          <span className="bot-world-actor-progress-text">{progressText}</span>
        </span>
      ) : null}
      <span className="bot-world-actor-visual" aria-hidden="true">
        <span className="bot-world-actor-label"><strong>{actor.label}</strong></span>
        <span className="bot-world-actor-shadow" />
        <img
          src={spritesReady
            ? actorSpriteSource(actor, phase, motion, displaySpot.kind, animationFrame, activityAction)
            : `assets/world/penguins/${actor.spriteKey}/idle_01.png`}
          alt=""
          draggable="false"
        />
      </span>
    </button>
  );
}

export function BotWorld({ workflow, task, stageRef, onOpenReport }) {
  const cast = React.useMemo(() => buildPenguinCast(workflow), [workflow]);
  const taskId = task?.taskId || task?.id || '';
  const [openedReportTaskId, setOpenedReportTaskId] = React.useState('');
  const [ballsByActor, setBallsByActor] = React.useState({});
  const [departingNodeIds, setDepartingNodeIds] = React.useState({});
  const [arrivals, setArrivals] = React.useState({});
  const [reportDepartures, setReportDepartures] = React.useState({});
  const [releasedSpots, setReleasedSpots] = React.useState({});
  const previousCurrentNodeRef = React.useRef('');

  const updateBall = React.useCallback((actorId, ball) => {
    setBallsByActor((current) => {
      if (!ball && !current[actorId]) return current;
      const next = { ...current };
      if (ball) next[actorId] = ball;
      else delete next[actorId];
      return next;
    });
  }, []);

  React.useEffect(() => {
    setOpenedReportTaskId('');
    setBallsByActor({});
    setDepartingNodeIds({});
    setArrivals({});
    setReportDepartures({});
    previousCurrentNodeRef.current = '';
  }, [taskId]);

  const reportDismissed = Boolean(taskId && openedReportTaskId === taskId);
  const visibleTask = task?.executionMode === 'bot' ? task : null;
  const actorNodeIds = cast.map((actor) => actor.nodeId);
  const serverCurrentNodeId = actorNodeIds.includes(String(visibleTask?.workflowRun?.current_node_id || ''))
    ? String(visibleTask.workflowRun.current_node_id)
    : '';
  const runStatus = String(visibleTask?.workflowRun?.status || visibleTask?.status || '').toLowerCase();
  // ponytail: handoff is one-way; the previous actor leaves as soon as the next actor starts.
  const pendingDepartureNodeId = runStatus !== 'done'
    && runStatus !== 'failed'
    && previousCurrentNodeRef.current
    && serverCurrentNodeId
    && previousCurrentNodeRef.current !== serverCurrentNodeId
      ? previousCurrentNodeRef.current
      : '';
  const waitingNodeId = runStatus !== 'done'
    && runStatus !== 'failed'
    && previousCurrentNodeRef.current
    && !serverCurrentNodeId
      ? previousCurrentNodeRef.current
      : '';

  React.useEffect(() => {
    if (runStatus === 'done' || runStatus === 'failed' || !serverCurrentNodeId) return;
    const previousNodeId = previousCurrentNodeRef.current;
    previousCurrentNodeRef.current = serverCurrentNodeId;
    if (!previousNodeId || previousNodeId === serverCurrentNodeId) return;
    setDepartingNodeIds((current) => ({ ...current, [previousNodeId]: true }));
  }, [runStatus, serverCurrentNodeId]);

  const actors = cast.map((actor) => {
    let phase = actorPhase(actor, visibleTask, reportDismissed, actorNodeIds);
    if (reportDismissed && reportDepartures[actor.actorId] && phase === 'leisure') {
      phase = 'walking_to_leisure';
    }
    if (phase !== 'reporting' && (
      departingNodeIds[actor.nodeId] || actor.nodeId === pendingDepartureNodeId
    )) {
      phase = 'walking_to_leisure';
    } else if (phase === 'leisure' && actor.nodeId === waitingNodeId) {
      phase = 'waiting';
    }
    const spot = actorSpot(actor, phase);
    const progressText = ['working', 'walking_to_table', 'waiting'].includes(phase)
      ? taskProgressText(visibleTask, actor.nodeId)
      : '';
    return { ...actor, phase, spot, progressText };
  }).filter((actor) => actor.phase !== 'hidden');
  const phaserCoffeeActor = actors.find((actor) => (
    actor.castIndex === 0
    && actor.phase === 'leisure'
    && actor.spot.kind === 'coffee'
  ));
  const phaserEnvironment = React.useMemo(() => ({
    balls: Object.entries(ballsByActor).map(([actorId, ball]) => ({ ...ball, actorId })),
  }), [ballsByActor]);
  const handlePhaserActorRelease = React.useCallback((actor, releaseSpot) => {
    if (!actor?.actorId || !releaseSpot) return;
    setReleasedSpots((current) => ({ ...current, [actor.actorId]: releaseSpot }));
  }, []);
  const reportReady = actors.some((actor) => actor.phase === 'reporting');

  const handleActorArrive = React.useCallback((actor, phase, reachedSpot) => {
    setArrivals((current) => ({
      ...current,
      [actor.actorId]: `${phase}:${reachedSpot?.id || ''}`,
    }));
    if (phase === 'walking_to_leisure' && reachedSpot?.kind !== 'table') {
      setDepartingNodeIds((current) => {
        if (!current[actor.nodeId]) return current;
        const next = { ...current };
        delete next[actor.nodeId];
        return next;
      });
      setReportDepartures((current) => {
        if (!current[actor.actorId]) return current;
        const next = { ...current };
        delete next[actor.actorId];
        return next;
      });
    }
  }, []);

  const reportingActorId = actors.find((actor) => actor.phase === 'reporting')?.actorId || '';

  const openReport = React.useCallback(() => {
    if (!reportReady || !visibleTask) return;
    setReportDepartures(reportingActorId ? { [reportingActorId]: true } : {});
    onOpenReport?.(visibleTask);
    setOpenedReportTaskId(taskId);
  }, [onOpenReport, reportReady, reportingActorId, taskId, visibleTask]);

  const allReportingArrived = reportReady && actors
    .filter((actor) => actor.phase === 'reporting')
    .every((actor) => arrivals[actor.actorId] === `reporting:${actor.spot.id}`);

  React.useEffect(() => {
    if (!allReportingArrived || reportDismissed) return undefined;
    const timer = window.setTimeout(openReport, 260);
    return () => window.clearTimeout(timer);
  }, [allReportingArrived, openReport, reportDismissed]);

  return (
    <div
      ref={stageRef}
      className="bot-world-map"
      style={{ backgroundImage: "url('assets/world/map-winter-park-tidy.png')" }}
      aria-label="Bot workflow winter park"
    >
      <div className="bot-world-map-tint" aria-hidden="true" />

      <React.Suspense fallback={null}>
        <BotWorldGame
          actor={phaserCoffeeActor || null}
          environment={phaserEnvironment}
          onActorRelease={handlePhaserActorRelease}
        />
      </React.Suspense>

      {actors.filter((actor) => actor.actorId !== phaserCoffeeActor?.actorId).map((actor) => (
        <PenguinActor
          key={`${actor.actorId}:${releasedSpots[actor.actorId]?.id || 'spawn'}`}
          actor={actor}
          phase={actor.phase}
          spot={actor.spot}
          initialSpot={releasedSpots[actor.actorId]}
          progressText={actor.progressText}
          onOpenReport={openReport}
          onBallChange={updateBall}
          onArrive={handleActorArrive}
        />
      ))}
    </div>
  );
}

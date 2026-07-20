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
  leisureBehaviorStep,
} from '../../lib/bot-scene.js';
import './BotWorld.css';

const BotWorldGame = React.lazy(() => import('./BotWorldGame.jsx').then((module) => ({
  default: module.BotWorldGame,
})));

const ACTION_FRAMES = {
  coffee_sit: [1, 2, 3, 4, 3, 2],
  // One full bounce: hand height -> floor contact -> hand height.
  basketball: [1, 2, 3, 4, 3, 2, 1, 8, 7, 8],
  basketball_shoot: [5, 6],
  basketball_pickup: [5, 6, 7, 8],
  belly_slide: [3, 4, 5, 6, 5, 4],
};

const ACTION_FRAME_MS = {
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
const VARIANT_VISUAL_SCALE = [1, 1, 1.22, 1];
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
  return Number((calibrated * (VARIANT_VISUAL_SCALE[spriteVariant - 1] || 1)).toFixed(3));
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

function useActorRoute(targetSpot, initialSpot = targetSpot) {
  const currentSpotRef = React.useRef(initialSpot);
  const [displaySpot, setDisplaySpot] = React.useState(initialSpot);
  const [motion, setMotion] = React.useState({ moving: false, direction: 'front', facing: 'right', frame: 1, duration: 0, mode: 'idle' });

  React.useEffect(() => {
    const route = actorRoute(currentSpotRef.current, targetSpot);
    let cancelled = false;
    let stepTimer = 0;
    let paintTimer = 0;
    let routeIndex = 0;
    const frames = window.setInterval(() => {
      setMotion((current) => current.moving
        ? { ...current, frame: (current.frame % 4) + 1 }
        : current);
    }, 180);

    function walkNextSegment() {
      if (cancelled || routeIndex >= route.length) {
        setMotion((current) => ({ ...current, moving: false, mode: 'idle' }));
        return;
      }
      const from = currentSpotRef.current;
      const to = route[routeIndex];
      routeIndex += 1;
      const jumpingUp = from?.id?.endsWith('_approach') && to?.id?.startsWith('coffee_seat_');
      const jumpingDown = from?.id?.startsWith('coffee_seat_') && to?.id?.endsWith('_approach');
      const jumpDirection = jumpingUp ? 'up' : jumpingDown ? 'down' : '';
      const duration = jumpingUp ? 900 : jumpingDown ? 780 : actorTravelDuration(from, to);
      setMotion({
        moving: true,
        direction: actorWalkDirection(from, to),
        facing: Number(to?.x || 0) < Number(from?.x || 0) ? 'left' : 'right',
        frame: 1,
        duration,
        mode: jumpDirection ? 'jump' : 'walk',
        jumpDirection,
      });
      paintTimer = window.setTimeout(() => {
        currentSpotRef.current = to;
        setDisplaySpot(to);
      }, 20);
      stepTimer = window.setTimeout(walkNextSegment, duration + 40);
    }

    walkNextSegment();
    return () => {
      cancelled = true;
      window.clearInterval(frames);
      window.clearTimeout(stepTimer);
      window.clearTimeout(paintTimer);
    };
  }, [targetSpot]);

  const arrived = !motion.moving && (
    currentSpotRef.current?.id === targetSpot?.id
    || (Math.abs((currentSpotRef.current?.x || 0) - (targetSpot?.x || 0)) < 0.001
      && Math.abs((currentSpotRef.current?.y || 0) - (targetSpot?.y || 0)) < 0.001)
  );
  return { displaySpot, motion, arrived };
}

function useLeisureBehavior(actor, phase, spot) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const behavior = React.useMemo(
    () => leisureBehaviorStep(spot.kind, stepIndex, actor.castIndex, spot),
    [actor.castIndex, spot, stepIndex],
  );

  React.useEffect(() => {
    if (phase !== 'leisure') setStepIndex(0);
  }, [phase]);

  const advance = React.useCallback(() => setStepIndex((step) => step + 1), []);
  return { behavior, advance };
}

function PenguinActor({ actor, phase, spot, onOpenReport, onBallChange }) {
  const [effectivePhase, setEffectivePhase] = React.useState(phase);
  const [animationStep, setAnimationStep] = React.useState(0);
  const previousPhaseRef = React.useRef(phase);
  const spritesReady = useActorSpritesReady(actor);

  React.useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (previousPhase === 'working' && phase === 'leisure') {
      setEffectivePhase('complete');
      const handoffTimer = window.setTimeout(() => setEffectivePhase('leisure'), 1100);
      return () => window.clearTimeout(handoffTimer);
    }
    setEffectivePhase(phase);
    return undefined;
  }, [phase]);

  const { behavior, advance } = useLeisureBehavior(actor, effectivePhase, spot);

  React.useEffect(() => {
    onBallChange(actor.actorId, effectivePhase === 'leisure' ? behavior.ball : null);
  }, [actor.actorId, behavior.ball, effectivePhase, onBallChange]);

  React.useEffect(() => () => onBallChange(actor.actorId, null), [actor.actorId, onBallChange]);

  const targetSpot = effectivePhase === 'complete'
    ? actorSpot(actor, 'working')
    : effectivePhase === 'leisure'
      ? behavior.spot
      : spot;
  const routeTarget = spritesReady ? targetSpot : actor.spawnSpot;
  const { displaySpot, motion, arrived } = useActorRoute(routeTarget, actor.spawnSpot);

  React.useEffect(() => {
    if (effectivePhase !== 'leisure' || !arrived || !spritesReady) return undefined;
    const delay = behavior.ball?.state === 'flight'
      ? behavior.duration
      : behavior.action === 'idle'
        ? 420
        : behavior.action === 'belly_slide'
          ? 180
          : behavior.duration;
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [advance, arrived, behavior.action, behavior.duration, effectivePhase, spritesReady]);

  const reporting = effectivePhase === 'reporting';
  const activityAction = effectivePhase === 'leisure' ? behavior.action : '';
  const renderAction = actorSpriteAction(effectivePhase, motion, displaySpot.kind, activityAction);
  const frameSequence = actionFrameSequence(renderAction);

  React.useEffect(() => {
    setAnimationStep(0);
    if (!spritesReady) return undefined;
    const oneShot = renderAction === 'basketball_shoot';
    const timer = window.setInterval(() => {
      setAnimationStep((step) => oneShot
        ? Math.min(step + 1, frameSequence.length - 1)
        : (step + 1) % frameSequence.length);
    }, ACTION_FRAME_MS[renderAction] || 420);
    return () => window.clearInterval(timer);
  }, [frameSequence.length, renderAction, spritesReady]);

  const animationFrame = frameSequence[Math.min(animationStep, frameSequence.length - 1)] || 1;
  const skatingLeft = activityAction === 'belly_slide' && motion.moving && motion.facing === 'left';
  const walking = motion.moving && motion.mode === 'walk' && activityAction !== 'belly_slide';
  const jumping = motion.moving && motion.mode === 'jump';
  return (
    <button
      type="button"
      className={`bot-world-actor phase-${effectivePhase} activity-${activityAction} sprite-frame-${animationFrame}${motion.moving ? ' is-moving' : ''}${walking ? ' is-walking' : ''}${jumping ? ` is-jumping is-jumping-${motion.jumpDirection}` : ''}${skatingLeft ? ' is-facing-left' : ''}`}
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
      <span className="bot-world-actor-visual" aria-hidden="true">
        <span className="bot-world-actor-label"><strong>{actor.label}</strong></span>
        <span className="bot-world-actor-shadow" />
        <img
          src={spritesReady
            ? actorSpriteSource(actor, effectivePhase, motion, displaySpot.kind, animationFrame, activityAction)
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
  }, [taskId]);

  const reportDismissed = Boolean(taskId && openedReportTaskId === taskId);
  const visibleTask = task?.executionMode === 'bot' ? task : null;
  const actorNodeIds = cast.map((actor) => actor.nodeId);
  const actors = cast.map((actor) => {
    const phase = actorPhase(actor, visibleTask, reportDismissed, actorNodeIds);
    return { ...actor, phase, spot: actorSpot(actor, phase) };
  }).filter((actor) => actor.phase !== 'hidden');
  const phaserCoffeeActor = actors.find((actor) => (
    actor.castIndex === 0
    && actor.phase === 'leisure'
    && actor.spot.kind === 'coffee'
  ));
  const phaserEnvironment = React.useMemo(() => ({
    balls: Object.entries(ballsByActor).map(([actorId, ball]) => ({ ...ball, actorId })),
  }), [ballsByActor]);
  const reportReady = actors.some((actor) => actor.phase === 'reporting');

  function openReport() {
    if (!reportReady || !visibleTask) return;
    onOpenReport?.(visibleTask);
    setOpenedReportTaskId(taskId);
  }

  return (
    <div
      ref={stageRef}
      className="bot-world-map"
      style={{ backgroundImage: "url('assets/world/map-winter-park-tidy.png')" }}
      aria-label="Bot workflow winter park"
    >
      <div className="bot-world-map-tint" aria-hidden="true" />

      <React.Suspense fallback={null}>
        <BotWorldGame actor={phaserCoffeeActor || null} environment={phaserEnvironment} />
      </React.Suspense>

      {actors.filter((actor) => actor.actorId !== phaserCoffeeActor?.actorId).map((actor) => (
        <PenguinActor
          key={actor.actorId}
          actor={actor}
          phase={actor.phase}
          spot={actor.spot}
          onOpenReport={openReport}
          onBallChange={updateBall}
        />
      ))}
    </div>
  );
}

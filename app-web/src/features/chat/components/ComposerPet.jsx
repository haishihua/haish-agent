import React from 'react';
import idle from '../../../../assets/ui/pet/idle.png';
import walk from '../../../../assets/ui/pet/walk.png';
import run from '../../../../assets/ui/pet/run.png';
import work from '../../../../assets/ui/pet/work.png';
import thinking from '../../../../assets/ui/pet/thinking.png';
import thinkingHold from '../../../../assets/ui/pet/thinking-hold-clean.png';
import cheer from '../../../../assets/ui/pet/cheer.png';
import sit from '../../../../assets/ui/pet/sit.png';
import sleep from '../../../../assets/ui/pet/sleep.png';
import jump from '../../../../assets/ui/pet/jump.png';
import dragLift from '../../../../assets/ui/pet/drag-lift.png';
import dragLand from '../../../../assets/ui/pet/drag-land.png';
import { nextPetCompletion, petTargetState } from '../model/pet-state.js';
import { readPetPosition, savePetPosition } from '../model/pet-position.js';
import { chooseIdleAction, idleRestDuration } from '../model/pet-idle.js';
import { jumpPoint, jumpTarget, pickerPlatform, platformEdge } from '../model/pet-obstacle.js';
import { REDUCED_MOTION_QUERY, prefersReducedMotion } from '../../../shared/lib/reduced-motion.js';
import './composer-pet.css';

const CLIPS = {
  idle: { sheet: idle, count: 1, frames: [0], ms: 190 },
  walk: { sheet: walk, count: 8, frames: [0, 1, 2, 3, 4, 5, 6, 7], ms: 145 },
  run: { sheet: run, count: 8, frames: [0, 1, 2, 3, 4, 5, 6, 7], ms: 95 },
  work: { sheet: work, count: 7, frames: [0, 1, 2, 3, 4, 5, 6], ms: 170 },
  thinkIn: { sheet: thinking, count: 8, frames: [0, 1, 2, 3, 4, 5], ms: 200 },
  thinkHold: { sheet: thinking, count: 8, frames: [5], ms: 200 },
  thinkOut: { sheet: thinking, count: 8, frames: [5, 6, 7], ms: 200 },
  cheer: { sheet: cheer, count: 8, frames: [0, 1, 2, 3, 4, 5, 6, 7], ms: 160 },
  sit: { sheet: sit, count: 5, frames: [0, 1, 2, 3, 4], ms: 210 },
  sitting: { sheet: sit, count: 5, frames: [4], ms: 210 },
  stand: { sheet: sit, count: 5, frames: [4, 3, 2, 1, 0], ms: 210 },
  lie: { sheet: sleep, count: 6, frames: [0, 5, 1], ms: 260 },
  sleeping: { sheet: sleep, count: 6, frames: [2, 3, 4], ms: 550 },
  wake: { sheet: sleep, count: 6, frames: [1, 5, 0], ms: 260 },
  dragLift: { sheet: dragLift, count: 6, frames: [0, 1, 2, 3, 4, 5], ms: 85 },
  dragLand: { sheet: dragLand, count: 6, frames: [0, 1, 2, 3, 4, 5], ms: 85 },
};

const PRELOAD_IMAGES = [idle, walk, run, work, thinking, thinkingHold, cheer, sit, sleep, jump, dragLift, dragLand];
let preloadPromise;
function preloadSprites() {
  if (!preloadPromise) {
    preloadPromise = Promise.all(PRELOAD_IMAGES.map((url) => new Promise((resolve) => {
      const preload = new Image();
      preload.onload = resolve;
      preload.onerror = resolve;
      preload.src = url;
      if (preload.complete) resolve();
    })));
  }
  return preloadPromise;
}

/** Decorative only: task state comes from the shell, never from animation timing. */
export function ComposerPet({ conversationId, runState, activityState, running, submitPending, task, projectObstacle = false }) {
  const [reducedMotion, setReducedMotion] = React.useState(prefersReducedMotion);
  const holder = React.useRef(null);
  const sprite = React.useRef(null);
  const jumpSprite = React.useRef(null);
  const elevation = React.useRef(0);
  const hit = React.useRef(null);
  const drag = React.useRef(null);
  const previous = React.useRef(null);
  const trackedTask = React.useRef(null);
  const position = React.useRef(22);
  const direction = React.useRef(1);
  const taskId = String(task?.taskId || task?.task_id || task?.id || '');
  const taskStatus = task?.status || '';
  const target = petTargetState({ runState, running, submitPending, activityState });
  const active = target !== 'idle';

  React.useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!query) return undefined;
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    const node = holder.current;
    const image = sprite.current;
    const jumpImage = jumpSprite.current;
    const form = node?.parentElement;
    if (!node || !image || !jumpImage || !form) return undefined;
    const current = { conversationId, taskId, taskStatus, active };
    const last = previous.current;
    const completion = nextPetCompletion(trackedTask.current, current);
    trackedTask.current = completion.tracked;
    const celebrate = completion.celebrate;
    const sameConversation = last?.conversationId === conversationId;
    if (!sameConversation) {
      const saved = readPetPosition();
      position.current = saved === null ? 22 : saved * Math.max(0, form.clientWidth - node.offsetWidth);
    }
    previous.current = current;
    const motion = { matches: reducedMotion };
    let disposed = false;
    let timer = null;
    let idleTimer = null;
    let movement = null;
    let rest = 'awake';
    let lastInput = Date.now();
    let nextRoam = lastInput + 5000;
    let restUntil = 0;
    let currentClip = '';
    let landedIdle = false;
    let lockedTransition = false;
    let lastMaxPosition = Math.max(0, form.clientWidth - node.offsetWidth);
    let jumping = null;
    let onPlatform = false;
    let loaded = false;
    preloadSprites().then(() => { if (!disposed) loaded = true; });

    function stopAnimation() {
      window.clearTimeout(timer);
      if (movement !== null) window.cancelAnimationFrame(movement);
      movement = null;
    }
    function maxPosition() {
      return Math.max(0, form.clientWidth - node.offsetWidth);
    }
    function place() {
      const max = maxPosition();
      const allowance = onPlatform ? node.offsetWidth * 26 / 120 : 0;
      position.current = Math.max(-allowance, Math.min(position.current, max + allowance));
      node.style.left = `${position.current}px`;
      node.style.transform = `translateY(${-elevation.current}px)`;
      return max;
    }
    function platform() {
      if (!projectObstacle) return null;
      const trigger = form.parentElement?.querySelector(':scope > .draft-project-picker .draft-project-trigger');
      const rect = form.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const footY = nodeRect.top + elevation.current + nodeRect.height * 146 / 155;
      return pickerPlatform(rect, trigger?.getBoundingClientRect(), node.offsetWidth, maxPosition(), footY);
    }
    function settle() {
      const max = place();
      const obstacle = platform();
      const center = position.current + node.offsetWidth / 2;
      const occupied = obstacle && center + obstacle.halfBody > obstacle.left && center - obstacle.halfBody < obstacle.right;
      onPlatform = Boolean(occupied && (elevation.current > 1 || jumping));
      if (occupied && !onPlatform) {
        const leftPosition = obstacle.left - obstacle.halfBody - node.offsetWidth / 2;
        const rightPosition = obstacle.right + obstacle.halfBody - node.offsetWidth / 2;
        const options = [leftPosition, rightPosition].filter((value) => value >= 0 && value <= max);
        if (options.length) position.current = options.reduce((a, b) => Math.abs(a - position.current) < Math.abs(b - position.current) ? a : b);
        else onPlatform = true;
      }
      elevation.current = onPlatform ? obstacle.height : 0;
      jumping = null;
      place();
    }
    function onResize() {
      const nextMax = maxPosition();
      if (nextMax !== lastMaxPosition && lastMaxPosition > 0 && !drag.current) {
        position.current = (position.current / lastMaxPosition) * nextMax;
      }
      lastMaxPosition = nextMax;
      if (jumping) { stopAnimation(); rest = 'awake'; play('idle'); settle(); }
      else if (onPlatform) settle();
      else place();
    }
    function play(name, { loop = false, done } = {}) {
      stopAnimation();
      currentClip = name;
      if (name !== 'idle') landedIdle = false;
      image.classList.remove('is-hidden');
      jumpImage.classList.add('is-hidden');
      const clip = name === 'idle' && landedIdle ? { ...CLIPS.dragLand, frames: [5] } : CLIPS[name];
      let frame = 0;
      image.classList.toggle('is-breathing', name === 'idle' && !motion?.matches);
      image.classList.toggle('is-thinking-hold', name === 'thinkHold' && !motion?.matches);
      image.style.backgroundImage = `url("${name === 'thinkHold' && !motion?.matches ? thinkingHold : clip.sheet}")`;
      image.style.backgroundSize = name === 'thinkHold' && !motion?.matches ? '100% 100%' : `${clip.count * 100}% 100%`;
      function draw() {
        if (disposed) return;
        const index = clip.frames[frame];
        image.style.backgroundPosition = clip.count === 1 ? '0% 0%' : `${index * 100 / (clip.count - 1)}% 0%`;
        if (motion?.matches) {
          const end = clip.frames[clip.frames.length - 1];
          image.style.backgroundPosition = clip.count === 1 ? '0% 0%' : `${end * 100 / (clip.count - 1)}% 0%`;
          done?.();
          return;
        }
        if (clip.frames.length === 1) { done?.(); return; }
        timer = window.setTimeout(() => {
          if (frame < clip.frames.length - 1) { frame += 1; draw(); }
          else if (loop) { frame = 0; draw(); }
          else done?.();
        }, clip.ms);
      }
      draw();
    }
    function roam(kind) {
      rest = kind;
      play(kind, { loop: true });
      let previousTime = null;
      let travelled = 0;
      const distance = Math.max(80, Math.min(380, maxPosition() * 0.8));
      const initialKind = kind;
      const poses = [1, 2, 3, 4, 6, 7, 8, 9, 10];
      function facing() {
        image.classList.toggle('is-facing-left', direction.current < 0);
        jumpImage.classList.toggle('is-facing-left', direction.current < 0);
      }
      function beginJump(obstacle, toTop) {
        const destination = jumpTarget(obstacle, direction.current, toTop);
        if (destination === null) { direction.current *= -1; facing(); return false; }
        jumping = { obstacle, toTop, from: position.current + node.offsetWidth / 2, destination, start: null };
        window.clearTimeout(timer);
        currentClip = 'jump';
        image.classList.remove('is-breathing', 'is-thinking-hold');
        image.classList.add('is-hidden');
        jumpImage.classList.remove('is-hidden');
        jumpImage.style.backgroundImage = `url("${jump}")`;
        jumpImage.style.backgroundSize = '1200% 100%';
        jumpImage.style.backgroundPosition = `${poses[0] * 100 / 11}% 0%`;
        return true;
      }
      function step(now) {
        if (disposed) return;
        const delta = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.06);
        previousTime = now;
        if (jumping) {
          if (jumping.start === null) jumping.start = now;
          const t = Math.min(1, (now - jumping.start) / 850);
          const point = jumpPoint(jumping.from, jumping.destination, jumping.obstacle.height, jumping.toTop, t);
          position.current = point.x - node.offsetWidth / 2;
          elevation.current = point.lift;
          place();
          jumpImage.style.backgroundPosition = `${poses[Math.min(poses.length - 1, Math.floor(t * poses.length))] * 100 / 11}% 0%`;
          if (t >= 1) {
            onPlatform = jumping.toTop;
            travelled += Math.abs(jumping.destination - jumping.from);
            kind = onPlatform ? 'walk' : initialKind;
            jumping = null;
            play(kind, { loop: true });
          }
        } else {
          const obstacle = platform();
          if (onPlatform && !obstacle) { onPlatform = false; elevation.current = 0; }
          const center = position.current + node.offsetWidth / 2;
          const speed = kind === 'walk' || onPlatform ? 48 : 112;
          const next = center + direction.current * speed * delta;
          if (obstacle && onPlatform) {
            elevation.current = obstacle.height;
            const edge = platformEdge(obstacle, direction.current);
            if (direction.current > 0 ? next >= edge : next <= edge) {
              position.current = edge - node.offsetWidth / 2;
              place();
              beginJump(obstacle, false);
              facing();
              movement = window.requestAnimationFrame(step);
              return;
            }
          } else if (obstacle) {
            const edge = direction.current > 0 ? obstacle.left - obstacle.halfBody : obstacle.right + obstacle.halfBody;
            const crossed = direction.current > 0 ? center <= edge && next >= edge : center >= edge && next <= edge;
            if (crossed) {
              position.current = edge - node.offsetWidth / 2;
              place();
              beginJump(obstacle, true);
              facing();
              movement = window.requestAnimationFrame(step);
              return;
            }
          }
          const before = position.current;
          position.current = next - node.offsetWidth / 2;
          const max = place();
          if (!onPlatform && position.current >= max) direction.current = -1;
          else if (!onPlatform && position.current <= 0) direction.current = 1;
          travelled += Math.abs(position.current - before);
          facing();
          if (travelled >= distance || max === 0) {
            rest = 'awake';
            image.classList.remove('is-facing-left');
            play('idle');
            nextRoam = Date.now();
            return;
          }
        }
        movement = window.requestAnimationFrame(step);
      }
      facing();
      movement = window.requestAnimationFrame(step);
    }
    function idleTick() {
      if (drag.current || disposed || target !== 'idle' || motion?.matches || lockedTransition) {
        if (!disposed && target === 'idle' && !motion?.matches) idleTimer = window.setTimeout(idleTick, 1000);
        return;
      }
      const elapsed = Date.now() - lastInput;
      const focused = form.contains(document.activeElement);
      if (!focused && ['sitting', 'sleeping'].includes(rest) && restUntil && Date.now() >= restUntil) {
        const wakeClip = rest === 'sitting' ? 'stand' : 'wake';
        rest = 'waking';
        restUntil = 0;
        play(wakeClip, { done: () => { rest = 'awake'; play('idle'); nextRoam = Date.now() + 1000; } });
      } else if (!focused && elapsed >= 4000 && Date.now() >= nextRoam && rest === 'awake' && currentClip === 'idle') {
        if (!loaded) { idleTimer = window.setTimeout(idleTick, 250); return; }
        const action = chooseIdleAction();
        if (action === 'walk' || action === 'run') {
          roam(action);
        } else {
          rest = action === 'sit' ? 'sitting' : 'sleeping';
          image.classList.remove('is-facing-left');
          play(action === 'sit' ? 'sit' : 'lie', {
            done: () => {
              restUntil = Date.now() + idleRestDuration(action);
              play(action === 'sit' ? 'sitting' : 'sleeping', { loop: action === 'sleep' });
            },
          });
        }
      }
      idleTimer = window.setTimeout(idleTick, 1000);
    }
    function onInput() {
      lastInput = Date.now();
      nextRoam = lastInput + 6000;
      if (target !== 'idle' || rest === 'awake') return;
      const was = rest;
      rest = 'awake';
      settle();
      restUntil = 0;
      image.classList.remove('is-facing-left');
      if (was === 'sitting') play('stand', { done: () => play('idle') });
      else if (was === 'sleeping') play('wake', { done: () => play('idle') });
      else play('idle');
    }
    function onDragStart(event) {
      if (!event.isPrimary || event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startPosition: position.current, animated: false };
      hit.current?.setPointerCapture(event.pointerId);
      hit.current?.classList.add('is-dragging');
      lastInput = Date.now();
      nextRoam = lastInput + 6000;
      if (target === 'idle' && !lockedTransition) {
        rest = 'awake';
        settle();
        restUntil = 0;
        image.classList.remove('is-facing-left');
        play('idle');
      }
    }
    function onDragMove(event) {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (!drag.current.animated && Math.abs(event.clientX - drag.current.startX) > 4 && !motion.matches && !lockedTransition && loaded) {
        drag.current.animated = true;
        rest = 'awake';
        restUntil = 0;
        image.classList.remove('is-facing-left');
        play('dragLift');
      }
      position.current = drag.current.startPosition + event.clientX - drag.current.startX;
      place();
      const obstacle = platform();
      const center = position.current + node.offsetWidth / 2;
      onPlatform = Boolean(obstacle && center + obstacle.halfBody > obstacle.left && center - obstacle.halfBody < obstacle.right);
      elevation.current = onPlatform ? obstacle.height : 0;
      place();
    }
    function onDragEnd(event) {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return;
      const { startPosition, animated } = drag.current;
      drag.current = null;
      if (event.type === 'pointerup' && Math.abs(position.current - startPosition) >= 2) {
        savePetPosition(position.current, maxPosition());
      }
      hit.current?.classList.remove('is-dragging');
      lastInput = Date.now();
      nextRoam = lastInput + 6000;
      if (animated) {
        play('dragLand', { done: () => {
          if (target === 'thinking') play('thinkHold');
          else if (target === 'working') play('work', { loop: true });
          else { landedIdle = true; play('idle'); }
        } });
      }
      if (hit.current?.hasPointerCapture(event.pointerId)) hit.current.releasePointerCapture(event.pointerId);
    }
    const dragHandle = hit.current;
    dragHandle?.addEventListener('pointerdown', onDragStart);
    dragHandle?.addEventListener('pointermove', onDragMove);
    dragHandle?.addEventListener('pointerup', onDragEnd);
    dragHandle?.addEventListener('pointercancel', onDragEnd);
    dragHandle?.addEventListener('lostpointercapture', onDragEnd);
    place();
    settle();
    image.classList.remove('is-facing-left');
    if (target === 'thinking') {
      if (sameConversation && last?.target !== 'thinking') play('thinkIn', { done: () => play('thinkHold') });
      else play('thinkHold');
    } else if (target === 'working') {
      play('work', { loop: true });
    } else if (celebrate) {
      lockedTransition = true;
      play('cheer', { done: () => { lockedTransition = false; play('idle'); } });
    } else play('idle');
    previous.current.target = target;
    if (target === 'idle') idleTimer = window.setTimeout(idleTick, 1000);
    form.addEventListener('input', onInput, true);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(form);
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      stopAnimation();
      window.clearTimeout(idleTimer);
      form.removeEventListener('input', onInput, true);
      dragHandle?.removeEventListener('pointerdown', onDragStart);
      dragHandle?.removeEventListener('pointermove', onDragMove);
      dragHandle?.removeEventListener('pointerup', onDragEnd);
      dragHandle?.removeEventListener('pointercancel', onDragEnd);
      dragHandle?.removeEventListener('lostpointercapture', onDragEnd);
      if (drag.current && dragHandle?.hasPointerCapture(drag.current.pointerId)) dragHandle.releasePointerCapture(drag.current.pointerId);
      drag.current = null;
      dragHandle?.classList.remove('is-dragging');
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [conversationId, taskId, taskStatus, active, target, reducedMotion, projectObstacle]);

  return <span className="composer-pet" ref={holder} aria-hidden="true"><span className="composer-pet-sprite" ref={sprite}><span className="composer-pet-thinking-dots"><i /><i /><i /></span></span><span className="composer-pet-sprite composer-pet-jump is-hidden" ref={jumpSprite} /><span className="composer-pet-hit" ref={hit} /></span>;
}

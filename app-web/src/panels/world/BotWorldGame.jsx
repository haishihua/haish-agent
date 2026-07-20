// @haish-esm
import React from 'react';
import Phaser from 'phaser';
import { basketballFlightPath } from '../../lib/bot-scene.js';
import { assertCoffeeSceneModel, COFFEE_SCENE } from './coffee-scene-model.js';

const FRAME_COUNTS = {
  idle: 4,
  walk_front: 4,
  walk_back: 4,
  walk_left: 4,
  walk_right: 4,
  coffee_sit: 8,
};

const ACTION_CONTENT_HEIGHTS = {
  idle: 193,
  'idle-once': 193,
  'walk-front': 193,
  'walk-back': 185,
  'walk-left': 178,
  'walk-right': 189,
  'coffee-making': 340,
  'hold-cup-seated': 332,
  'drink-seated': 332,
};

const BALL_CROPS = [
  { x: 224, y: 36, size: 69 },
  { x: 225, y: 71, size: 66 },
  { x: 228, y: 73, size: 66 },
  { x: 236, y: 26, size: 76 },
];

// CSS-pixel position of the ball held in basketball_shoot_05, measured from
// the actor's ground anchor. Phaser starts here as frame 06 takes over.
const BALL_RELEASE_OFFSETS = [
  { x: 21.3, y: -54.4 },
  { x: 22.1, y: -48.8 },
  { x: 19, y: -42.7 },
  { x: 21.1, y: -46.6 },
];

function frameKey(action, frame) {
  return `${action}-${String(frame).padStart(2, '0')}`;
}

class CoffeePrototypeScene extends Phaser.Scene {
  constructor(actor, environment, renderScale = 1) {
    super('bot-world-coffee-prototype');
    this.actorData = actor;
    this.environmentState = environment || {};
    this.renderScale = renderScale;
    this.route = [];
    this.onRouteComplete = null;
    this.debugVisible = false;
    this.ballSprites = new Map();
    this.seenBallFlights = new Set();
    this.actorActive = false;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  preload() {
    const spriteKey = this.actorData?.spriteKey || 'penguin_1';
    this.load.image('coffee-machine', 'assets/world/props/coffee-machine.png');
    this.load.image('coffee-make-side', 'assets/world/penguins/penguin_1/coffee_make_side.png');
    this.load.image('basketball-hoop', 'assets/world/props/basketball-hoop-court-aligned.png');
    BALL_CROPS.forEach((_, index) => {
      const variant = index + 1;
      this.load.image(
        `basketball-source-${variant}`,
        `assets/world/penguins/penguin_${variant}/basketball_shoot_06.png`,
      );
    });
    Object.entries(FRAME_COUNTS).forEach(([action, count]) => {
      for (let frame = 1; frame <= count; frame += 1) {
        this.load.image(
          frameKey(action, frame),
          `assets/world/penguins/${spriteKey}/${action}_${String(frame).padStart(2, '0')}.png`,
        );
      }
    });
  }

  create() {
    assertCoffeeSceneModel();
    this.cameras.main.setOrigin(0, 0).setZoom(this.renderScale);
    this.createAnimations();
    this.createEnvironment();
    this.shadow = this.add.ellipse(COFFEE_SCENE.spawn.x, COFFEE_SCENE.spawn.y + 3, 76, 20, 0x0b1421, 0.3)
      .setDepth(COFFEE_SCENE.spawn.y - 1);
    this.actor = this.add.sprite(COFFEE_SCENE.spawn.x, COFFEE_SCENE.spawn.y, frameKey('idle', 1))
      .setOrigin(0.5, 1)
      .setDepth(COFFEE_SCENE.spawn.y)
      .setInteractive()
      .on('pointerover', () => this.label?.setVisible(this.actorActive))
      .on('pointerout', () => this.label?.setVisible(false));
    this.label = this.add.text(COFFEE_SCENE.spawn.x, COFFEE_SCENE.spawn.y - 126, this.actorData?.label || '', {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#f8fbff',
      backgroundColor: 'rgba(11, 24, 42, 0.82)',
      padding: { x: 8, y: 5 },
    }).setOrigin(0.5, 1).setDepth(COFFEE_SCENE.spawn.y + 2).setVisible(false);

    this.debugGraphics = this.add.graphics().setDepth(3000).setVisible(false);
    this.input.keyboard?.on('keydown-D', this.toggleDebug, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-D', this.toggleDebug, this);
    });
    this.playLoop('idle');
    this.setActor(this.actorData);
    this.setEnvironmentState(this.environmentState);
  }

  createEnvironment() {
    const { coffeeMachine, hoop, lake } = COFFEE_SCENE.environment;

    this.lakeSheen = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.lakeSheen.fillStyle(0x9edcff, 0.055).fillPoints(lake.polygon, true);
    this.lakeSheen.lineStyle(2, 0xdaf4ff, 0.16).strokePoints(lake.polygon, true);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: this.lakeSheen,
        alpha: { from: 0.48, to: 0.9 },
        duration: 2400,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
    this.lakeSparkles = [
      { x: 250, y: 600, width: 46 },
      { x: 420, y: 688, width: 62 },
      { x: 310, y: 778, width: 54 },
    ].map((item, index) => {
      const sparkle = this.add.ellipse(item.x, item.y, item.width, 3, 0xdff7ff, 0.26)
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(-0.22 + index * 0.18);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: sparkle,
          alpha: { from: 0.08, to: 0.48 },
          scaleX: { from: 0.65, to: 1.15 },
          duration: 1600 + index * 320,
          delay: index * 360,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      }
      return sparkle;
    });
    this.coffeeGlow = this.add.ellipse(coffeeMachine.x, coffeeMachine.y - 9, 120, 30, 0x7ad8ff, 0)
      .setDepth(202)
      .setBlendMode(Phaser.BlendModes.ADD);
    const machineSource = this.textures.get('coffee-machine').getSourceImage();
    const machineShear = coffeeMachine.perspectiveShear;
    const machinePad = Math.ceil(Math.abs(machineShear) * machineSource.width);
    const machineOffsetY = machineShear < 0 ? machinePad : 0;
    const machinePerspectiveKey = 'coffee-machine-counter-perspective';
    if (!this.textures.exists(machinePerspectiveKey)) {
      const perspectiveTexture = this.textures.createCanvas(
        machinePerspectiveKey,
        machineSource.width,
        machineSource.height + machinePad,
      );
      perspectiveTexture.context.setTransform(1, machineShear, 0, 1, 0, machineOffsetY);
      perspectiveTexture.context.drawImage(machineSource, 0, 0);
      perspectiveTexture.refresh();
    }
    const machineBaseY = (
      (machineSource.height * 0.975)
      + (machineShear * machineSource.width / 2)
      + machineOffsetY
    );
    this.coffeeMachine = this.add.image(coffeeMachine.x, coffeeMachine.y, machinePerspectiveKey)
      .setOrigin(0.5, machineBaseY / (machineSource.height + machinePad))
      .setDepth(205);
    const coffeeScale = coffeeMachine.height / machineSource.height;
    this.coffeeMachineBaseScaleX = -coffeeScale;
    this.coffeeMachineBaseScaleY = coffeeScale;
    this.coffeeMachine.setScale(this.coffeeMachineBaseScaleX, this.coffeeMachineBaseScaleY);
    this.coffeeLight = this.add.circle(coffeeMachine.x + 27, coffeeMachine.y - 69, 3.6, 0x74f7b1, 0.72)
      .setDepth(210)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.coffeeStream = this.add.rectangle(
      coffeeMachine.nozzle.x,
      coffeeMachine.nozzle.y,
      5,
      coffeeMachine.cup.y - coffeeMachine.nozzle.y,
      0x8d4825,
      0.96,
    )
      .setStrokeStyle(1, 0xe4a56a, 0.72)
      .setOrigin(0.5, 0)
      .setScale(1, 0)
      .setDepth(327);
    this.coffeeSteam = [0, 1, 2].map((index) => this.add.circle(
      coffeeMachine.cup.x - 5 + index * 5,
      coffeeMachine.cup.y - 14,
      3.2 - index * 0.45,
      0xf4fbff,
      0,
    ).setDepth(327).setBlendMode(Phaser.BlendModes.ADD));
    this.hoopImage = this.add.image(hoop.x, hoop.y, 'basketball-hoop')
      .setOrigin(0.5, 1)
      .setDepth(220);
    const hoopScale = hoop.height / this.hoopImage.height;
    this.hoopImage.setScale(hoopScale);
    this.hoopBaseX = hoop.x;
  }

  runCoffeeMachineCycle(onComplete) {
    if (this.coffeeBusy || !this.coffeeMachine) return;
    this.coffeeBusy = true;
    this.tweens.killTweensOf([
      this.coffeeMachine,
      this.coffeeGlow,
      this.coffeeLight,
      this.coffeeStream,
      ...this.coffeeSteam,
    ]);
    this.coffeeMachine.setScale(this.coffeeMachineBaseScaleX, this.coffeeMachineBaseScaleY);
    this.coffeeStream.setScale(1, 0);
    this.coffeeSteam.forEach((steam, index) => steam
      .setPosition(
        COFFEE_SCENE.environment.coffeeMachine.cup.x - 5 + index * 5,
        COFFEE_SCENE.environment.coffeeMachine.cup.y - 14,
      )
      .setAlpha(0)
      .setScale(1));
    this.tweens.add({
      targets: this.coffeeMachine,
      scaleX: this.coffeeMachineBaseScaleX * 1.018,
      scaleY: this.coffeeMachineBaseScaleY * 0.992,
      duration: 120,
      yoyo: true,
      repeat: 1,
    });
    this.tweens.add({
      targets: this.coffeeGlow,
      alpha: 0.54,
      scaleX: 1.18,
      duration: 220,
      yoyo: true,
      repeat: 2,
    });
    this.tweens.add({
      targets: this.coffeeLight,
      alpha: { from: 0.45, to: 1 },
      scale: { from: 0.8, to: 1.45 },
      duration: 160,
      yoyo: true,
      repeat: 3,
    });
    this.tweens.add({
      targets: this.coffeeStream,
      scaleY: 1,
      duration: 170,
      hold: this.reducedMotion ? 280 : 1100,
      yoyo: true,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.coffeeSteam.forEach((steam, index) => {
          this.tweens.add({
            targets: steam,
            alpha: { from: 0.7, to: 0 },
            y: steam.y - 24,
            scale: 1.7,
            delay: index * 110,
            duration: this.reducedMotion ? 420 : 900,
            ease: 'Sine.easeOut',
            onComplete: index === this.coffeeSteam.length - 1 ? () => {
              this.coffeeBusy = false;
              onComplete?.();
            } : undefined,
          });
        });
      },
    });
  }

  resetCoffeeInteraction() {
    this.coffeeBusy = false;
    this.tweens.killTweensOf([
      this.actor,
      this.coffeeStream,
      ...this.coffeeSteam,
    ]);
    this.actor?.setAngle(0);
    this.coffeeStream?.setScale(1, 0);
    this.coffeeSteam?.forEach((steam) => steam.setAlpha(0));
  }

  setEnvironmentState(environment = {}) {
    this.environmentState = environment;
    if (!this.hoopImage) return;
    const activeKeys = new Set();
    (environment.balls || []).forEach((ball) => {
      const key = `${ball.actorId || ball.spriteKey}:${ball.key}`;
      activeKeys.add(key);
      if (ball.state === 'flight' && !this.seenBallFlights.has(key)) {
        this.seenBallFlights.add(key);
        this.playBallFlight(ball, key);
      } else if (ball.state === 'landed') {
        this.ensureLandedBall(ball, key);
      }
    });
    this.ballSprites.forEach((sprite, key) => {
      if (!activeKeys.has(key)) {
        this.tweens.killTweensOf(sprite);
        sprite.destroy();
        this.ballSprites.delete(key);
        this.seenBallFlights.delete(key);
      }
    });
  }

  createBallSprite(ball, key) {
    const crop = BALL_CROPS[(ball.spriteVariant || 1) - 1] || BALL_CROPS[0];
    const sprite = this.add.image(0, 0, `basketball-source-${ball.spriteVariant || 1}`)
      .setCrop(crop.x, crop.y, crop.size, crop.size)
      .setOrigin(0.5)
      .setScale(24 / crop.size)
      .setDepth(240);
    this.ballSprites.set(key, sprite);
    return sprite;
  }

  pointFromRatio(point) {
    return {
      x: point.x * COFFEE_SCENE.size.width,
      y: point.y * COFFEE_SCENE.size.height,
    };
  }

  ensureLandedBall(ball, key) {
    const landing = this.pointFromRatio(ball.landing);
    const sprite = this.ballSprites.get(key) || this.createBallSprite(ball, key);
    this.tweens.killTweensOf(sprite);
    sprite.setPosition(landing.x, landing.y).setRotation(0).setDepth(240).setVisible(true);
  }

  playBallFlight(ball, key) {
    const start = this.pointFromRatio(ball.start);
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const releaseOffset = BALL_RELEASE_OFFSETS[(ball.spriteVariant || 1) - 1] || BALL_RELEASE_OFFSETS[0];
    // The Phaser camera is zoomed by renderScale for HiDPI output. Convert the
    // measured CSS hand offset back through that zoom exactly once.
    start.x += releaseOffset.x * COFFEE_SCENE.size.width / canvasRect.width / this.renderScale;
    start.y += releaseOffset.y * COFFEE_SCENE.size.height / canvasRect.height / this.renderScale;
    const landing = this.pointFromRatio(ball.landing);
    const rim = this.pointFromRatio(ball.hoop);
    const sprite = this.ballSprites.get(key) || this.createBallSprite(ball, key);
    sprite.setPosition(start.x, start.y).setDepth(240).setVisible(!ball.releaseDelay);
    const progress = { value: 0 };
    let feedbackPlayed = false;
    const trajectory = basketballFlightPath(start, rim, landing, ball.outcome);
    this.tweens.add({
      targets: progress,
      value: 1,
      delay: ball.releaseDelay || 0,
      duration: this.reducedMotion ? 900 : 1850,
      ease: 'Linear',
      onStart: () => sprite.setVisible(true),
      onUpdate: () => {
        const t = progress.value;
        if (t >= trajectory.contactProgress) {
          if (!feedbackPlayed) {
            feedbackPlayed = true;
            this.animateHoopResult(ball.outcome);
          }
          if (ball.outcome === 'hit') sprite.setDepth(218);
        }
        const cursor = t * (trajectory.points.length - 1);
        const index = Math.floor(cursor);
        const nextIndex = Math.min(index + 1, trajectory.points.length - 1);
        const mix = cursor - index;
        const point = trajectory.points[index];
        const nextPoint = trajectory.points[nextIndex];
        sprite.setPosition(
          Phaser.Math.Linear(point.x, nextPoint.x, mix),
          Phaser.Math.Linear(point.y, nextPoint.y, mix),
        );
        sprite.setRotation(0);
      },
      onComplete: () => sprite.setPosition(landing.x, landing.y).setRotation(0).setDepth(240),
    });
  }

  animateHoopResult(outcome) {
    this.tweens.killTweensOf(this.hoopImage);
    this.hoopImage.x = this.hoopBaseX;
    if (outcome === 'miss') {
      this.tweens.add({
        targets: this.hoopImage,
        x: '+=5',
        duration: 70,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          this.hoopImage.x = this.hoopBaseX;
        },
      });
    }
  }

  createAnimations() {
    const create = (key, action, frameRate, repeat, frames = null) => {
      this.anims.create({
        key,
        frames: (frames || Array.from({ length: FRAME_COUNTS[action] }, (_, index) => index + 1))
          .map((frame) => ({ key: frameKey(action, frame) })),
        frameRate,
        repeat,
      });
    };
    create('idle', 'idle', 2, -1);
    create('idle-once', 'idle', 2, 0);
    create('walk-front', 'walk_front', 6, -1);
    create('walk-back', 'walk_back', 6, -1);
    create('walk-left', 'walk_left', 6, -1);
    create('walk-right', 'walk_right', 6, -1);
    this.anims.create({ key: 'coffee-making', frames: [{ key: 'coffee-make-side' }], frameRate: 1, repeat: -1 });
    create('hold-cup-seated', 'coffee_sit', 1, -1, [1]);
    create('drink-seated', 'coffee_sit', 3, 1, [1, 2, 3, 4, 3, 2]);
  }

  setActor(actor) {
    this.actorData = actor;
    if (!this.actor) return;
    const shouldStart = Boolean(actor) && !this.actorActive;
    this.actorActive = Boolean(actor);
    [this.actor, this.shadow].forEach((item) => item.setVisible(this.actorActive));
    this.label.setVisible(false);
    if (!actor) {
      this.route = [];
      this.onRouteComplete = null;
      this.actorMoveTween?.stop();
      this.actorMoveTween = null;
      this.resetCoffeeInteraction();
      return;
    }
    this.label.setText(actor.label);
    if (shouldStart) {
      this.actor.setPosition(COFFEE_SCENE.spawn.x, COFFEE_SCENE.spawn.y);
      this.playLoop('idle');
      this.syncAttachments();
      this.beginCoffeeLoop();
    }
  }

  beginCoffeeLoop() {
    if (!this.actorActive) return;
    this.state = 'path_to_seat_approach';
    this.follow(COFFEE_SCENE.routes.toSeat, () => this.jumpToSeat());
  }

  jumpToSeat() {
    if (!this.actorActive) return;
    this.state = 'jump_to_seat';
    this.playLoop('idle');
    this.jumpBetween(COFFEE_SCENE.seat.approach, COFFEE_SCENE.seat.use, 44, 720, () => {
      if (!this.actorActive) return;
      this.state = 'brewing_coffee';
      this.playLoop('coffee-making');
      this.runCoffeeMachineCycle(() => {
        if (!this.actorActive) return;
        this.state = 'seated_drinking';
        this.playOnce('drink-seated', () => this.jumpFromSeat());
      });
    });
  }

  jumpFromSeat() {
    if (!this.actorActive) return;
    this.state = 'jump_from_seat';
    this.playLoop('idle');
    this.jumpBetween(COFFEE_SCENE.seat.use, COFFEE_SCENE.seat.approach, 34, 560, () => {
      this.state = 'path_from_seat';
      this.follow(COFFEE_SCENE.routes.seatToSpawn, () => {
        this.state = 'leisure_idle';
        this.playOnce('idle-once', () => this.beginCoffeeLoop());
      });
    });
  }

  jumpBetween(from, to, height, duration, onComplete) {
    this.route = [];
    const progress = { value: 0 };
    this.actorMoveTween = this.tweens.add({
      targets: progress,
      value: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = progress.value;
        this.actor.x = Phaser.Math.Linear(from.x, to.x, t);
        this.actor.y = Phaser.Math.Linear(from.y, to.y, t) - Math.sin(Math.PI * t) * height;
        this.syncAttachments();
      },
      onComplete: () => {
        this.actorMoveTween = null;
        if (!this.actorActive) return;
        this.actor.setPosition(to.x, to.y);
        this.syncAttachments();
        onComplete();
      },
    });
  }

  follow(points, onComplete) {
    this.route = points.map((point) => ({ ...point }));
    this.onRouteComplete = onComplete;
    this.drawDebug();
  }

  playLoop(animation) {
    this.actor.play(animation, true);
    this.applyStableVisualHeight(animation);
  }

  playOnce(animation, onComplete) {
    this.actor.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.actorActive) onComplete();
    });
    this.actor.play(animation, true);
    this.applyStableVisualHeight(animation);
  }

  applyStableVisualHeight(animation) {
    const targetHeight = 88;
    const contentHeight = ACTION_CONTENT_HEIGHTS[animation] ?? ACTION_CONTENT_HEIGHTS.idle;
    const scale = targetHeight / contentHeight;
    this.actor.setScale(scale);
    this.actorVisualHeight = targetHeight;
  }

  update(_time, delta) {
    if (!this.actor || this.route.length === 0) return;
    const target = this.route[0];
    const dx = target.x - this.actor.x;
    const dy = target.y - this.actor.y;
    const distance = Math.hypot(dx, dy);
    const step = COFFEE_SCENE.speed * Math.min(delta, 40) / 1000;
    if (distance <= step) {
      this.actor.setPosition(target.x, target.y);
      this.route.shift();
      if (this.route.length === 0) {
        this.playLoop('idle');
        const complete = this.onRouteComplete;
        this.onRouteComplete = null;
        this.syncAttachments();
        complete?.();
        return;
      }
    } else {
      this.actor.x += (dx / distance) * step;
      this.actor.y += (dy / distance) * step;
    }
    this.playWalkDirection(dx, dy);
    this.syncAttachments();
  }

  playWalkDirection(dx, dy) {
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const animation = horizontal
      ? dx < 0 ? 'walk-left' : 'walk-right'
      : dy < 0 ? 'walk-back' : 'walk-front';
    if (this.actor.anims.currentAnim?.key !== animation) {
      this.actor.play(animation, true);
      this.applyStableVisualHeight(animation);
    }
  }

  syncAttachments() {
    if (!this.actorActive) return;
    const depth = Math.round(this.actor.y);
    const labelOffsetX = this.state === 'brewing_coffee' || this.state === 'seated_drinking' ? 100 : 0;
    this.actor.setDepth(depth);
    this.shadow.setPosition(this.actor.x, this.actor.y + 3).setDepth(depth - 1);
    this.label.setPosition(
      this.actor.x + labelOffsetX,
      this.actor.y - this.actorVisualHeight - 12,
    ).setDepth(depth + 2);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugGraphics.setVisible(this.debugVisible);
    this.drawDebug();
  }

  drawDebug() {
    if (!this.debugGraphics) return;
    const graphics = this.debugGraphics.clear();
    if (!this.debugVisible) return;
    graphics.fillStyle(0x45d483, 0.13);
    COFFEE_SCENE.walkable.forEach((polygon) => graphics.fillPoints(polygon, true));
    graphics.fillStyle(0xff5f6d, 0.2);
    COFFEE_SCENE.blockers.forEach((blocker) => graphics.fillRect(blocker.x, blocker.y, blocker.width, blocker.height));
    graphics.lineStyle(5, 0x66d9ff, 0.9);
    graphics.strokePoints([{ x: this.actor.x, y: this.actor.y }, ...this.route], false);
    graphics.fillStyle(0xffd166, 1);
    [COFFEE_SCENE.seat.approach, COFFEE_SCENE.seat.use]
      .forEach((point) => graphics.fillCircle(point.x, point.y, 8));
  }
}

export function BotWorldGame({ actor, environment }) {
  const hostRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const initialActorRef = React.useRef(actor);
  const initialEnvironmentRef = React.useRef(environment);

  React.useEffect(() => {
    if (!hostRef.current) return undefined;
    const renderScale = Math.min(window.devicePixelRatio || 1, 2);
    const scene = new CoffeePrototypeScene(
      initialActorRef.current,
      initialEnvironmentRef.current,
      renderScale,
    );
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: COFFEE_SCENE.size.width * renderScale,
      height: COFFEE_SCENE.size.height * renderScale,
      transparent: true,
      antialias: true,
      render: { pixelArt: false, roundPixels: false },
      scene,
      audio: { noAudio: true },
    });
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  React.useEffect(() => {
    sceneRef.current?.setActor(actor);
  }, [actor]);

  React.useEffect(() => {
    sceneRef.current?.setEnvironmentState(environment);
  }, [environment]);

  return <div ref={hostRef} className="bot-world-game-layer" aria-hidden="true" />;
}

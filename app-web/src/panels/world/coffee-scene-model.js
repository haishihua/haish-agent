// @haish-esm

export const COFFEE_SCENE = {
  size: { width: 1536, height: 1024 },
  speed: 105,
  environment: {
    coffeeMachine: {
      x: 369,
      y: 282,
      height: 102,
      perspectiveShear: 0.12,
      // The machine stays fully supported by the counter. Product reaches up
      // from the stool. Its base follows the counter's perspective line.
      nozzle: { x: 369, y: 247 },
      cup: { x: 369, y: 278 },
    },
    hoop: {
      // Keep the weighted base centered on the grey apron beyond the end line;
      // only the backboard and rim project over the playing surface.
      x: 1150,
      y: 251,
      height: 195,
      // Visual centre of the orange rim inside the transparent hoop asset.
      rim: { x: 1098, y: 177 },
    },
    lake: {
      polygon: [
        { x: 126, y: 540 }, { x: 238, y: 492 }, { x: 410, y: 486 },
        { x: 574, y: 535 }, { x: 650, y: 642 }, { x: 612, y: 760 },
        { x: 470, y: 838 }, { x: 266, y: 850 }, { x: 108, y: 782 },
        { x: 68, y: 658 },
      ],
    },
  },
  spawn: { x: 620, y: 438 },
  seat: {
    // The coffee bar is closed: the penguin stays on the public pavement,
    // approaches the stool from below and hops onto the visible seat.
    approach: { x: 432, y: 421 },
    use: { x: 397, y: 326 },
  },
  routes: {
    toSeat: [
      { x: 590, y: 432 },
      { x: 535, y: 425 },
      { x: 480, y: 420 },
      { x: 432, y: 421 },
    ],
    seatToSpawn: [
      { x: 480, y: 420 },
      { x: 535, y: 425 },
      { x: 590, y: 432 },
      { x: 620, y: 438 },
    ],
  },
  walkable: [
    // Public pavement in front of the bar. There is no route behind the bar.
    [{ x: 195, y: 390 }, { x: 642, y: 326 }, { x: 688, y: 390 }, { x: 640, y: 470 }, { x: 180, y: 484 }],
  ],
  blockers: [
    { id: 'counter-front', x: 38, y: 286, width: 565, height: 128 },
    { id: 'west-stool', x: 215, y: 350, width: 76, height: 100 },
    { id: 'middle-stool', x: 302, y: 326, width: 74, height: 96 },
  ],
};

export function assertCoffeeSceneModel(scene = COFFEE_SCENE) {
  const points = [
    scene.spawn,
    scene.seat.approach,
    scene.seat.use,
    scene.environment.coffeeMachine,
    scene.environment.coffeeMachine.nozzle,
    scene.environment.coffeeMachine.cup,
    scene.environment.hoop,
    scene.environment.hoop.rim,
    ...scene.environment.lake.polygon,
  ]
    .concat(scene.routes.toSeat, scene.routes.seatToSpawn);
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('Coffee scene contains an invalid coordinate.');
  }
  const seatEnd = scene.routes.toSeat.at(-1);
  if (seatEnd.x !== scene.seat.approach.x || seatEnd.y !== scene.seat.approach.y) {
    throw new Error('Coffee seat route must end at its approach point.');
  }
  const returnEnd = scene.routes.seatToSpawn.at(-1);
  if (returnEnd.x !== scene.spawn.x || returnEnd.y !== scene.spawn.y) {
    throw new Error('Coffee return route must end at the spawn point.');
  }
  return true;
}

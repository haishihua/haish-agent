// Sprite component supporting two atlas modes:
//   1. grid mode  – uniform 8×4 cells of 160×160 (used for okabe/lelouch/mikey).
//   2. frame mode – each character supplies an explicit `frames` array of
//      pixel boxes [x, y, w, h] referenced by `idle/walk/poses` indices. This
//      lets us render directly from the action-design sheets the user dropped
//      into `assets/atlases/` without re-cropping them.

const ATLAS_W = 1280;
const ATLAS_H = 640;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;

const P = (think, busy, report, llm, tool, mcp, skill, deliver) => ({
  think, busy, report, llm, tool, mcp, skill, deliver,
});

const SIDE_SPRITE_FACING = {
  gojo: 'left',
  guts: 'left',
  lelouch: 'left',
};

const SIDE_IDLE_FACING = {};

// helper: build a frame-mode entry. frames are { idx -> [x,y,w,h] } where idx
// is whatever number appears in idle/walk/poses. We use the same numeric keys
// that grid mode would use so resolvePose's slot constants (24..31) keep working.
const F = (x, y, x2, y2) => [x, y, x2 - x, y2 - y];

const GOJO_FRAMES = {
  // Row 0 — front idle + 5 variants
  0: F(367, 43, 482, 299),
  1: F(595, 42, 711, 294),
  2: F(820, 42, 941, 294),
  3: F(1039, 42, 1161, 294),
  4: F(1265, 42, 1388, 294),
  5: F(1487, 42, 1609, 294),
  // Row 1 — idle_side + walk_side
  8: F(283, 331, 383, 566),
  9: F(472, 337, 629, 562),
  10: F(685, 340, 823, 562),
  11: F(922, 343, 1070, 557),
  12: F(1129, 343, 1283, 566),
  13: F(1347, 347, 1503, 567),
  14: F(1550, 351, 1709, 568),
  // Row 2 — idle_back + walk_back
  16: F(284, 590, 393, 826),
  17: F(481, 591, 589, 826),
  18: F(695, 593, 806, 826),
  19: F(922, 593, 1031, 826),
  20: F(1146, 592, 1251, 826),
  21: F(1363, 593, 1472, 826),
  22: F(1577, 594, 1687, 826),
  // Row 3 — 8 special poses
  24: F(280, 872, 388, 1116),   // think — hand at face
  25: F(466, 871, 579, 1116),   // busy — hand back-of-head
  26: F(657, 877, 787, 1117),   // report — hand on hip / talking
  27: F(1249, 870, 1356, 1116), // llm — looking up
  28: F(882, 877, 989, 1116),   // tool — hand at chest
  29: F(1072, 878, 1177, 1116), // mcp — standing default
  30: F(1437, 878, 1575, 1116), // skill — fight stance
  31: F(1628, 867, 1734, 1116), // deliver — final pose
};

const KURISU_FRAMES = {
  // Row 0 — front idle + walk
  0: F(155, 42, 240, 226),
  1: F(355, 42, 446, 226),
  2: F(560, 42, 654, 226),
  3: F(740, 42, 832, 226),
  4: F(925, 42, 1024, 226),
  5: F(1108, 42, 1200, 226),
  6: F(1283, 42, 1383, 226),
  // Row 1 — side idle + walk
  8: F(150, 261, 235, 436),
  9: F(343, 261, 461, 436),
  10: F(560, 261, 678, 436),
  11: F(740, 261, 861, 436),
  12: F(933, 261, 1044, 436),
  13: F(1110, 261, 1232, 436),
  14: F(1300, 261, 1415, 436),
  // Row 2 — back idle + walk
  16: F(155, 470, 240, 648),
  17: F(355, 470, 444, 648),
  18: F(560, 470, 651, 648),
  19: F(748, 470, 840, 648),
  20: F(940, 470, 1027, 648),
  21: F(1124, 470, 1222, 648),
  22: F(1310, 470, 1402, 648),
  // Row 3 — 8 action poses
  24: F(760, 680, 840, 870),    // think — hand at face
  25: F(1130, 680, 1216, 870),  // busy — hand on hip
  26: F(343, 680, 446, 870),    // report — gesturing
  27: F(945, 680, 1030, 870),   // llm — looking up
  28: F(556, 680, 646, 870),    // tool — presenting
  29: F(157, 680, 235, 870),    // mcp — idle hand fwd
  30: F(1306, 680, 1390, 870),  // skill — hand on hip variant
  31: F(1467, 680, 1558, 870),  // deliver — confident pose
};

const LEVI_FRAMES = {
  // Row 0 — 7 front sprites (idle + 6 walk)
  0: F(85, 42, 200, 244),
  1: F(300, 42, 414, 244),
  2: F(505, 42, 618, 244),
  3: F(700, 42, 813, 244),
  4: F(895, 42, 1009, 244),
  5: F(1093, 42, 1204, 244),
  6: F(1293, 42, 1405, 244),
  // Row 1 — 1 idle + 5 walk side
  8: F(94, 265, 190, 460),
  9: F(258, 265, 438, 460),
  10: F(500, 265, 656, 460),
  11: F(724, 265, 863, 460),
  12: F(931, 265, 1085, 460),
  13: F(1121, 265, 1265, 460),
  // Row 2 — 7 back sprites
  16: F(94, 472, 198, 673),
  17: F(313, 472, 415, 673),
  18: F(516, 472, 617, 673),
  19: F(719, 472, 820, 673),
  20: F(920, 472, 1022, 673),
  21: F(1125, 472, 1227, 673),
  22: F(1325, 472, 1426, 673),
  // Row 3 — action poses (skip [0] head portrait at x=53..225)
  24: F(264, 685, 471, 882),    // think — spinning maneuver
  25: F(806, 685, 1010, 882),   // busy — sword combat
  26: F(1490, 685, 1631, 882),  // report — dual blade calm
  27: F(495, 685, 714, 882),    // llm — crouched ready
  28: F(1267, 685, 1445, 882),  // tool — sword stance
  29: F(1049, 685, 1243, 882),  // mcp — sword swing
  30: F(264, 685, 471, 882),    // skill — spinning maneuver
  31: F(1490, 685, 1631, 882),  // deliver — dual blade
};

const ITACHI_FRAMES = {
  // Row 0 — 3 front idle + 6 side walk variants
  0: F(35, 16, 134, 206),
  1: F(228, 16, 326, 206),
  2: F(421, 16, 519, 206),
  3: F(228, 16, 326, 206),
  4: F(35, 16, 134, 206),
  5: F(228, 16, 326, 206),
  // Row 0 right half — 6 side walks with cape
  8: F(632, 16, 779, 206),
  9: F(820, 16, 950, 206),
  10: F(998, 16, 1131, 206),
  11: F(1164, 16, 1292, 206),
  12: F(1316, 16, 1465, 206),
  13: F(1478, 16, 1603, 206),
  14: F(820, 16, 950, 206),
  // Row 1 — 4 back idle + variants
  16: F(38, 218, 132, 412),
  17: F(238, 218, 314, 412),
  18: F(425, 218, 524, 412),
  19: F(660, 218, 733, 412),
  20: F(1517, 218, 1614, 412),
  21: F(38, 218, 132, 412),
  22: F(238, 218, 314, 412),
  // Row 3 — special action poses
  24: F(184, 656, 273, 862),   // think — hand seal one
  25: F(317, 656, 406, 862),   // busy — both hand seals
  26: F(28, 656, 126, 862),    // report — standing calm
  27: F(451, 656, 537, 862),   // llm — standing variant
  28: F(722, 656, 795, 862),   // tool — crouched/throwing
  29: F(854, 656, 964, 862),   // mcp — weapon pose
  30: F(1493, 656, 1607, 862), // skill — dispersing/transforming
  31: F(579, 656, 673, 862),   // deliver — standing finished
};

const GUTS_FRAMES = {
  // Row 0 left — 5 front-facing
  0: F(25, 19, 152, 206),
  1: F(190, 20, 313, 209),
  2: F(350, 18, 472, 207),
  3: F(526, 19, 648, 207),
  4: F(685, 17, 807, 204),
  5: F(190, 20, 313, 209),
  // Row 0 right — 5 side-walking with greatsword
  8: F(860, 36, 1020, 212),
  9: F(1018, 36, 1178, 212),
  10: F(1181, 36, 1341, 212),
  11: F(1347, 36, 1507, 212),
  12: F(1514, 36, 1674, 212),
  13: F(1018, 36, 1178, 212),
  // Row 1 — back-facing variants
  16: F(34, 235, 137, 421),
  17: F(196, 241, 300, 425),
  18: F(357, 237, 458, 421),
  19: F(502, 236, 624, 421),
  20: F(697, 237, 798, 426),
  21: F(858, 237, 960, 422),
  22: F(34, 235, 137, 421),
  // Row 3 — 8 action poses
  24: F(187, 671, 315, 872),    // think — cloaked back pensive
  25: F(587, 684, 763, 876),    // busy — horizontal swing
  26: F(37, 674, 151, 872),     // report alternate — armor front
  27: F(851, 681, 1009, 879),   // llm — sword aloft
  28: F(393, 655, 551, 873),    // tool — drawing greatsword
  29: F(1102, 648, 1309, 885),  // mcp — cloaked dynamic
  30: F(1359, 607, 1538, 880),  // skill — red aura
  31: F(1602, 680, 1698, 875),  // deliver/report — final stance
};

const OKABE_FRAMES = {
  0: F(22, 78, 132, 275),
  1: F(179, 78, 290, 275),
  2: F(336, 79, 446, 280),
  3: F(493, 79, 603, 280),
  4: F(650, 78, 765, 275),
  5: F(806, 79, 915, 276),
  6: F(969, 78, 1077, 280),
  7: F(1126, 78, 1224, 280),
  8: F(18, 408, 152, 592),
  9: F(183, 408, 308, 596),
  10: F(340, 408, 455, 596),
  11: F(492, 407, 623, 591),
  12: F(649, 413, 780, 596),
  13: F(805, 413, 930, 600),
  14: F(973, 404, 1072, 596),
  15: F(1130, 404, 1220, 596),
  16: F(23, 719, 136, 900),
  17: F(179, 729, 293, 906),
  18: F(336, 724, 445, 910),
  19: F(490, 719, 602, 900),
  20: F(645, 734, 758, 915),
  21: F(807, 724, 915, 910),
  22: F(973, 719, 1064, 915),
  23: F(1131, 719, 1216, 910),
  24: F(23, 1008, 147, 1203),
  25: F(170, 1018, 299, 1203),
  26: F(350, 1013, 446, 1203),
  27: F(478, 998, 622, 1203),
  28: F(635, 998, 779, 1203),
  29: F(817, 1004, 926, 1208),
  30: F(968, 1002, 1073, 1208),
  31: F(1130, 1001, 1220, 1203),
};

const CHAR_DEFS = {
  gojo: {
    src: 'assets/atlases/gojo.png?v=26',
    sheetWidth: 2048,
    sheetHeight: 1152,
    frames: GOJO_FRAMES,
    imageRendering: 'auto',
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5], side: [9, 10, 11, 12, 13, 14], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 25, 26, 27, 28, 29, 30, 31),
    name: 'You',
    role: 'Requester',
  },
  guts: {
    src: 'assets/atlases/guts.png?v=14',
    sheetWidth: 1774,
    sheetHeight: 887,
    frames: GUTS_FRAMES,
    imageRendering: 'auto',
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5], side: [9, 10, 11, 12], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 25, 26, 27, 28, 29, 30, 31),
    name: 'Assistant',
    role: 'Gateway',
  },
  okabe: {
    src: 'assets/atlases/okabe.png?v=16',
    sheetWidth: 1254,
    sheetHeight: 1254,
    frames: OKABE_FRAMES,
    idle: { front: 6, side: 14, back: 15 },
    walk: { front: [1, 2, 3, 4, 5, 6], side: [9, 10, 11, 12, 13, 14], back: [17, 18, 19, 20, 21, 22] },
    poses: P(29, 29, 26, 27, 24, 28, 25, 30),
    name: 'OpenAI protocol',
    role: 'Reasoning Core',
  },
  kurisu: {
    src: 'assets/atlases/kurisu.png?v=11',
    sheetWidth: 1672,
    sheetHeight: 941,
    frames: KURISU_FRAMES,
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5, 6], side: [9, 10, 11, 12, 13, 14], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 25, 26, 27, 28, 29, 30, 31),
    name: 'Anthropic protocol',
    role: 'Selected Provider',
  },
  lelouch: {
    src: 'assets/atlases/lelouch.png',
    sheetWidth: ATLAS_W,
    sheetHeight: ATLAS_H,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5, 6], side: [9, 10, 11, 12, 13, 14], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 28, 25, 31, 25, 29, 26, 30),
    name: 'Tool Manager',
    role: 'Dispatch / Return',
  },
  levi: {
    src: 'assets/atlases/levi.png?v=11',
    sheetWidth: 1672,
    sheetHeight: 941,
    frames: LEVI_FRAMES,
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5, 6], side: [9, 10, 11, 12, 13], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 25, 26, 27, 28, 29, 30, 31),
    name: 'Local Tools',
    role: 'Memory / Note / Terminal / Sub-Agent',
  },
  itachi: {
    src: 'assets/atlases/itachi.png?v=11',
    sheetWidth: 1672,
    sheetHeight: 941,
    frames: ITACHI_FRAMES,
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5], side: [9, 10, 11, 12, 13, 14], back: [17, 18, 19, 20, 21, 22] },
    poses: P(24, 25, 26, 27, 28, 29, 30, 31),
    name: 'External Tools',
    role: 'MCP / External Tools',
  },
  mikey: {
    src: 'assets/atlases/mikey.png',
    sheetWidth: ATLAS_W,
    sheetHeight: ATLAS_H,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    idle: { front: 0, side: 8, back: 16 },
    walk: { front: [1, 2, 3, 4, 5, 6], side: [9, 10, 11, 12, 13, 14], back: [16] },
    poses: P(26, 24, 24, 26, 28, 29, 27, 30),
    name: 'Knowledge Base',
    role: 'Knowledge Retrieval',
  },
};

const POSE_CONFIG_OVERRIDES = {
  gojo: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5],
      side: [9, 10, 11, 12, 13, 14],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 24,
      busy: 25,
      report: 31,
      llm: 31,
      tool: 28,
      mcp: 29,
      skill: 30,
      deliver: 26,
    },
  },
  guts: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5],
      side: [8, 9, 10, 11, 12],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 31,
      busy: 25,
      report: 31,
      llm: 27,
      tool: 28,
      mcp: 29,
      skill: 30,
      deliver: 31,
    },
  },
  okabe: {
    idle: { front: 6, side: 14, back: 15 },
    walk: {
      front: [1, 2, 3, 4, 5, 6],
      side: [9, 10, 11, 12, 13, 14],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 29,
      busy: 29,
      report: 26,
      llm: 27,
      tool: 24,
      mcp: 28,
      skill: 25,
      deliver: 30,
    },
  },
  kurisu: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5, 6],
      side: [9, 10, 11, 12, 13, 14],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 24,
      busy: 25,
      report: 26,
      llm: 27,
      tool: 28,
      mcp: 29,
      skill: 30,
      deliver: 31,
    },
  },
  lelouch: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5, 6],
      side: [9, 10, 11, 12, 13, 14],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 24,
      busy: 28,
      report: 25,
      llm: 31,
      tool: 25,
      mcp: 29,
      skill: 26,
      deliver: 30,
    },
  },
  levi: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5, 6],
      side: [9, 10, 11, 12, 13],
      back: [17, 18, 19, 20, 21, 22],
    },
    poses: {
      think: 24,
      busy: 25,
      report: 26,
      llm: 27,
      tool: 28,
      mcp: 29,
      skill: 30,
      deliver: 31,
    },
  },
  itachi: {
    idle: { front: 0, side: 16, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5],
      side: [9, 10, 11, 12, 13, 14],
      back: [9, 10, 11, 12, 13, 14],
    },
    poses: {
      think: 24,
      busy: 25,
      report: 26,
      llm: 27,
      tool: 28,
      mcp: 29,
      skill: 30,
      deliver: 31,
    },
  },
  mikey: {
    idle: { front: 0, side: 8, back: 16 },
    walk: {
      front: [1, 2, 3, 4, 5, 6],
      side: [9, 10, 11, 12, 13, 14],
      back: [16],
    },
    poses: {
      think: 26,
      busy: 24,
      report: 24,
      llm: 26,
      tool: 28,
      mcp: 29,
      skill: 27,
      deliver: 30,
    },
  },
};

for (const [id, override] of Object.entries(POSE_CONFIG_OVERRIDES)) {
  const def = CHAR_DEFS[id];
  if (!def) continue;
  def.idle = { ...def.idle, ...override.idle };
  def.walk = { ...def.walk, ...override.walk };
  def.poses = { ...def.poses, ...override.poses };
  def.poseConfig = {
    idle: { ...def.idle },
    walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
    poses: { ...def.poses },
  };
}

window.CHAR_DEFS = CHAR_DEFS;

function Sprite({ id, frame = 0, size = 64 }) {
  const def = CHAR_DEFS[id];
  if (!def) return null;

  if (def.frames) {
    const box = def.frames[frame] || def.frames[def.idle?.front ?? 0];
    if (!box) return null;
    const [fx, fy, fw, fh] = box;
    // Render at consistent height = `size`, preserving aspect ratio
    const scale = size / fh;
    return (
      <div
        style={{
          width: fw * scale,
          height: size,
          backgroundImage: `url('${def.src}')`,
          backgroundSize: `${def.sheetWidth * scale}px ${def.sheetHeight * scale}px`,
          backgroundPosition: `${-fx * scale}px ${-fy * scale}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: def.imageRendering || 'pixelated',
        }}
      />
    );
  }

  // Grid mode (okabe / lelouch / mikey)
  const col = frame % def.cols;
  const row = Math.floor(frame / def.cols);
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundImage: `url('${def.src}')`,
        backgroundSize: `${def.cols * size}px ${def.rows * size}px`,
        backgroundPosition: `${-col * size}px ${-row * size}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  );
}

function getRuntimeSpriteDef(def, spriteConfig) {
  if (!spriteConfig) return def;
  return {
    ...def,
    idle: { ...def.idle, ...(spriteConfig.idle || {}) },
    walk: { ...def.walk, ...(spriteConfig.walk || {}) },
    poses: { ...def.poses, ...(spriteConfig.poses || {}) },
  };
}

function resolvePose(id, def, dir, actionKind, actionVariant, busy, thinking) {
  const baseDir = dir === 'side-left' ? 'side' : dir;
  const idleFrame = def.idle[baseDir] ?? def.idle.front;
  if (thinking) return def.poses.think ?? idleFrame;
  if (id === 'lelouch' && actionVariant === 'vertical-command') {
    return def.poses.deliver ?? def.poses.report ?? idleFrame;
  }
  // Use Mikey's crossed-arms standing frame from the atlas for report.
  if (id === 'mikey' && actionKind === 'report') {
    return def.poses.think ?? idleFrame;
  }
  if (actionKind && def.poses[actionKind] != null) return def.poses[actionKind];
  if (busy) return def.poses.busy ?? idleFrame;
  return idleFrame;
}

function resolveFrames(def, dir, walking) {
  const baseDir = dir === 'side-left' ? 'side' : dir;
  const walkFrames = def.walk[baseDir];
  if (walking && walkFrames?.length) return walkFrames;
  return [def.idle[baseDir] ?? def.idle.front];
}

function WalkingSprite({ id, dir = 'front', size = 64, walking = false, frameRate = 8, actionKind, actionVariant, busy = false, thinking = false, spriteConfig = null }) {
  const baseDef = CHAR_DEFS[id];
  const spriteConfigSignature = JSON.stringify(spriteConfig || {});
  const def = React.useMemo(() => getRuntimeSpriteDef(baseDef, spriteConfig), [baseDef, spriteConfigSignature]);
  const frames = React.useMemo(() => resolveFrames(def, dir, walking), [def, dir, walking]);
  const [idx, setIdx] = React.useState(0);
  const baseDir = dir === 'side-left' ? 'side' : dir;
  const usingMikeyReportFrame = !walking && id === 'mikey' && actionKind === 'report';
  const usingSideIdlePose =
    id !== 'guts' &&
    id !== 'lelouch' &&
    (!walking && (actionKind === 'deliver' || actionKind === 'report') && baseDir === 'side');
  const xScale = 1;
  const sourceFacing = usingMikeyReportFrame
    ? null
    : usingSideIdlePose
    ? SIDE_IDLE_FACING[id] || SIDE_SPRITE_FACING[id] || 'left'
    : SIDE_SPRITE_FACING[id] || 'left';
  const desiredFacing = usingMikeyReportFrame
    ? null
    : dir === 'side-left' ? 'left' : dir === 'side' ? 'right' : null;
  const facingScale = desiredFacing && desiredFacing !== sourceFacing ? -xScale : xScale;

  React.useEffect(() => {
    if (!walking || frames.length <= 1) {
      setIdx(0);
      return;
    }
    const t = setInterval(() => setIdx((p) => (p + 1) % frames.length), 1000 / frameRate);
    return () => clearInterval(t);
  }, [walking, frames, frameRate]);

  const frame = walking
    ? frames[idx % frames.length]
    : resolvePose(id, def, dir, actionKind, actionVariant, busy, thinking);

  return (
    <div style={{ transform: `scaleX(${facingScale})`, transformOrigin: 'center bottom' }}>
      <Sprite id={id} frame={frame} size={size} />
    </div>
  );
}

window.Sprite = Sprite;
window.WalkingSprite = WalkingSprite;

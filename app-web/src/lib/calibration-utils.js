// @haish-esm
import { STATIONS } from '../World.jsx';
import { POSE_DEBUG_OPTIONS } from './world-runtime.js';

export function clonePointMap(source) {
  return Object.fromEntries(
    Object.entries(source).map(([id, point]) => [id, { ...point }])
  );
}

export function clamp01(value) {
  return Math.max(0.02, Math.min(0.98, value));
}

export function roundCoord(value) {
  return Math.round(value * 1000) / 1000;
}

export function serializePointMap(name, ids, pointMap, includeLabel = false) {
  const rows = ids.map((id) => {
    const point = pointMap[id];
    if (includeLabel) {
      const label = STATIONS[id]?.label || point?.label || '';
      return `  ${id}: { x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)}, label: '${label}' },`;
    }
    return `  ${id}: { x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)} },`;
  }).join('\n');
  return `const ${name} = {\n${rows}\n};`;
}

export function serializePoseConfigMap(ids, getConfig) {
  const poseKeys = POSE_DEBUG_OPTIONS.filter((option) => option.key !== 'idle').map((option) => option.key);
  const rows = ids.map((id) => {
    const config = getConfig(id);
    const poseRows = poseKeys.map((key) => `      ${key}: ${config.poses[key]},`).join('\n');
    return [
      `  ${id}: {`,
      `    idle: { front: ${config.idle.front}, side: ${config.idle.side}, back: ${config.idle.back} },`,
      `    walk: {`,
      `      front: [${config.walk.front.join(', ')}],`,
      `      side: [${config.walk.side.join(', ')}],`,
      `      back: [${config.walk.back.join(', ')}],`,
      `    },`,
      `    poses: {`,
      poseRows,
      `    },`,
      `  },`,
    ].join('\n');
  }).join('\n');
  return `const POSE_CONFIG_OVERRIDES = {\n${rows}\n};`;
}



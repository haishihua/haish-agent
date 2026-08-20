// @haish-esm
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

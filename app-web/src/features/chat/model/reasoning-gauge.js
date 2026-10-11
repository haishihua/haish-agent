// The SVG needle sweeps one fixed 240-degree arc, regardless of option count.
const MIN_ROTATION = -165;
const MAX_ROTATION = 75;

export function reasoningGaugeRotation(effort, options) {
  if (effort == null || effort === '') return null;
  const levels = options.filter((option) => option.id != null && option.id !== '');
  const index = levels.findIndex((option) => option.id === effort);
  if (index < 0) return null;
  const ratio = levels.length === 1 ? 0.5 : index / (levels.length - 1);
  return MIN_ROTATION + (MAX_ROTATION - MIN_ROTATION) * ratio;
}

// All coordinates are in the composer's local horizontal space; feet use the
// ground baseline as zero. The hitbox deliberately covers only the character.
export function pickerPlatform(formRect, pickerRect, spriteWidth, maxPosition, footY) {
  if (!pickerRect || !pickerRect.width || !pickerRect.height || !spriteWidth) return null;
  const left = pickerRect.left - formRect.left;
  const right = pickerRect.right - formRect.left;
  const height = footY - pickerRect.top;
  const halfBody = spriteWidth * 26 / 120;
  if (right <= 0 || left >= formRect.width || height < 4 || height > spriteWidth * 0.7) return null;
  const minCenter = spriteWidth / 2;
  const maxCenter = maxPosition + minCenter;
  if (right - left < halfBody * 2 || right < minCenter || left > maxCenter) return null;
  return { left, right, height, halfBody, minCenter, maxCenter };
}

export function platformEdge(platform, direction) {
  const inset = platform.halfBody + 2;
  const minVisibleCenter = platform.minCenter - platform.halfBody;
  const maxVisibleCenter = platform.maxCenter + platform.halfBody;
  return direction > 0
    ? Math.min(platform.right - inset, maxVisibleCenter)
    : Math.max(platform.left + inset, minVisibleCenter);
}

export function jumpTarget(platform, direction, toTop) {
  const { left, right, halfBody, minCenter, maxCenter } = platform;
  const center = toTop
    ? (direction > 0 ? left + halfBody + 7 : right - halfBody - 7)
    : (direction > 0 ? right + halfBody + 10 : left - halfBody - 10);
  return center >= minCenter && center <= maxCenter ? center : null;
}

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => value * value * (3 - 2 * value);

export function jumpPoint(fromX, toX, height, toTop, progress) {
  const t = clamp(progress);
  const horizontal = toTop ? smooth(clamp((t - 0.35) / 0.65)) : smooth(t);
  const x = fromX + (toX - fromX) * horizontal;
  const lift = toTop
    ? height * smooth(clamp(t / 0.35)) + 38 * Math.sin(Math.PI * t) ** 2
    : height + 22 * Math.sin(Math.PI * clamp(t / 0.9)) ** 2 - height * smooth(clamp((t - 0.9) / 0.1));
  return { x, lift };
}

const POSITION_KEY = 'haish.composer-pet.position.v1';
let memoryPosition = null;

export function readPetPosition() {
  if (memoryPosition !== null) return memoryPosition;
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0 && value <= 1) memoryPosition = value;
  } catch { /* Storage may be unavailable; keep the in-memory position. */ }
  return memoryPosition;
}

export function savePetPosition(position, max) {
  if (!Number.isFinite(position) || !Number.isFinite(max) || max <= 0) return;
  memoryPosition = Math.max(0, Math.min(1, position / max));
  try { window.localStorage.setItem(POSITION_KEY, String(memoryPosition)); } catch { /* Keep it for this session. */ }
}

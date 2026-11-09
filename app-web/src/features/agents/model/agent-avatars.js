// Agent avatar catalog + per-agent avatar preference (local UI state).
//
// The 54 avatars are slices of scripts/assets/penguin-avatar-sheet.png (7 x 8
// sheet), traced to vector by scripts/assets/trace-penguin-avatars.py: each sprite
// is a white silhouette plus the black line, so it stays sharp at 46px in the list
// and 104px in the detail hero. They ship as plain SVG files under
// app-web/assets/ui/agent-avatars and are referenced by URL, so nothing here
// imports one image module per avatar.
//
// Avatar choice is a presentation preference, not agent configuration: the
// runtime agent profile has no avatar field, and presets are read-only. Keeping
// it in localStorage means picking an avatar for a built-in preset works the
// same as for a custom agent.
export const AGENT_AVATAR_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'work', label: 'Work' },
  { id: 'sports', label: 'Sports' },
  { id: 'life', label: 'Life' },
  { id: 'other', label: 'Other' },
];

export const AGENT_AVATARS = [
  { id: 'penguin-01', label: 'Stand', category: 'other' },
  { id: 'penguin-03', label: 'Curious', category: 'other' },
  { id: 'penguin-04', label: 'Wondering', category: 'other' },
  { id: 'penguin-05', label: 'Ponder', category: 'other' },
  { id: 'penguin-06', label: 'Exclaim', category: 'other' },
  { id: 'penguin-07', label: 'Cheer', category: 'other' },
  { id: 'penguin-08', label: 'Desk work', category: 'work' },
  { id: 'penguin-09', label: 'Headphones', category: 'work' },
  { id: 'penguin-10', label: 'Laptop', category: 'work' },
  { id: 'penguin-11', label: 'Typing', category: 'work' },
  { id: 'penguin-12', label: 'Desk nap', category: 'work' },
  { id: 'penguin-13', label: 'Excited', category: 'work' },
  { id: 'penguin-14', label: 'Keyboard', category: 'work' },
  { id: 'penguin-15', label: 'Reading', category: 'work' },
  { id: 'penguin-17', label: 'Books', category: 'work' },
  { id: 'penguin-18', label: 'Writing', category: 'work' },
  { id: 'penguin-19', label: 'Whiteboard', category: 'work' },
  { id: 'penguin-20', label: 'Painting', category: 'work' },
  { id: 'penguin-21', label: 'Camera', category: 'work' },
  { id: 'penguin-22', label: 'Basketball', category: 'sports' },
  { id: 'penguin-23', label: 'Slam dunk', category: 'sports' },
  { id: 'penguin-24', label: 'Soccer', category: 'sports' },
  { id: 'penguin-25', label: 'Skateboard', category: 'sports' },
  { id: 'penguin-26', label: 'Snowboard', category: 'sports' },
  { id: 'penguin-27', label: 'Skiing', category: 'sports' },
  { id: 'penguin-28', label: 'Cycling', category: 'sports' },
  { id: 'penguin-29', label: 'Gaming', category: 'life' },
  { id: 'penguin-30', label: 'VR', category: 'life' },
  { id: 'penguin-31', label: 'Music', category: 'life' },
  { id: 'penguin-32', label: 'DJ', category: 'life' },
  { id: 'penguin-33', label: 'Guitar', category: 'life' },
  { id: 'penguin-34', label: 'Drums', category: 'life' },
  { id: 'penguin-35', label: 'Singing', category: 'life' },
  { id: 'penguin-36', label: 'Chef', category: 'life' },
  { id: 'penguin-37', label: 'Cooking', category: 'life' },
  { id: 'penguin-38', label: 'Coffee', category: 'life' },
  { id: 'penguin-39', label: 'Bread', category: 'life' },
  { id: 'penguin-40', label: 'Noodles', category: 'life' },
  { id: 'penguin-41', label: 'Boba', category: 'life' },
  { id: 'penguin-42', label: 'Cake', category: 'life' },
  { id: 'penguin-43', label: 'Hiking', category: 'life' },
  { id: 'penguin-44', label: 'Gardening', category: 'life' },
  { id: 'penguin-45', label: 'Camping', category: 'life' },
  { id: 'penguin-46', label: 'Fishing', category: 'life' },
  { id: 'penguin-47', label: 'Beach', category: 'life' },
  { id: 'penguin-48', label: 'Swimming', category: 'life' },
  { id: 'penguin-49', label: 'Winter', category: 'life' },
  { id: 'penguin-50', label: 'Reading in bed', category: 'life' },
  { id: 'penguin-51', label: 'Cat', category: 'life' },
  { id: 'penguin-52', label: 'Dog', category: 'life' },
  { id: 'penguin-53', label: 'Burrito', category: 'life' },
  { id: 'penguin-54', label: 'Nap', category: 'life' },
  { id: 'penguin-55', label: 'Pumpkin', category: 'life' },
  { id: 'penguin-56', label: 'Santa', category: 'life' },
];

// 没有选过头像的 agent 一律用素材库第一只企鹅。
export const DEFAULT_AGENT_AVATAR_ID = AGENT_AVATARS[0].id;

const AVATAR_IDS = new Set(AGENT_AVATARS.map((item) => item.id));
const AVATAR_BY_ID = new Map(AGENT_AVATARS.map((item) => [item.id, item]));
const STORAGE_KEY = 'haish.agent-avatars.v1';
const listeners = new Set();
let cachedRaw = null;
let cachedMap = {};

function avatarStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isAgentAvatarId(value) {
  return AVATAR_IDS.has(String(value || ''));
}

export function agentAvatarById(avatarId) {
  return AVATAR_BY_ID.get(String(avatarId || '')) || null;
}

// 换设计稿时文件名不变，浏览器/Electron 的图片缓存会按 URL 命中旧文件，
// 结果就是弹窗里新旧混排。只要改素材就同步抬这个版本号，URL 变了旧缓存自然失效。
export const AGENT_AVATAR_ASSET_VERSION = '7';

export function agentAvatarImageSrc(avatarId) {
  const id = isAgentAvatarId(avatarId) ? String(avatarId) : DEFAULT_AGENT_AVATAR_ID;
  return `assets/ui/agent-avatars/${id}.svg?v=${AGENT_AVATAR_ASSET_VERSION}`;
}

export function agentAvatarsInCategory(categoryId) {
  const category = String(categoryId || 'all');
  if (category === 'all') return AGENT_AVATARS;
  return AGENT_AVATARS.filter((item) => item.category === category);
}

function parseAvatarMap(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map = {};
    for (const [agentId, avatarId] of Object.entries(parsed)) {
      const key = String(agentId || '').trim();
      if (key && isAgentAvatarId(avatarId)) map[key] = String(avatarId);
    }
    return map;
  } catch {
    return {};
  }
}

// useSyncExternalStore 要求快照引用稳定，所以按原始字符串缓存一次解析结果。
export function getAgentAvatarMap() {
  const storage = avatarStorage();
  let raw = '';
  try {
    raw = storage?.getItem(STORAGE_KEY) || '';
  } catch {
    raw = '';
  }
  if (raw !== cachedRaw) {
    cachedMap = parseAvatarMap(raw);
    cachedRaw = raw;
  }
  return cachedMap;
}

export function agentAvatarIdFor(agentId, map = getAgentAvatarMap()) {
  const id = String(agentId || '').trim();
  const stored = id ? map[id] : '';
  return isAgentAvatarId(stored) ? stored : DEFAULT_AGENT_AVATAR_ID;
}

export function saveAgentAvatar(agentId, avatarId) {
  const id = String(agentId || '').trim();
  if (!id) return getAgentAvatarMap();
  const next = { ...getAgentAvatarMap() };
  if (!isAgentAvatarId(avatarId) || String(avatarId) === DEFAULT_AGENT_AVATAR_ID) delete next[id];
  else next[id] = String(avatarId);
  const raw = JSON.stringify(next);
  try {
    avatarStorage()?.setItem(STORAGE_KEY, raw);
  } catch {
    // Private-mode quota failures must not break the settings panel.
  }
  cachedRaw = raw;
  cachedMap = next;
  listeners.forEach((listener) => listener());
  return next;
}

export function subscribeAgentAvatars(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

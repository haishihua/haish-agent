// @haish-esm
/** Leaf helper: normalize tool identifiers for timeline / runtime matching. */

export function normalizeToolName(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

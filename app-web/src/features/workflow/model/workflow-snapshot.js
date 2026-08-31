export function usableWorkflowSnapshot(value, fallback = null) {
  let snapshot = value;
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }
  return Array.isArray(snapshot?.nodes) && snapshot.nodes.length > 0 ? snapshot : fallback;
}

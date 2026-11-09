const IDLE_ACTIONS = ['walk', 'run', 'sit', 'sleep'];

export function chooseIdleAction(random = Math.random) {
  return IDLE_ACTIONS[Math.min(IDLE_ACTIONS.length - 1, Math.floor(random() * IDLE_ACTIONS.length))];
}

// Give resting animations time to settle before choosing another activity.
export function idleRestDuration(action) {
  return action === 'sit' ? 10000 : 15000;
}

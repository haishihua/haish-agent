type SubscriberOwner = {
  id: number;
  once(event: 'destroyed', listener: () => void): unknown;
};

const ownerCleanups = new WeakMap<SubscriberOwner, Map<(id: number) => void, () => void>>();

/** Register each resource cleanup once per WebContents lifetime, including resubscriptions. */
export function trackSubscriberOwner(owner: SubscriberOwner, remove: (id: number) => void): void {
  let cleanups = ownerCleanups.get(owner);
  if (!cleanups) {
    cleanups = new Map();
    ownerCleanups.set(owner, cleanups);
  }
  if (cleanups.has(remove)) return;
  const cleanup = () => {
    cleanups.delete(remove);
    remove(owner.id);
  };
  cleanups.set(remove, cleanup);
  owner.once('destroyed', cleanup);
}

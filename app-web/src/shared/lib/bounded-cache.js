// Only use for reloadable data. Active execution ownership stays in the runtime store.
export class BoundedCache extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  get(key) {
    const value = super.get(key);
    if (super.has(key)) {
      super.delete(key);
      super.set(key, value);
    }
    return value;
  }

  set(key, value) {
    super.delete(key);
    super.set(key, value);
    while (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}

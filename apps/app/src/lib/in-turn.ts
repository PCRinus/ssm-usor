const queues = new Map<string, Promise<unknown>>();

// A save that sends a whole record built on the cached copy must not start until the previous
// save of that record has updated the cache, or it sends the copy from before and undoes it.
export function inTurn<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(key, next);
  const forget = () => {
    if (queues.get(key) === next) queues.delete(key);
  };
  next.then(forget, forget);
  return next;
}

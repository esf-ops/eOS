/**
 * Simple concurrency gate for the lab intelligence server.
 */
export function createConcurrencyGate(max) {
  let active = 0;
  const waiters = [];

  return {
    get active() {
      return active;
    },
    get max() {
      return max;
    },
    async run(fn) {
      if (active >= max) {
        const err = new Error("Lab intelligence server is at max concurrency. Try again shortly.");
        err.statusCode = 429;
        err.code = "CONCURRENCY_LIMIT";
        throw err;
      }
      active += 1;
      try {
        return await fn();
      } finally {
        active -= 1;
        const next = waiters.shift();
        if (next) next();
      }
    }
  };
}

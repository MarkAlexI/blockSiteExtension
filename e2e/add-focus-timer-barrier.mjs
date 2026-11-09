// Browser-side fixture: hold only the former 100ms Add callbacks until native
// input has selected another field. Other timers and the worker keep real time.
export function installAddFocusTimerBarrier() {
  const add = document.querySelector('#add-rule');
  const nativeSet = window.setTimeout;
  const nativeClear = window.clearTimeout;
  const tasks = new Map();
  let held = 0, delivered = 0, released = false, open;
  const gate = new Promise(resolve => { open = resolve; });

  const set = function (callback, delay, ...args) {
    if (typeof callback !== 'function' || Number(delay) !== 100) {
      return nativeSet.call(this, callback, delay, ...args);
    }
    const task = { cancelled: false };
    task.done = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.id = nativeSet.call(this, () => {
        gate.then(() => {
          if (!task.cancelled) {
            delivered++;
            callback.apply(window, args);
          }
        }).then(resolve, reject);
      }, delay);
    });
    tasks.set(task.id, task);
    held++;
    return task.id;
  };
  const clear = function (id) {
    const task = tasks.get(id);
    if (task) {
      task.cancelled = true;
      task.resolve();
    }
    return nativeClear.call(this, id);
  };
  const start = () => {
    window.setTimeout = set;
    window.clearTimeout = clear;
  };
  const end = () => {
    if (window.setTimeout === set) window.setTimeout = nativeSet;
  };
  add.addEventListener('click', start, true);
  window.addEventListener('click', end);

  window.__bdAddFocusTimerBarrier = {
    read: () => ({ held, delivered, released }),
    async release() {
      released = true;
      end();
      add.removeEventListener('click', start, true);
      window.removeEventListener('click', end);
      open();
      try {
        await Promise.all([...tasks.values()].map(task => task.done));
      } finally {
        if (window.clearTimeout === clear) window.clearTimeout = nativeClear;
      }
      return this.read();
    }
  };
}

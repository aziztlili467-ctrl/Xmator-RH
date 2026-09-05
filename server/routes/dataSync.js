const listeners = new Set();

function onDataChanged(fn) {
  if (typeof fn === 'function') listeners.add(fn);
}

function notifyDataChanged() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('[dataSync]', e.message); }
  }
}

module.exports = { onDataChanged, notifyDataChanged };
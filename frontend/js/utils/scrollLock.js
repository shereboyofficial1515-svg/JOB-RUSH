/**
 * JOB RUSH — ScrollLock: the one place that locks and unlocks page scrolling.
 *
 * Modals, the mobile drawer, the app-lock overlay and the full-screen chat all
 * used to save and restore `document.body.style.overflow` on their own. Two
 * of them overlapping (a modal opening over the drawer, a lock screen over a
 * modal) restored a stale value and left `overflow: hidden` on the body for
 * good — the page then looked cut off with no way to scroll.
 *
 * Now every caller takes a named lock and releases the same name. The body is
 * locked while at least one lock is held and restored exactly once when the
 * last is released. Taking or releasing the same name twice is harmless.
 *
 *   ScrollLock.acquire('modal');   ScrollLock.release('modal');
 *   ScrollLock.isLocked();
 */
const ScrollLock = (function () {
  const held = new Set();
  let original = null; // body's inline overflow before the first lock

  function apply() {
    const body = document.body;
    if (!body) return;
    if (held.size > 0) {
      if (original === null) original = body.style.overflow;
      body.style.overflow = 'hidden';
    } else if (original !== null) {
      body.style.overflow = original;
      original = null;
    }
  }

  function acquire(name) { held.add(name); apply(); }
  function release(name) { held.delete(name); apply(); }
  function isLocked() { return held.size > 0; }

  // Safety net: a page restored from the back-forward cache or a stray inline
  // style from outside this utility must never leave the page stuck. If nothing
  // holds a lock, the body is not allowed to stay hidden.
  function heal() {
    if (held.size === 0 && document.body && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
      original = null;
    }
  }
  window.addEventListener('pageshow', heal);

  return { acquire, release, isLocked, heal };
})();

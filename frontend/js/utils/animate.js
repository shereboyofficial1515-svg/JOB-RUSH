/**
 * JOB RUSH — Small shared animation helpers for JS-rendered content.
 * Pages that replace a container's innerHTML with a list of cards
 * (job/worker/portfolio cards, dashboard stats, notification rows...)
 * call Animate.stagger(container) right after, instead of each page
 * hand-rolling its own incremental-delay loop.
 */
const Animate = (function () {
  /**
   * Gives each direct child of `container` the .stagger-item entrance
   * animation with a small incremental delay, capped at `max` items
   * so a long list doesn't leave the last rows waiting a long time
   * before they animate in.
   */
  function stagger(container, { max = 8, stepMs = 40, selector } = {}) {
    if (!container) return;
    const children = selector ? container.querySelectorAll(selector) : container.children;
    Array.from(children).forEach((el, i) => {
      el.classList.add('stagger-item');
      el.style.animationDelay = `${Math.min(i, max) * stepMs}ms`;
    });
  }

  /**
   * Plays .icon-pop once on `el` — used for a save/bookmark/heart
   * toggle the moment its state actually flips, never continuously.
   */
  function pop(el) {
    if (!el) return;
    el.classList.remove('icon-pop');
    // Force reflow so re-adding the class restarts the animation even
    // if it's toggled twice in quick succession.
    void el.offsetWidth;
    el.classList.add('icon-pop');
  }

  return { stagger, pop };
})();

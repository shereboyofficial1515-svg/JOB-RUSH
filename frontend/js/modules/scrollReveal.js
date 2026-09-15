/**
 * JOB RUSH — Reveal-on-scroll.
 * Used sparingly (the marketing home page's sections) — never wired
 * up on content-heavy dashboard/discovery pages, which already have
 * their own entrance treatment (skeletons + Animate.stagger). Elements
 * start hidden only visually (see .reveal in animations.css); a
 * screen reader sees them immediately regardless of scroll position.
 */
const ScrollReveal = (function () {
  function observe(selector = '.reveal') {
    const els = document.querySelectorAll(selector);
    if (els.length === 0) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  return { observe };
})();

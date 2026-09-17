/**
 * JOB RUSH — Runtime environment configuration.
 *
 * The frontend is plain static HTML/CSS/JS with no build step, so
 * there's no bundler to inject an API URL at build time the way a
 * Vite/webpack app would — this detects dev vs. production from the
 * page's own origin at runtime instead.
 *
 * In production this is the SAME Express service serving both the
 * API and these static files (see backend/src/server.js's
 * express.static block) — a relative /api path is always correct
 * there regardless of what domain this deployment ends up on, so
 * there's nothing to fill in by hand. Local dev is the one case that
 * genuinely needs an absolute URL, since the frontend and backend run
 * as two separate local servers on different ports.
 */
const ENV = (function () {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return {
    API_BASE_URL: isLocalDev ? 'http://127.0.0.1:4000/api' : '/api',
  };
})();

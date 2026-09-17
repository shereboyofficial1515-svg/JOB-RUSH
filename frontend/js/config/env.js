/**
 * JOB RUSH — Runtime environment configuration.
 *
 * The frontend is plain static HTML/CSS/JS with no build step, so
 * there's no bundler to inject an API URL at build time the way a
 * Vite/webpack app would — this detects dev vs. production from the
 * page's own origin at runtime instead. This file is the one place
 * to update once the backend is actually deployed.
 */
const ENV = (function () {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  // Render assigns the backend's .onrender.com URL when the web
  // service is first created — it can't be known ahead of time, so
  // this is intentionally a placeholder rather than a guess. Replace
  // it with the real URL once that service exists, before deploying
  // the frontend.
  const PRODUCTION_API_BASE_URL = 'https://REPLACE_WITH_YOUR_RENDER_BACKEND_URL.onrender.com/api';

  return {
    API_BASE_URL: isLocalDev ? 'http://127.0.0.1:4000/api' : PRODUCTION_API_BASE_URL,
  };
})();

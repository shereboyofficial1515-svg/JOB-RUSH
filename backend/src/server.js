const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const authController = require('./controllers/authController');
const profileRoutes = require('./routes/profileRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const locationRoutes = require('./routes/locationRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const storageRoutes = require('./routes/storageRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const savedJobRoutes = require('./routes/savedJobRoutes');
const savedProfileRoutes = require('./routes/savedProfileRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const { workerRouter: verificationWorkerRoutes, adminRouter: verificationAdminRoutes } = require('./routes/verificationRoutes');
const contractRoutes = require('./routes/contractRoutes');
const escrowRoutes = require('./routes/escrowRoutes');
const escrowController = require('./controllers/escrowController');
const { router: walletRoutes, adminRouter: financeAdminRoutes } = require('./routes/walletRoutes');
const messagingRoutes = require('./routes/messagingRoutes');
const { router: reviewRoutes, adminRouter: reviewAdminRoutes } = require('./routes/reviewRoutes');
const { router: disputeRoutes, adminRouter: disputeAdminRoutes } = require('./routes/disputeRoutes');
const { router: subscriptionRoutes, adminRouter: subscriptionAdminRoutes } = require('./routes/subscriptionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminAnalyticsRoutes = require('./routes/adminAnalyticsRoutes');
const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
const adminLocationRoutes = require('./routes/adminLocationRoutes');
const adminRoleRoutes = require('./routes/adminRoleRoutes');
const adminAuditRoutes = require('./routes/adminAuditRoutes');
const adminPortfolioRoutes = require('./routes/adminPortfolioRoutes');
const adminProfileReportRoutes = require('./routes/adminProfileReportRoutes');
const adminOperationsRoutes = require('./routes/adminOperationsRoutes');
const adminMessagingRoutes = require('./routes/adminMessagingRoutes');
const { userRouter: jobReportUserRoutes, adminRouter: jobReportAdminRoutes } = require('./routes/jobReportRoutes');
const { router: supportTicketRoutes, adminRouter: supportTicketAdminRoutes } = require('./routes/supportTicketRoutes');
const { router: promotionRoutes, adminRouter: promotionAdminRoutes } = require('./routes/promotionRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const emailPreviewRoutes = require('./routes/emailPreviewRoutes');
const emailUnsubscribeRoutes = require('./routes/emailUnsubscribeRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Behind a reverse proxy (typical in production), this is required
// for req.secure / x-forwarded-for to be trusted correctly.
app.set('trust proxy', 1);

// The LiveKit connect-src entries below used to hardcode
// *.livekit.cloud, which silently breaks the WebSocket connection
// (the browser blocks it before it ever reaches the network) for any
// LiveKit deployment that isn't on LiveKit Cloud under that exact
// domain pattern -- a self-hosted server, a different cloud project
// host, anything. Deriving it from the actual configured LIVEKIT_URL
// means this is correct for whatever LiveKit deployment is actually
// in use, instead of assuming one provider. The *.livekit.cloud
// wildcard is kept alongside it for the common case where LIVEKIT_URL
// itself points at a LiveKit Cloud project.
const livekitConnectSrc = ['https://*.livekit.cloud', 'wss://*.livekit.cloud'];
if (env.LIVEKIT_URL) {
  try {
    const livekitHost = new URL(env.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')).host;
    livekitConnectSrc.push(`https://${livekitHost}`, `wss://${livekitHost}`);
  } catch {
    logger.warn('LIVEKIT_URL is set but is not a valid URL -- CSP connect-src will not include it', { livekitUrl: env.LIVEKIT_URL });
  }
}

// This server now also serves the frontend's static HTML/CSS/JS
// (see the express.static block below) — Helmet's default Content-
// Security-Policy would silently block every page's own inline
// <script> block (all 29 pages use one; there's no bundler to move
// that logic into external files), plus the two CDN libraries the
// app already loads (LiveKit's client SDK, qrcodejs) and images/
// videos served from Supabase Storage's own domain. Every other
// default Helmet protection (frame-ancestors, object-src 'none',
// etc.) stays exactly as-is; only script-src/img-src/media-src/
// connect-src are widened to cover what this app already does.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
        'img-src': ["'self'", 'data:', 'https://*.supabase.co'],
        'media-src': ["'self'", 'https://*.supabase.co'],
        'connect-src': ["'self'", ...livekitConnectSrc],
      },
    },
  })
);

// Sign in with Apple uses response_mode=form_post: Apple's own page
// submits an actual cross-origin POST form to this route, which
// browsers tag with an Origin: https://appleid.apple.com header (a
// plain top-level GET redirect, like Google/Facebook's callbacks,
// normally doesn't send one). That Origin would never match this
// app's own allowlist below, so this route -- like the Paystack
// webhook -- must be mounted with its own body parser and BEFORE the
// CORS middleware, or every Apple login would be rejected as a CORS
// violation before ever reaching the handler.
app.post('/api/auth/apple/callback', express.urlencoded({ extended: false }), authController.appleCallback);

// APP_BASE_URL is normally one origin, but accepts a comma-separated
// list so the same deployment can be pointed at more than one
// frontend at once if needed (e.g. testing a deployed Render backend
// against a local dev frontend). credentials:true means this can
// never be "*" — the session cookie requires an explicit, real origin.
const allowedOrigins = env.APP_BASE_URL.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header at all (server-to-server calls, curl, the
      // Paystack webhook) — nothing to check against, let it through.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // required so the session cookie is sent cross-origin from the frontend
  })
);

// Paystack webhook MUST be mounted with a raw-body parser, and BEFORE
// express.json() below — signature verification needs the exact raw
// bytes Paystack signed, not a re-serialized parsed-then-stringified body.
app.post('/api/escrow/webhook', express.raw({ type: 'application/json' }), escrowController.webhook);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/saved-jobs', savedJobRoutes);
app.use('/api/saved-profiles', savedProfileRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/verification', verificationWorkerRoutes);
app.use('/api/admin/verification', verificationAdminRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin/finance', financeAdminRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin/reviews', reviewAdminRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin/disputes', disputeAdminRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin/subscriptions', subscriptionAdminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/jobs', jobReportUserRoutes);
app.use('/api/support/tickets', supportTicketRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/admin/locations', adminLocationRoutes);
app.use('/api/admin/admins', adminRoleRoutes);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/portfolio', adminPortfolioRoutes);
app.use('/api/admin/profile-reports', adminProfileReportRoutes);
app.use('/api/admin/operations', adminOperationsRoutes);
app.use('/api/admin/messaging', adminMessagingRoutes);
app.use('/api/admin/jobs', jobReportAdminRoutes);
app.use('/api/admin/support/tickets', supportTicketAdminRoutes);
app.use('/api/admin/promotions', promotionAdminRoutes);
// MUST be the LAST /api/admin/* mount: this router is bound to the bare
// /api/admin prefix (its own routes are /categories and /skills) with a
// router-wide requireAdmin('content_admin') check. Since Express tries
// mounted routers in registration order and that check runs
// unconditionally for anything matching /api/admin/*, mounting this
// before any more specific /api/admin/<x> route silently forces every
// admin — regardless of their actual role — through a content_admin
// check before ever reaching the route they meant to call. That bug
// was invisible in practice because the only admin role ever tested
// here (super_admin) bypasses every requireAdmin(...) check by design
// — a moderation_admin/support_admin/finance_admin/verification_admin
// hitting ANY other /api/admin/* route got wrongly rejected as
// FORBIDDEN. Discovered while adding /api/admin/profile-reports above.
app.use('/api/admin', adminCategoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/email-preview', emailPreviewRoutes);
app.use('/api/email', emailUnsubscribeRoutes);

// Serves the frontend (plain static HTML/CSS/JS, no build step) from
// this same service. Registered after every /api/* route above, so
// Express always matches a real API route first — this can never
// shadow the API. Not a single-page app (every page is its own real
// .html file, no client-side router), so no wildcard "serve
// index.html for anything unmatched" fallback: express.static already
// serves index.html for "/" on its own, and correctly 404s a genuinely
// missing path instead of masking it as a fake success.
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`JOB RUSH auth service listening on port ${env.PORT}`, { env: env.NODE_ENV });
});

module.exports = app;

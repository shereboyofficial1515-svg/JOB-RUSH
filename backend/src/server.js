const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
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
        'connect-src': ["'self'", 'https://*.livekit.cloud', 'wss://*.livekit.cloud'],
      },
    },
  })
);

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
app.use('/api/admin', adminCategoryRoutes);
app.use('/api/admin/locations', adminLocationRoutes);
app.use('/api/admin/admins', adminRoleRoutes);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/portfolio', adminPortfolioRoutes);
app.use('/api/admin/operations', adminOperationsRoutes);
app.use('/api/admin/messaging', adminMessagingRoutes);
app.use('/api/admin/jobs', jobReportAdminRoutes);
app.use('/api/admin/support/tickets', supportTicketAdminRoutes);
app.use('/api/admin/promotions', promotionAdminRoutes);
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

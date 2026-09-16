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

app.use(helmet());
app.use(
  cors({
    origin: env.APP_BASE_URL,
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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`JOB RUSH auth service listening on port ${env.PORT}`, { env: env.NODE_ENV });
});

module.exports = app;

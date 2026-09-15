const express = require('express');
const env = require('../config/env');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const templates = require('../emails/templates');

const router = express.Router();

/**
 * Preview rendering only — never sends anything. Gated so it's never
 * reachable in production without admin credentials (per spec section
 * 22: "Only expose preview functionality in development/admin-
 * authorized environments"). In development it's open for convenience
 * during template work.
 */
if (env.NODE_ENV === 'production') {
  router.use(authenticate, requireAdmin());
}

// Representative sample data for every template — long names/titles
// mixed in deliberately so overflow/wrapping is visible while eyeballing.
const SAMPLE_DATA = {
  welcome: { firstName: 'Ada' },
  verification: { firstName: 'Ada', code: '482913', expirationTime: '10 minutes' },
  loginAlert: {
    firstName: 'Ada', device: 'Windows PC', browser: 'Chrome', location: 'Asaba, Delta State, Nigeria', loginTime: new Date().toISOString(),
  },
  passwordReset: { firstName: 'Ada', resetUrl: `${env.APP_BASE_URL}/pages/forgot-password.html?token=sample`, expirationTime: '30 minutes' },
  accountApproved: { firstName: 'Ada' },
  verificationRejected: { firstName: 'Ada', verificationReason: 'The uploaded government ID photo was blurry and could not be verified.' },
  proActivated: { firstName: 'Chidinma', planName: 'PRO Monthly', amount: 4000, currency: 'NGN', billingCycle: 'Monthly', nextBillingDate: new Date(Date.now() + 30 * 86400000).toISOString() },
  proRenewed: { firstName: 'Chidinma', expiryDate: new Date(Date.now() + 30 * 86400000).toISOString() },
  proExpiring: { firstName: 'Chidinma', expiryDate: new Date(Date.now() + 3 * 86400000).toISOString() },
  proCancelled: { firstName: 'Chidinma', expiryDate: new Date(Date.now() + 12 * 86400000).toISOString() },
  applicationSubmitted: {
    firstName: 'Ada', jobTitle: 'Senior Frontend Developer (React) — Long-Term Remote Contract', hirerName: 'ABC Technologies Ltd', location: 'Asaba, Delta State', submittedAt: new Date().toISOString(),
  },
  newApplication: { firstName: 'ABC Technologies', applicantName: 'Ada Chukwu', jobTitle: 'Frontend Developer', submittedAt: new Date().toISOString() },
  applicationStatus: { firstName: 'Ada', jobTitle: 'Frontend Developer', applicationStatus: 'shortlisted', statusMessage: 'The hirer would like to schedule an interview with you.' },
  interviewInvitation: { firstName: 'Ada', jobTitle: 'Frontend Developer', interviewDate: 'September 20, 2026', interviewTime: '2:00 PM WAT', interviewType: 'Video call' },
  newMessage: { firstName: 'Ada', senderName: 'ABC Technologies', messagePreview: 'Hi Ada, thanks for applying — are you available for a quick call this week?', showPreview: true },
  paymentReceived: { firstName: 'Ada', reference: 'PSK-20260914-00931', amount: 150000, currency: 'NGN', date: new Date().toISOString(), description: 'Milestone payment — Frontend Developer contract' },
  paymentFailed: { firstName: 'Ada', amount: 4000, reference: 'PSK-20260914-00932', reason: 'Insufficient funds on the card used.' },
  withdrawalRequested: { firstName: 'Ada', amount: 75000, reference: 'WD-20260914-0021', requestedAt: new Date().toISOString() },
  withdrawalCompleted: { firstName: 'Ada', amount: 75000, reference: 'WD-20260914-0021', completedAt: new Date().toISOString() },
  contract: { firstName: 'Ada', contractTitle: 'Frontend Developer Engagement', otherParty: 'ABC Technologies Ltd', status: 'Active' },
  disputeUpdate: { firstName: 'Ada', disputeReference: 'DSP-2026-0088', status: 'Under review', message: 'Our team is reviewing the evidence submitted by both parties.' },
  supportTicketCreated: { firstName: 'Ada', ticketNumber: 'TCK-10432', subject: 'Unable to withdraw funds' },
  supportTicketUpdated: { firstName: 'Ada', ticketNumber: 'TCK-10432', status: 'resolved', response: 'This has been resolved — your withdrawal was processed. Let us know if you have further questions.' },
  accountDeactivated: { firstName: 'Ada' },
  generic: { firstName: 'Ada', title: 'Platform announcement', body: 'This is a generic fallback notification, used for any event without a dedicated template.' },
};

const TEMPLATE_FNS = {
  welcome: templates.welcomeEmail,
  verification: templates.verificationEmail,
  loginAlert: templates.loginAlertEmail,
  passwordReset: templates.passwordResetEmail,
  accountApproved: templates.accountApprovedEmail,
  verificationRejected: templates.verificationRejectedEmail,
  proActivated: templates.proActivatedEmail,
  proRenewed: templates.proRenewedEmail,
  proExpiring: templates.proExpiringEmail,
  proCancelled: templates.proCancelledEmail,
  applicationSubmitted: templates.applicationSubmittedEmail,
  newApplication: templates.newApplicationEmail,
  applicationStatus: templates.applicationStatusEmail,
  interviewInvitation: templates.interviewInvitationEmail,
  newMessage: templates.newMessageEmail,
  paymentReceived: templates.paymentReceivedEmail,
  paymentFailed: templates.paymentFailedEmail,
  withdrawalRequested: templates.withdrawalRequestedEmail,
  withdrawalCompleted: templates.withdrawalCompletedEmail,
  contract: templates.contractEmail,
  disputeUpdate: templates.disputeUpdateEmail,
  supportTicketCreated: templates.supportTicketCreatedEmail,
  supportTicketUpdated: templates.supportTicketUpdatedEmail,
  accountDeactivated: templates.accountDeactivatedEmail,
  generic: templates.genericNotificationEmail,
};

router.get('/', (req, res) => {
  const list = Object.keys(TEMPLATE_FNS)
    .map((key) => `<li><a href="/api/email-preview/${key}">${key}</a> (<a href="/api/email-preview/${key}?format=text">text</a>)</li>`)
    .join('');
  res.status(200).send(`<h1>JOB RUSH email template previews</h1><ul>${list}</ul>`);
});

router.get('/:template', (req, res) => {
  const templateFn = TEMPLATE_FNS[req.params.template];
  if (!templateFn) {
    return res.status(404).json({ error: 'Unknown template.', code: 'NOT_FOUND', available: Object.keys(TEMPLATE_FNS) });
  }
  const data = { ...SAMPLE_DATA[req.params.template], ...req.query };
  const rendered = templateFn(data);

  if (req.query.format === 'text') {
    res.status(200).type('text/plain').send(rendered.text);
  } else if (req.query.format === 'json') {
    res.status(200).json(rendered);
  } else {
    res.status(200).type('text/html').send(rendered.html);
  }
});

module.exports = router;

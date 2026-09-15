const templates = require('./templates');

/**
 * Maps each `notifications.type` (see notificationService.CHANNEL_POLICY)
 * to the template that should represent it by email. This is the
 * piece that turns the old "wrap title/body in a <p> tag" behavior
 * into the full branded system — every existing call site that
 * builds a `data` object for notifyUser(...) keeps working unchanged;
 * whatever extra fields it includes (jobTitle, amount, reference, ...)
 * populate the richer template automatically.
 *
 * A type with no entry here still gets a fully branded email via
 * genericNotificationEmail — nothing ever falls back to raw HTML.
 */
const TEMPLATE_BY_TYPE = {
  application_submitted: templates.applicationSubmittedEmail,
  application_received: templates.newApplicationEmail,
  // job_invitation and interview_response don't match any of the 24
  // dedicated templates closely enough to reuse one without the copy
  // reading wrong — genericNotificationEmail still gives them the
  // full branded treatment via the fallback below.
  application_status_changed: templates.applicationStatusEmail,
  interview_scheduled: templates.interviewInvitationEmail,
  interview_cancelled: templates.applicationStatusEmail,
  escrow_funded: templates.paymentReceivedEmail,
  escrow_released: templates.paymentReceivedEmail,
  withdrawal_requested: templates.withdrawalRequestedEmail,
  withdrawal_approved: templates.withdrawalCompletedEmail,
  withdrawal_rejected: templates.paymentFailedEmail,
  verification_approved: templates.accountApprovedEmail,
  verification_rejected: templates.verificationRejectedEmail,
  subscription_activated: templates.proActivatedEmail,
  subscription_expiring: templates.proExpiringEmail,
  subscription_expired: templates.proExpiringEmail,
  subscription_renewed: templates.proRenewedEmail,
  subscription_cancelled: templates.proCancelledEmail,
  dispute_opened: templates.disputeUpdateEmail,
  dispute_resolved: templates.disputeUpdateEmail,
  new_device_login: templates.loginAlertEmail,
  new_message: templates.newMessageEmail,
  contract_created: templates.contractEmail,
  support_ticket_created: templates.supportTicketCreatedEmail,
  support_ticket_updated: templates.supportTicketUpdatedEmail,
  account_deactivated: templates.accountDeactivatedEmail,
};

/**
 * Renders the email for a notification. `title`/`body` (already
 * human-written at every existing call site) are always available as
 * a floor — templates that want structured fields (jobTitle, amount,
 * reference, ...) read them from `data`, falling back gracefully
 * when a call site hasn't been enriched with that specific field yet.
 */
function renderNotificationEmail({ type, title, body, data = {}, firstName }) {
  const templateFn = TEMPLATE_BY_TYPE[type] || templates.genericNotificationEmail;
  return templateFn({ firstName, title, body, ...data });
}

module.exports = { renderNotificationEmail };

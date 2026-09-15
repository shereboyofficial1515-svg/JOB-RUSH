const branding = require('../config/emailBranding');
const { escapeHtml } = require('../utils/escapeHtml');
const { renderInfoCard, renderStatusBadge } = require('./components');
const { baseEmailTemplate, buildPlainText } = require('./layout');

const APP = branding.appBaseUrl;
const page = (p) => `${APP}/pages/${p}`;

/** "there" instead of ever printing "Hello undefined,". */
function firstNameOf(data) {
  return (data && data.firstName && String(data.firstName).trim()) || 'there';
}
function money(amount, currency = 'NGN') {
  if (amount === undefined || amount === null || amount === '') return null;
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  const n = Number(amount);
  return `${symbol}${Number.isFinite(n) ? n.toLocaleString() : amount}`;
}
function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

// ============================================================
// A. Welcome / account created
// ============================================================
function welcomeEmail(data) {
  const firstName = firstNameOf(data);
  const heading = 'Welcome to JOB RUSH';
  const preheader = 'Your JOB RUSH account is ready.';
  const greeting = `Hello ${firstName},`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">Welcome to JOB RUSH.</p>
    <p style="margin:0;">Your account has been successfully created. You can now build your professional profile, discover opportunities, connect with hirers, and manage your work from one place.</p>`;
  const primaryAction = { label: 'Complete Your Profile', url: page('profile-settings.html') };
  const secondaryNote = 'Complete your profile to improve your visibility and help hirers better understand your skills and experience.';
  return {
    subject: 'Welcome to JOB RUSH',
    preheader,
    html: baseEmailTemplate({
      subject: 'Welcome to JOB RUSH',
      preheader,
      heading,
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: bodyHtml + `<p style="margin:16px 0 0; color:${branding.colors.mutedText};">${escapeHtml(secondaryNote)}</p>`,
      primaryAction,
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'Welcome to JOB RUSH.',
        'Your account has been successfully created. You can now build your professional profile, discover opportunities, connect with hirers, and manage your work from one place.',
        secondaryNote,
      ],
      primaryAction,
    }),
  };
}

// ============================================================
// B. Email verification (OTP-based — see otpService/authService)
// ============================================================
function verificationEmail(data) {
  const firstName = firstNameOf(data);
  const heading = 'Verify Your Email Address';
  const preheader = 'Confirm your email address to secure your account.';
  const greeting = `Hello ${firstName},`;
  const expirationTime = data.expirationTime || '10 minutes';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Please verify your email address to complete your JOB RUSH account setup.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
      <tr><td style="background:${branding.colors.lightBlue}; border-radius:8px; padding:16px 24px; font-family:'Courier New',monospace; font-size:28px; font-weight:700; letter-spacing:6px; color:${branding.colors.primaryNavy};">${escapeHtml(data.code || '')}</td></tr>
    </table>
    <p style="margin:0;">This verification code will expire after ${escapeHtml(expirationTime)}.</p>`;
  return {
    subject: 'Verify your JOB RUSH email address',
    preheader,
    html: baseEmailTemplate({
      subject: 'Verify your JOB RUSH email address',
      preheader,
      heading,
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml,
      primaryAction: { label: 'Continue to JOB RUSH', url: page('verify-otp.html') },
      securityNote: 'If you did not create a JOB RUSH account, you can safely ignore this email.',
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'Please verify your email address to complete your JOB RUSH account setup.',
        `Your verification code: ${data.code || ''}`,
        `This code will expire after ${expirationTime}.`,
      ],
      secondaryText: 'If you did not create a JOB RUSH account, you can safely ignore this email.',
    }),
  };
}

// ============================================================
// C. Login / new device alert
// ============================================================
function loginAlertEmail(data) {
  const firstName = firstNameOf(data);
  const heading = 'New Sign-In Detected';
  const preheader = 'We detected a new sign-in to your account.';
  const greeting = `Hello ${firstName},`;
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Device', value: data.device },
      { label: 'Browser', value: data.browser },
      { label: 'Approximate location', value: data.location },
      { label: 'Time', value: fmtDate(data.loginTime) },
    ],
  });
  return {
    subject: 'New sign-in to your JOB RUSH account',
    preheader,
    html: baseEmailTemplate({
      subject: 'New sign-in to your JOB RUSH account',
      preheader,
      heading,
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">We detected a new sign-in to your JOB RUSH account.</p>`,
      infoCardHtml,
      primaryAction: { label: 'Review Account Activity', url: page('profile-settings.html?tab=sessions') },
      securityNote: 'If you do not recognize this activity, please secure your account immediately by changing your password and reviewing your active sessions.',
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['We detected a new sign-in to your JOB RUSH account.'],
      infoLines: [
        data.device && `Device: ${data.device}`,
        data.browser && `Browser: ${data.browser}`,
        data.location && `Approximate location: ${data.location}`,
        data.loginTime && `Time: ${fmtDate(data.loginTime)}`,
      ],
      primaryAction: { label: 'Review Account Activity', url: page('profile-settings.html?tab=sessions') },
      secondaryText: 'If you do not recognize this activity, please secure your account immediately.',
    }),
  };
}

// ============================================================
// D. Password reset
// ============================================================
function passwordResetEmail(data) {
  const firstName = firstNameOf(data);
  const heading = 'Reset Your Password';
  const preheader = 'Use this secure link to create a new password.';
  const greeting = `Hello ${firstName},`;
  const expirationTime = data.expirationTime || '30 minutes';
  return {
    subject: 'Reset your JOB RUSH password',
    preheader,
    html: baseEmailTemplate({
      subject: 'Reset your JOB RUSH password',
      preheader,
      heading,
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 12px;">We received a request to reset the password for your JOB RUSH account.</p>
        <p style="margin:0;">If you made this request, use the button below to create a new password.</p>`,
      primaryAction: { label: 'Reset Password', url: data.resetUrl },
      securityNote: `This link will expire after ${escapeHtml(expirationTime)}. If you did not request a password reset, no action is required.`,
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'We received a request to reset the password for your JOB RUSH account.',
        'If you made this request, use the link below to create a new password.',
      ],
      primaryAction: { label: 'Reset Password', url: data.resetUrl },
      secondaryText: `This link will expire after ${expirationTime}. If you did not request a password reset, no action is required.`,
    }),
  };
}

// ============================================================
// E. Account approved / verified
// ============================================================
function accountApprovedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your account verification is complete.';
  return {
    subject: 'Your JOB RUSH account has been approved',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH account has been approved',
      preheader,
      heading: 'Your Account Has Been Approved',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Verified', variant: 'success' }),
      bodyHtml: `
        <p style="margin:0 0 12px;">Your JOB RUSH account has successfully passed our verification process.</p>
        <p style="margin:0;">Your Verified status helps other users recognize that your account has completed the required verification process.</p>`,
      primaryAction: { label: 'View My Profile', url: page('profile-settings.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'Your JOB RUSH account has successfully passed our verification process.',
        'Your Verified status helps other users recognize that your account has completed the required verification process.',
      ],
      primaryAction: { label: 'View My Profile', url: page('profile-settings.html') },
    }),
  };
}

// ============================================================
// F. Account rejected / verification needs attention
// ============================================================
function verificationRejectedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'We need additional information to complete your verification.';
  return {
    subject: 'Action required: JOB RUSH verification',
    preheader,
    html: baseEmailTemplate({
      subject: 'Action required: JOB RUSH verification',
      preheader,
      heading: 'Verification Needs Attention',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Action required', variant: 'warning' }),
      bodyHtml: `
        <p style="margin:0 0 12px;">We were unable to complete your JOB RUSH verification with the information currently provided.</p>
        ${data.verificationReason ? `<p style="margin:0 0 12px;"><strong>Reason:</strong><br/>${escapeHtml(data.verificationReason)}</p>` : ''}
        <p style="margin:0;">Please review the information and submit the required documents or details again.</p>`,
      primaryAction: { label: 'Review Verification', url: page('profile-settings.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'We were unable to complete your JOB RUSH verification with the information currently provided.',
        data.verificationReason && `Reason: ${data.verificationReason}`,
        'Please review the information and submit the required documents or details again.',
      ],
      primaryAction: { label: 'Review Verification', url: page('profile-settings.html') },
    }),
  };
}

// ============================================================
// G. PRO badge purchase
// ============================================================
function proActivatedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your PRO features are now available.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Plan', value: data.planName },
      { label: 'Amount', value: money(data.amount, data.currency) },
      { label: 'Billing', value: data.billingCycle },
      { label: 'Next billing date', value: fmtDate(data.nextBillingDate) },
    ],
  });
  return {
    subject: 'Your JOB RUSH PRO membership is active',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH PRO membership is active',
      preheader,
      heading: 'Welcome to JOB RUSH PRO',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 12px;">Your JOB RUSH PRO membership has been successfully activated.</p>
        <p style="margin:0;">Your PRO membership gives you access to additional visibility and professional features designed to help you showcase your work and stand out on the platform. This is separate from account verification — your Verified badge (if any) reflects identity verification, not your PRO membership.</p>`,
      infoCardHtml,
      primaryAction: { label: 'Explore PRO Features', url: page('pro.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'Your JOB RUSH PRO membership has been successfully activated.',
        'Your PRO membership gives you access to additional visibility and professional features. This is separate from account verification.',
      ],
      infoLines: [
        data.planName && `Plan: ${data.planName}`,
        money(data.amount, data.currency) && `Amount: ${money(data.amount, data.currency)}`,
        data.billingCycle && `Billing: ${data.billingCycle}`,
        data.nextBillingDate && `Next billing date: ${fmtDate(data.nextBillingDate)}`,
      ],
      primaryAction: { label: 'Explore PRO Features', url: page('pro.html') },
    }),
  };
}

// ============================================================
// H. PRO membership renewal
// ============================================================
function proRenewedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your PRO benefits continue uninterrupted.';
  return {
    subject: 'Your JOB RUSH PRO membership has renewed',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH PRO membership has renewed',
      preheader,
      heading: 'PRO Membership Renewed',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">Your JOB RUSH PRO membership has been successfully renewed. Your PRO benefits will remain active until ${data.expiryDate ? escapeHtml(fmtDate(data.expiryDate)) : 'your next billing date'}.</p>`,
      primaryAction: { label: 'Manage Membership', url: page('pro.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [`Your JOB RUSH PRO membership has been successfully renewed. Your PRO benefits will remain active until ${fmtDate(data.expiryDate) || 'your next billing date'}.`],
      primaryAction: { label: 'Manage Membership', url: page('pro.html') },
    }),
  };
}

// ============================================================
// I. PRO membership expiring
// ============================================================
function proExpiringEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Renew to keep your PRO benefits active.';
  return {
    subject: 'Your JOB RUSH PRO membership is expiring soon',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH PRO membership is expiring soon',
      preheader,
      heading: 'Your PRO Membership Is Expiring Soon',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Action required', variant: 'warning' }),
      bodyHtml: `<p style="margin:0;">Your JOB RUSH PRO membership is scheduled to expire on ${escapeHtml(fmtDate(data.expiryDate) || 'the upcoming billing date')}. Renew your membership to continue using your PRO benefits.</p>`,
      primaryAction: { label: 'Renew PRO', url: page('pro.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [`Your JOB RUSH PRO membership is scheduled to expire on ${fmtDate(data.expiryDate) || 'the upcoming billing date'}. Renew your membership to continue using your PRO benefits.`],
      primaryAction: { label: 'Renew PRO', url: page('pro.html') },
    }),
  };
}

// ============================================================
// J. PRO membership cancelled
// ============================================================
function proCancelledEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your PRO benefits remain active until the current period ends.';
  return {
    subject: 'Your JOB RUSH PRO membership has been cancelled',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH PRO membership has been cancelled',
      preheader,
      heading: 'PRO Membership Cancelled',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">Your JOB RUSH PRO membership has been cancelled. Your current benefits will remain available until ${escapeHtml(fmtDate(data.expiryDate) || 'the end of your current billing period')}.</p>`,
      primaryAction: { label: 'View Membership', url: page('pro.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [`Your JOB RUSH PRO membership has been cancelled. Your current benefits will remain available until ${fmtDate(data.expiryDate) || 'the end of your current billing period'}.`],
      primaryAction: { label: 'View Membership', url: page('pro.html') },
    }),
  };
}

// ============================================================
// K. Job application submitted
// ============================================================
function applicationSubmittedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = `Your application for ${data.jobTitle || 'this role'} has been successfully submitted.`;
  const infoCardHtml = renderInfoCard({
    title: 'Application Details',
    rows: [
      { label: 'Job', value: data.jobTitle },
      { label: 'Hirer', value: data.hirerName },
      { label: 'Location', value: data.location },
      { label: 'Submitted', value: fmtDate(data.submittedAt) },
    ],
  });
  return {
    subject: `Application submitted — ${data.jobTitle || 'JOB RUSH'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `Application submitted — ${data.jobTitle || 'JOB RUSH'}`,
      preheader,
      heading: 'Application Submitted',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">Your application for the following opportunity has been successfully submitted.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Application', url: page('applications.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your application for the following opportunity has been successfully submitted.'],
      infoLines: [
        data.jobTitle && `Job: ${data.jobTitle}`,
        data.hirerName && `Hirer: ${data.hirerName}`,
        data.location && `Location: ${data.location}`,
        data.submittedAt && `Submitted: ${fmtDate(data.submittedAt)}`,
      ],
      primaryAction: { label: 'View Application', url: page('applications.html') },
    }),
  };
}

// ============================================================
// L. New application for hirer
// ============================================================
function newApplicationEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = `A new application was submitted for ${data.jobTitle || 'your job posting'}.`;
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Applicant', value: data.applicantName },
      { label: 'Job', value: data.jobTitle },
      { label: 'Submitted', value: fmtDate(data.submittedAt) },
    ],
  });
  return {
    subject: `New application for ${data.jobTitle || 'your job'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `New application for ${data.jobTitle || 'your job'}`,
      preheader,
      heading: 'You Have a New Application',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">A new application has been submitted for your job posting.</p>`,
      infoCardHtml,
      primaryAction: { label: 'Review Application', url: page('applicants.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['A new application has been submitted for your job posting.'],
      infoLines: [
        data.applicantName && `Applicant: ${data.applicantName}`,
        data.jobTitle && `Job: ${data.jobTitle}`,
        data.submittedAt && `Submitted: ${fmtDate(data.submittedAt)}`,
      ],
      primaryAction: { label: 'Review Application', url: page('applicants.html') },
    }),
  };
}

// ============================================================
// M. Application status update
// ============================================================
const APPLICATION_STATUS_VARIANT = {
  hired: 'success', accepted: 'success', shortlisted: 'success',
  rejected: 'error', declined: 'error', withdrawn: 'neutral',
};
function applicationStatusEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = `Your application for ${data.jobTitle || 'this role'} has an update.`;
  const statusLabel = data.applicationStatus ? data.applicationStatus.replace(/_/g, ' ') : null;
  return {
    subject: `Application update — ${data.jobTitle || 'JOB RUSH'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `Application update — ${data.jobTitle || 'JOB RUSH'}`,
      preheader,
      heading: 'Application Status Updated',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: statusLabel ? renderStatusBadge({ label: statusLabel, variant: APPLICATION_STATUS_VARIANT[data.applicationStatus] || 'neutral' }) : '',
      bodyHtml: `
        <p style="margin:0 0 12px;">There has been an update to your application for <strong>${escapeHtml(data.jobTitle || 'a job posting')}</strong>.</p>
        ${data.statusMessage ? `<p style="margin:0;">${escapeHtml(data.statusMessage)}</p>` : ''}`,
      primaryAction: { label: 'View Application', url: page('applications.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        `There has been an update to your application for: ${data.jobTitle || 'a job posting'}`,
        statusLabel && `Status: ${statusLabel}`,
        data.statusMessage,
      ],
      primaryAction: { label: 'View Application', url: page('applications.html') },
    }),
  };
}

// ============================================================
// N. Interview invitation
// ============================================================
function interviewInvitationEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = `You're invited to an interview for ${data.jobTitle || 'a role'}.`;
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Date', value: data.interviewDate },
      { label: 'Time', value: data.interviewTime },
      { label: 'Interview type', value: data.interviewType },
    ],
  });
  return {
    subject: `Interview invitation — ${data.jobTitle || 'JOB RUSH'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `Interview invitation — ${data.jobTitle || 'JOB RUSH'}`,
      preheader,
      heading: "You're Invited to an Interview",
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">You have been invited to an interview for <strong>${escapeHtml(data.jobTitle || 'a role')}</strong>.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Interview', url: page('interviews.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [`You have been invited to an interview for ${data.jobTitle || 'a role'}.`],
      infoLines: [
        data.interviewDate && `Date: ${data.interviewDate}`,
        data.interviewTime && `Time: ${data.interviewTime}`,
        data.interviewType && `Interview type: ${data.interviewType}`,
      ],
      primaryAction: { label: 'View Interview', url: page('interviews.html') },
    }),
  };
}

// ============================================================
// O. New message
// ============================================================
function newMessageEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const senderName = data.senderName || 'Someone';
  const preheader = 'You have a new message on JOB RUSH.';
  // Respects the recipient's chat_message_previews setting — when
  // off, no message content reaches the email at all, only the fact
  // that a message arrived (see notificationService for the check).
  const showPreview = data.showPreview !== false && data.messagePreview;
  return {
    subject: `New message from ${senderName}`,
    preheader,
    html: baseEmailTemplate({
      subject: `New message from ${senderName}`,
      preheader,
      heading: 'You Have a New Message',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 ${showPreview ? '16' : '0'}px;">${escapeHtml(senderName)} sent you a new message on JOB RUSH.</p>
        ${showPreview ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${branding.colors.neutralBg}; border-radius:8px;"><tr><td style="padding:14px 18px; font-style:italic; color:${branding.colors.mutedText};">&ldquo;${escapeHtml(data.messagePreview)}&rdquo;</td></tr></table>` : ''}`,
      primaryAction: { label: 'Open Conversation', url: page('messages.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [`${senderName} sent you a new message on JOB RUSH.`, showPreview && `"${data.messagePreview}"`],
      primaryAction: { label: 'Open Conversation', url: page('messages.html') },
    }),
  };
}

// ============================================================
// P. Payment received
// ============================================================
function paymentReceivedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your payment has been successfully received and recorded.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Reference', value: data.reference },
      { label: 'Amount', value: money(data.amount, data.currency) },
      { label: 'Date', value: fmtDate(data.date) },
      { label: 'Description', value: data.description },
    ],
  });
  return {
    subject: 'Payment received — JOB RUSH',
    preheader,
    html: baseEmailTemplate({
      subject: 'Payment received — JOB RUSH',
      preheader,
      heading: 'Payment Received',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Successful', variant: 'success' }),
      bodyHtml: `<p style="margin:0;">Your payment has been successfully received and recorded on JOB RUSH.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Payment', url: page('wallet.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your payment has been successfully received and recorded on JOB RUSH.'],
      infoLines: [
        data.reference && `Reference: ${data.reference}`,
        money(data.amount, data.currency) && `Amount: ${money(data.amount, data.currency)}`,
        data.date && `Date: ${fmtDate(data.date)}`,
        data.description && `Description: ${data.description}`,
      ],
      primaryAction: { label: 'View Payment', url: page('wallet.html') },
    }),
  };
}

// ============================================================
// Q. Payment failed
// ============================================================
function paymentFailedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'We were unable to complete your payment.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Amount', value: money(data.amount, data.currency) },
      { label: 'Reference', value: data.reference },
      { label: 'Reason', value: data.reason },
    ],
  });
  return {
    subject: 'Payment unsuccessful — JOB RUSH',
    preheader,
    html: baseEmailTemplate({
      subject: 'Payment unsuccessful — JOB RUSH',
      preheader,
      heading: 'Payment Could Not Be Completed',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Failed', variant: 'error' }),
      bodyHtml: `<p style="margin:0;">We were unable to complete your payment.</p>`,
      infoCardHtml,
      primaryAction: { label: 'Try Again', url: page('wallet.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['We were unable to complete your payment.'],
      infoLines: [
        money(data.amount, data.currency) && `Amount: ${money(data.amount, data.currency)}`,
        data.reference && `Reference: ${data.reference}`,
        data.reason && `Reason: ${data.reason}`,
      ],
      primaryAction: { label: 'Try Again', url: page('wallet.html') },
    }),
  };
}

// ============================================================
// R. Withdrawal request received
// ============================================================
function withdrawalRequestedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your withdrawal request is being processed.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Amount', value: money(data.amount, data.currency) },
      { label: 'Reference', value: data.reference },
      { label: 'Requested', value: fmtDate(data.requestedAt) },
    ],
  });
  return {
    subject: 'Withdrawal request received',
    preheader,
    html: baseEmailTemplate({
      subject: 'Withdrawal request received',
      preheader,
      heading: 'Withdrawal Request Received',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Processing', variant: 'neutral' }),
      bodyHtml: `<p style="margin:0;">Your withdrawal request has been received and is being processed.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Wallet', url: page('wallet.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your withdrawal request has been received and is being processed.'],
      infoLines: [
        money(data.amount, data.currency) && `Amount: ${money(data.amount, data.currency)}`,
        data.reference && `Reference: ${data.reference}`,
        data.requestedAt && `Requested: ${fmtDate(data.requestedAt)}`,
      ],
      primaryAction: { label: 'View Wallet', url: page('wallet.html') },
    }),
  };
}

// ============================================================
// S. Withdrawal completed
// ============================================================
function withdrawalCompletedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your withdrawal has been successfully processed.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Amount', value: money(data.amount, data.currency) },
      { label: 'Reference', value: data.reference },
      { label: 'Completed', value: fmtDate(data.completedAt) },
    ],
  });
  return {
    subject: 'Withdrawal completed',
    preheader,
    html: baseEmailTemplate({
      subject: 'Withdrawal completed',
      preheader,
      heading: 'Withdrawal Completed',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: renderStatusBadge({ label: 'Completed', variant: 'success' }),
      bodyHtml: `<p style="margin:0;">Your withdrawal has been successfully processed.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Wallet', url: page('wallet.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your withdrawal has been successfully processed.'],
      infoLines: [
        money(data.amount, data.currency) && `Amount: ${money(data.amount, data.currency)}`,
        data.reference && `Reference: ${data.reference}`,
        data.completedAt && `Completed: ${fmtDate(data.completedAt)}`,
      ],
      primaryAction: { label: 'View Wallet', url: page('wallet.html') },
    }),
  };
}

// ============================================================
// T. Contract created / signed
// ============================================================
function contractEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'A contract has been created for your JOB RUSH engagement.';
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Contract', value: data.contractTitle },
      { label: 'Other party', value: data.otherParty },
      { label: 'Status', value: data.status },
    ],
  });
  return {
    subject: `Contract update — ${data.contractTitle || 'JOB RUSH'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `Contract update — ${data.contractTitle || 'JOB RUSH'}`,
      preheader,
      heading: 'Contract Ready',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">A contract has been created for your JOB RUSH engagement.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Contract', url: page('contracts.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['A contract has been created for your JOB RUSH engagement.'],
      infoLines: [
        data.contractTitle && `Contract: ${data.contractTitle}`,
        data.otherParty && `Other party: ${data.otherParty}`,
        data.status && `Status: ${data.status}`,
      ],
      primaryAction: { label: 'View Contract', url: page('contracts.html') },
    }),
  };
}

// ============================================================
// U. Dispute update
// ============================================================
function disputeUpdateEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'There has been an update to your JOB RUSH dispute.';
  return {
    subject: 'Update on your JOB RUSH dispute',
    preheader,
    html: baseEmailTemplate({
      subject: 'Update on your JOB RUSH dispute',
      preheader,
      heading: 'Dispute Update',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 12px;">There has been an update to your JOB RUSH dispute${data.disputeReference ? ` (Reference: ${escapeHtml(data.disputeReference)})` : ''}.</p>
        ${data.status ? `<p style="margin:0 0 12px;"><strong>Status:</strong> ${escapeHtml(data.status)}</p>` : ''}
        ${data.message ? `<p style="margin:0;">${escapeHtml(data.message)}</p>` : ''}`,
      primaryAction: { label: 'View Dispute', url: page('contracts.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'There has been an update to your JOB RUSH dispute.',
        data.disputeReference && `Reference: ${data.disputeReference}`,
        data.status && `Status: ${data.status}`,
        data.message,
      ],
      primaryAction: { label: 'View Dispute', url: page('contracts.html') },
    }),
  };
}

// ============================================================
// V. Support ticket created
// ============================================================
function supportTicketCreatedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = "We've received your support request.";
  const infoCardHtml = renderInfoCard({
    rows: [
      { label: 'Ticket', value: data.ticketNumber },
      { label: 'Subject', value: data.subject },
    ],
  });
  return {
    subject: `Support request received — ${data.ticketNumber || 'JOB RUSH'}`,
    preheader,
    html: baseEmailTemplate({
      subject: `Support request received — ${data.ticketNumber || 'JOB RUSH'}`,
      preheader,
      heading: "We've Received Your Request",
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 12px;">Your support request has been received by the JOB RUSH support team.</p>
        <p style="margin:0;">We will provide updates as your request is reviewed.</p>`,
      infoCardHtml,
      primaryAction: { label: 'View Support Request', url: page('profile-settings.html?tab=support') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your support request has been received by the JOB RUSH support team.', 'We will provide updates as your request is reviewed.'],
      infoLines: [data.ticketNumber && `Ticket: ${data.ticketNumber}`, data.subject && `Subject: ${data.subject}`],
      primaryAction: { label: 'View Support Request', url: page('profile-settings.html?tab=support') },
    }),
  };
}

// ============================================================
// W. Support ticket updated
// ============================================================
function supportTicketUpdatedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your support request has been updated.';
  const statusLabel = data.status ? data.status.replace(/_/g, ' ') : null;
  return {
    subject: 'Your JOB RUSH support request has been updated',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH support request has been updated',
      preheader,
      heading: 'Support Request Updated',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      statusHtml: statusLabel ? renderStatusBadge({ label: statusLabel, variant: statusLabel === 'resolved' ? 'success' : 'neutral' }) : '',
      bodyHtml: `
        <p style="margin:0 0 12px;">Your support request has been updated.</p>
        ${data.ticketNumber ? `<p style="margin:0 0 12px;"><strong>Ticket:</strong> ${escapeHtml(data.ticketNumber)}</p>` : ''}
        ${data.response ? `<p style="margin:0;">${escapeHtml(data.response)}</p>` : ''}`,
      primaryAction: { label: 'View Support Request', url: page('profile-settings.html?tab=support') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: ['Your support request has been updated.', data.ticketNumber && `Ticket: ${data.ticketNumber}`, statusLabel && `Status: ${statusLabel}`, data.response],
      primaryAction: { label: 'View Support Request', url: page('profile-settings.html?tab=support') },
    }),
  };
}

// ============================================================
// X. Account deactivated
// ============================================================
function accountDeactivatedEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const preheader = 'Your JOB RUSH account has been deactivated.';
  return {
    subject: 'Your JOB RUSH account has been deactivated',
    preheader,
    html: baseEmailTemplate({
      subject: 'Your JOB RUSH account has been deactivated',
      preheader,
      heading: 'Account Deactivated',
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `
        <p style="margin:0 0 12px;">Your JOB RUSH account has been deactivated as requested. Log back in anytime to reactivate it.</p>
        <p style="margin:0;">If you believe this was done in error or you need assistance, please contact our support team.</p>`,
      primaryAction: { label: 'Contact Support', url: page('support.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [
        'Your JOB RUSH account has been deactivated as requested. Log back in anytime to reactivate it.',
        'If you believe this was done in error or you need assistance, please contact our support team.',
      ],
      primaryAction: { label: 'Contact Support', url: page('support.html') },
    }),
  };
}

// ============================================================
// Generic fallback — any notification type without a dedicated rich
// template above (e.g. plain announcements) still gets the full
// branded treatment, just without a custom info card.
// ============================================================
function genericNotificationEmail(data) {
  const firstName = firstNameOf(data);
  const greeting = `Hello ${firstName},`;
  const heading = data.title || 'Notification from JOB RUSH';
  const preheader = (data.body || heading).slice(0, 120);
  return {
    subject: heading,
    preheader,
    html: baseEmailTemplate({
      subject: heading,
      preheader,
      heading,
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml: `<p style="margin:0;">${escapeHtml(data.body || '')}</p>`,
      primaryAction: { label: 'Open JOB RUSH', url: page('dashboard.html') },
    }),
    text: buildPlainText({
      greeting,
      unsubscribeUrl: data.unsubscribeUrl,
      lines: [data.body],
      primaryAction: { label: 'Open JOB RUSH', url: page('dashboard.html') },
    }),
  };
}

module.exports = {
  genericNotificationEmail,
  welcomeEmail,
  verificationEmail,
  loginAlertEmail,
  passwordResetEmail,
  accountApprovedEmail,
  verificationRejectedEmail,
  proActivatedEmail,
  proRenewedEmail,
  proExpiringEmail,
  proCancelledEmail,
  applicationSubmittedEmail,
  newApplicationEmail,
  applicationStatusEmail,
  interviewInvitationEmail,
  newMessageEmail,
  paymentReceivedEmail,
  paymentFailedEmail,
  withdrawalRequestedEmail,
  withdrawalCompletedEmail,
  contractEmail,
  disputeUpdateEmail,
  supportTicketCreatedEmail,
  supportTicketUpdatedEmail,
  accountDeactivatedEmail,
};

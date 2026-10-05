/**
 * Notification categories: the groups a person switches on and off in Settings, and the single
 * place that says which category every notification type belongs to.
 *
 * The master "Push notifications" switch (notification_preferences.push_enabled) decides whether
 * Job Rush sends anything to this person's devices at all. A category switch decides whether that
 * kind of event is sent OFF the app (push, email, SMS). The in-app notification list always keeps
 * the event, so nothing is silently lost.
 *
 * This is the Job Rush preference only: whether the phone or browser lets notifications appear is
 * the operating system's permission, which the app cannot override.
 */

const CATEGORY_KEYS = [
  'messages', 'audio_calls', 'video_calls', 'missed_calls',
  'jobs', 'applications', 'interviews', 'payments', 'security', 'marketing',
];

// Security alerts can't be switched off: a person who disabled them would not hear about a new
// device signing in to their account.
const LOCKED_ON = ['security'];

const DEFAULTS = {
  messages: true, audio_calls: true, video_calls: true, missed_calls: true,
  jobs: true, applications: true, interviews: true, payments: true, security: true,
  marketing: false,
};

const CATEGORY_OF_TYPE = {
  new_message: 'messages',
  call_missed: 'missed_calls',
  job_invitation: 'jobs',
  contract_created: 'jobs',
  review_received: 'jobs',
  application_submitted: 'applications',
  application_received: 'applications',
  application_status_changed: 'applications',
  interview_scheduled: 'interviews',
  interview_response: 'interviews',
  interview_reminder: 'interviews',
  interview_cancelled: 'interviews',
  escrow_funded: 'payments',
  escrow_released: 'payments',
  withdrawal_requested: 'payments',
  withdrawal_approved: 'payments',
  withdrawal_rejected: 'payments',
  dispute_opened: 'payments',
  dispute_resolved: 'payments',
  subscription_activated: 'payments',
  subscription_renewed: 'payments',
  subscription_expiring: 'payments',
  subscription_expired: 'payments',
  subscription_cancelled: 'payments',
  referral_milestone_reward: 'payments',
  referral_reward_approved: 'payments',
  referral_reward_paid: 'payments',
  new_device_login: 'security',
  account_deactivated: 'security',
  verification_approved: 'security',
  verification_rejected: 'security',
  announcement: 'marketing',
};

/** Types that are not governed by a category switch (support replies, referral progress, ...). */
function categoryForType(type) {
  return CATEGORY_OF_TYPE[type] || null;
}

/** The person's category switches with defaults filled in and locked categories forced on. */
function resolveCategoryPrefs(stored) {
  const out = { ...DEFAULTS };
  const src = stored && typeof stored === 'object' ? stored : {};
  for (const key of CATEGORY_KEYS) if (typeof src[key] === 'boolean') out[key] = src[key];
  for (const key of LOCKED_ON) out[key] = true;
  return out;
}

/** Validates an update coming from the client: only known keys, only booleans, locked ones ignored. */
function sanitizeCategoryUpdate(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of CATEGORY_KEYS) {
    if (LOCKED_ON.includes(key)) continue;
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  return out;
}

module.exports = { CATEGORY_KEYS, LOCKED_ON, DEFAULTS, categoryForType, resolveCategoryPrefs, sanitizeCategoryUpdate };

const { z } = require('zod');

const updateSettingsSchema = z.object({
  messagingPermission: z.enum(['everyone', 'connections_only', 'no_one']).optional(),
  profileVisibility: z.enum(['public', 'private']).optional(),
  defaultCoverNote: z.string().trim().max(2000).optional(),
  requireCoverNote: z.boolean().optional(),

  siteTheme: z.enum(['dark', 'light', 'system']).optional(),
  chatTheme: z.enum(['dark', 'light', 'system']).optional(),
  chatWallpaper: z.string().trim().max(40).optional(),
  chatFontSize: z.enum(['small', 'default', 'large', 'extra_large']).optional(),
  chatMessagePreviews: z.boolean().optional(),
  mediaAutoDownload: z.enum(['never', 'wifi_only', 'always']).optional(),
  callRingtoneEnabled: z.boolean().optional(),
  callRingtoneId: z.enum(['classic', 'chime', 'pulse']).optional(),

  textSize: z.enum(['small', 'default', 'large', 'extra_large']).optional(),
  highContrast: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),

  onboardingStatus: z.enum(['not_started', 'completed', 'skipped']).optional(),
  referralIntroSeen: z.boolean().optional(),
});

/** camelCase API input -> snake_case columns, only for keys present. */
function toSnakeCaseSettingsInput(body) {
  const map = {
    messagingPermission: 'messaging_permission',
    profileVisibility: 'profile_visibility',
    defaultCoverNote: 'default_cover_note',
    requireCoverNote: 'require_cover_note',
    siteTheme: 'site_theme',
    chatTheme: 'chat_theme',
    chatWallpaper: 'chat_wallpaper',
    chatFontSize: 'chat_font_size',
    chatMessagePreviews: 'chat_message_previews',
    mediaAutoDownload: 'media_auto_download',
    callRingtoneEnabled: 'call_ringtone_enabled',
    callRingtoneId: 'call_ringtone_id',
    textSize: 'text_size',
    highContrast: 'high_contrast',
    reducedMotion: 'reduced_motion',
    onboardingStatus: 'onboarding_status',
    referralIntroSeen: 'referral_intro_seen',
  };
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    out[map[key] || key] = value;
  }
  return out;
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { updateSettingsSchema, toSnakeCaseSettingsInput, validateBody };

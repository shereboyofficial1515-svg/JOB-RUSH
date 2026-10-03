/**
 * Conservative parsers for the free-text values that existed before
 * structured schedules/durations: "Mon-Fri", "8am-6am", "Mon-Fri, 10am-5am",
 * "30", "2 weeks".
 *
 * The rule throughout is "convert only what is unambiguous; otherwise return
 * null / ambiguous and let the caller preserve the original text". A guess
 * that silently changes what a person meant is worse than leaving the old
 * value in place and asking them to confirm it.
 *
 * Used by the one-time backfill (database/backfillStructuredSchedules.js).
 */

const DAY_IDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_TOKENS = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

function normalizeDaysText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\b(through|thru|until|till|to)\b/g, '-')
    .replace(/\./g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Mon-Fri" / "Monday to Friday" / "Mon, Wed, Fri" / "weekdays" / "every day" -> ['monday', ...] or null. */
function parseLegacyDays(text) {
  if (typeof text !== 'string') return null;
  const s = normalizeDaysText(text);
  if (!s) return null;
  const compact = s.replace(/[\s,]/g, '');
  if (['everyday', 'daily', 'alldays', 'allweek', '7days', 'sevendays', '7daysaweek'].includes(compact)) return [...DAY_IDS];
  if (['weekdays', 'weekday'].includes(compact)) return DAY_IDS.slice(0, 5);
  if (['weekends', 'weekend'].includes(compact)) return DAY_IDS.slice(5);

  const picked = new Set();
  for (const part of s.split(/\s*(?:,|&|\/|\band\b)\s*/)) {
    if (!part) continue;
    if (part.includes('-')) {
      const bits = part.split('-');
      if (bits.length !== 2) return null;
      const a = DAY_TOKENS[bits[0].trim()];
      const b = DAY_TOKENS[bits[1].trim()];
      if (a === undefined || b === undefined) return null;
      for (let i = a; ; i = (i + 1) % 7) { // a range may wrap the week (Sat-Mon)
        picked.add(i);
        if (i === b) break;
      }
    } else {
      const d = DAY_TOKENS[part.trim()];
      if (d === undefined) return null;
      picked.add(d);
    }
  }
  return picked.size ? DAY_IDS.filter((_, i) => picked.has(i)) : null;
}

function toHHMM(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function toMinutes(hourText, minuteText, meridiem, treatAs24h) {
  const hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return ((hour % 12) + (meridiem === 'pm' ? 12 : 0)) * 60 + minute;
  }
  if (treatAs24h && hour <= 23) return hour * 60 + minute;
  return null; // "8" with no am/pm and nothing to disambiguate it
}

const TIME_RANGE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

/**
 * "8am-6pm" -> { start:'08:00', end:'18:00' }.
 * { ambiguous:true, reason } when the text is a time range but can't be read
 * with certainty (no am/pm, or the end is not after the start -- "8am-6am"
 * could be a typo for 6pm or a real overnight shift, and only the person
 * knows which). null when it isn't a time range at all.
 */
function parseLegacyTimeRange(text) {
  if (typeof text !== 'string') return null;
  const m = new RegExp(`^\\s*${TIME_RANGE.source}\\s*$`, 'i').exec(text);
  if (!m) return null;
  const [, h1, m1, p1raw, h2, m2, p2raw] = m;
  const p1 = p1raw && p1raw.toLowerCase();
  const p2 = p2raw && p2raw.toLowerCase();
  const is24h = !p1 && !p2 && (Number(h1) >= 13 || Number(h2) >= 13);
  const start = toMinutes(h1, m1, p1, is24h);
  const end = toMinutes(h2, m2, p2, is24h);
  if (start === null || end === null) return { ambiguous: true, reason: 'missing_am_pm' };
  if (end <= start) return { ambiguous: true, reason: 'end_not_after_start', start: toHHMM(start), end: toHHMM(end) };
  return { ambiguous: false, start: toHHMM(start), end: toHHMM(end) };
}

/** Old worker profile fields -> what can be safely structured. */
function parseLegacyWorkingSchedule(daysText, hoursText) {
  const days = daysText ? parseLegacyDays(daysText) : null;
  const hours = hoursText ? parseLegacyTimeRange(hoursText) : null;
  return {
    days,
    hours: hours && !hours.ambiguous ? { start: hours.start, end: hours.end } : null,
    hoursNeedReview: !!hoursText && !(hours && !hours.ambiguous),
    daysNeedReview: !!daysText && !days,
  };
}

/**
 * "Mon-Fri, 10am-5pm" -> a 7-entry day-by-day schedule, or
 * { ok:false, reason } when it can't be read with certainty. Only a single
 * days + single time-range pattern is converted; anything more complex
 * ("Mon-Fri 8-5, Sat 9-1") is left as the original text.
 */
function parseLegacyBusinessHours(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
  const m = TIME_RANGE.exec(text);
  if (!m) return { ok: false, reason: 'no_time_range' };
  const time = parseLegacyTimeRange(m[0]);
  if (!time || time.ambiguous) return { ok: false, reason: time ? time.reason : 'unreadable_time' };

  const daysPart = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    .replace(/\b(from|open|opens|hours|every|at|between)\b/gi, ' ')
    .replace(/[,;:@]+/g, ' ')
    .trim();
  const days = daysPart ? parseLegacyDays(daysPart) : null;
  if (!days) return { ok: false, reason: 'unreadable_days' };

  return {
    ok: true,
    schedule: DAY_IDS.map((day) => (days.includes(day)
      ? { day, open: true, is24h: false, opens: time.start, closes: time.end, endsNextDay: false }
      : { day, open: false })),
  };
}

const UNIT_MAP = {
  h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
  d: 'days', day: 'days', days: 'days',
  w: 'weeks', wk: 'weeks', wks: 'weeks', week: 'weeks', weeks: 'weeks',
  mo: 'months', mos: 'months', month: 'months', months: 'months',
  y: 'years', yr: 'years', yrs: 'years', year: 'years', years: 'years',
};

/**
 * "2 weeks" -> { value:2, unit:'weeks' }. A bare number ("30") has no unit in
 * the text itself; the old "Estimated duration" form's only example was in
 * days ("e.g. 1-2 days"), so a bare number is read as days and flagged
 * (assumedUnit) so the caller can record that assumption. Ranges ("1-2 days")
 * and anything else return null and are preserved as text.
 */
function parseLegacyDuration(text) {
  if (typeof text !== 'string') return null;
  const m = /^\s*(\d{1,3})\s*([a-z]+)?\s*$/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  if (value < 1) return null;
  if (!m[2]) return { value, unit: 'days', assumedUnit: true };
  const unit = UNIT_MAP[m[2].toLowerCase()];
  return unit ? { value, unit, assumedUnit: false } : null;
}

module.exports = { DAY_IDS, parseLegacyDays, parseLegacyTimeRange, parseLegacyWorkingSchedule, parseLegacyBusinessHours, parseLegacyDuration };

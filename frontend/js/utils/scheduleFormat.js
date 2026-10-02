/**
 * JOB RUSH — shared schedule / duration formatting: working days & hours,
 * service duration, and business opening hours.
 * One place that turns the structured schedule fields
 * (working_days_structured, working_hours_start/end/ends_next_day)
 * into the human-readable strings shown on both the profile editor
 * (as a live preview) and the public profile — so the two never drift
 * out of sync with two separate implementations.
 */
const ScheduleFormat = (function () {
  const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_LABEL = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const DAY_LABEL_FULL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
  const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const WEEKEND = ['saturday', 'sunday'];

  function sortDays(days) {
    return DAY_ORDER.filter((d) => days.includes(d));
  }

  function sameSet(a, b) {
    return a.length === b.length && a.every((d) => b.includes(d));
  }

  /** e.g. ['monday'..'friday'] -> "Mon – Fri"; a non-contiguous pick -> "Mon, Wed, Fri"; all 7 -> "Every day". */
  function formatWorkingDays(days) {
    if (!days || days.length === 0) return null;
    const sorted = sortDays(days);
    if (sameSet(sorted, DAY_ORDER)) return 'Every day';
    if (sameSet(sorted, WEEKDAYS)) return 'Weekdays (Mon – Fri)';
    if (sameSet(sorted, WEEKEND)) return 'Weekends (Sat – Sun)';

    // A contiguous run in week order (e.g. Tue–Thu) reads as a range;
    // anything else (Mon, Wed, Fri) is listed out.
    const indices = sorted.map((d) => DAY_ORDER.indexOf(d));
    const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
    if (isContiguous && sorted.length > 1) {
      return `${DAY_LABEL[sorted[0]]} – ${DAY_LABEL[sorted[sorted.length - 1]]}`;
    }
    return sorted.map((d) => DAY_LABEL[d]).join(', ');
  }

  /** "18:00" -> "6:00 PM" */
  function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /** (start, end, endsNextDay) -> "8:00 AM – 6:00 PM" or "10:00 PM – 6:00 AM (next day)" */
  function formatWorkingHours(start, end, endsNextDay) {
    if (!start || !end) return null;
    return `${formatTime(start)} – ${formatTime(end)}${endsNextDay ? ' (next day)' : ''}`;
  }

  /**
   * The single line the public profile and any other read-only view
   * should show — structured values take priority; a legacy free-text
   * value (from before this feature existed) is shown as-is only when
   * no structured value has ever been saved, so an old profile that
   * never resaved doesn't just go blank.
   */
  function scheduleLine(profile) {
    const days = formatWorkingDays(profile.working_days_structured);
    const hours = formatWorkingHours(profile.working_hours_start, profile.working_hours_end, profile.working_hours_ends_next_day);
    if (days || hours) return [days, hours].filter(Boolean).join(' · ');
    return [profile.working_days, profile.working_hours].filter(Boolean).join(' · ') || null;
  }

  // ---------- Service duration ----------
  // A duration is always a value AND a unit ("30 days"), never a bare number.
  const DURATION_UNITS = [
    { id: 'hours', singular: 'hour', plural: 'hours', label: 'Hours' },
    { id: 'days', singular: 'day', plural: 'days', label: 'Days' },
    { id: 'weeks', singular: 'week', plural: 'weeks', label: 'Weeks' },
    { id: 'months', singular: 'month', plural: 'months', label: 'Months' },
    { id: 'years', singular: 'year', plural: 'years', label: 'Years' },
  ];

  /** (30, 'days') -> "30 days"; (1, 'month') -> "1 month"; missing/invalid -> null. */
  function formatDuration(value, unit) {
    const u = DURATION_UNITS.find((x) => x.id === unit);
    const n = Number(value);
    if (!u || !Number.isInteger(n) || n < 1) return null;
    return `${n} ${n === 1 ? u.singular : u.plural}`;
  }

  /**
   * What the public profile/service list shows for a service's duration, as
   * { label, text } or null. The structured value always wins. A leftover
   * free-text value is shown only if it says what it means ("2 weeks"); a
   * bare number with no unit is never displayed.
   */
  function serviceDuration(service) {
    const structured = formatDuration(service.duration_value, service.duration_unit);
    if (structured) return { label: 'Project duration', text: structured };
    const legacy = (service.duration_estimate || '').trim();
    if (legacy && !/^\d+$/.test(legacy)) return { label: 'Estimated duration', text: legacy };
    return null;
  }

  // ---------- Business opening hours ----------
  /** One day's entry -> "10:00 AM – 5:00 PM" / "Open 24 hours" / "Closed". */
  function formatBusinessDay(entry) {
    if (!entry || !entry.open) return 'Closed';
    if (entry.is24h) return 'Open 24 hours';
    if (!entry.opens || !entry.closes) return 'Closed';
    return `${formatTime(entry.opens)} – ${formatTime(entry.closes)}${entry.endsNextDay ? ' (next day)' : ''}`;
  }

  /**
   * The 7-entry schedule grouped into readable runs of identical days:
   * [{ days: 'Mon – Fri', text: '10:00 AM – 5:00 PM' }, { days: 'Sat – Sun', text: 'Closed' }].
   */
  function groupBusinessHours(schedule) {
    if (!Array.isArray(schedule) || schedule.length === 0) return [];
    const ordered = DAY_ORDER.map((d) => schedule.find((e) => e.day === d) || { day: d, open: false });
    const runs = [];
    for (const entry of ordered) {
      const text = formatBusinessDay(entry);
      const last = runs[runs.length - 1];
      if (last && last.text === text) last.days.push(entry.day);
      else runs.push({ days: [entry.day], text });
    }
    return runs.map((r) => ({
      days: r.days.length === 1
        ? DAY_LABEL_FULL[r.days[0]]
        : r.days.length === 2
          ? `${DAY_LABEL[r.days[0]]}, ${DAY_LABEL[r.days[1]]}`
          : `${DAY_LABEL[r.days[0]]} – ${DAY_LABEL[r.days[r.days.length - 1]]}`,
      text: r.text,
    }));
  }

  return { DAY_ORDER, DAY_LABEL, DAY_LABEL_FULL, WEEKDAYS, WEEKEND, formatWorkingDays, formatTime, formatWorkingHours, scheduleLine, DURATION_UNITS, formatDuration, serviceDuration, formatBusinessDay, groupBusinessHours };
})();

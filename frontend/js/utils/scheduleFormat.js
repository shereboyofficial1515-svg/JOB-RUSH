/**
 * JOB RUSH — shared working-days/working-hours formatting.
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

  return { DAY_ORDER, DAY_LABEL, DAY_LABEL_FULL, WEEKDAYS, WEEKEND, formatWorkingDays, formatTime, formatWorkingHours, scheduleLine };
})();

/**
 * One-time (idempotent) conversion of legacy free-text values into the
 * structured columns added by migrations 064/065:
 *
 *   professional_services.duration_estimate -> duration_value + duration_unit
 *   worker_profiles.working_days / working_hours -> working_days_structured, working_hours_start/end
 *   business_profiles.opening_hours -> opening_hours_structured
 *
 * Safety rules:
 *  - DRY RUN by default: prints exactly what it would change. Pass --apply to write.
 *  - Only converts what legacySchedule.js can read with certainty. Anything
 *    ambiguous ("8am-6am", "10am-5am", "1-2 days") is left exactly as it was
 *    and reported, never guessed.
 *  - The legacy text columns are never modified or cleared.
 *  - Only fills structured columns that are still empty, so re-running (or
 *    running after a user has already saved the new UI) never overwrites a
 *    person's own structured choice.
 *
 *   node src/database/backfillStructuredSchedules.js            # report only
 *   node src/database/backfillStructuredSchedules.js --apply    # write
 */
const { pool } = require('../config/db');
const {
  parseLegacyDuration,
  parseLegacyWorkingSchedule,
  parseLegacyBusinessHours,
} = require('../utils/legacySchedule');

const APPLY = process.argv.includes('--apply');
const report = { applied: [], preserved: [] };

async function durations(client) {
  const { rows } = await client.query(
    `SELECT id, name, duration_estimate FROM professional_services
      WHERE duration_value IS NULL AND duration_estimate IS NOT NULL AND btrim(duration_estimate) <> ''`
  );
  for (const row of rows) {
    const parsed = parseLegacyDuration(row.duration_estimate);
    if (!parsed) {
      report.preserved.push(`service "${row.name}": duration "${row.duration_estimate}" left as text (not a single value + unit)`);
      continue;
    }
    report.applied.push(
      `service "${row.name}": duration "${row.duration_estimate}" -> ${parsed.value} ${parsed.unit}` +
      (parsed.assumedUnit ? ' (bare number read as DAYS: the old form\'s only example was in days; original text kept)' : '')
    );
    if (APPLY) {
      await client.query('UPDATE professional_services SET duration_value = $2, duration_unit = $3 WHERE id = $1 AND duration_value IS NULL', [row.id, parsed.value, parsed.unit]);
    }
  }
}

async function workingSchedules(client) {
  const { rows } = await client.query(
    `SELECT user_id, working_days, working_hours, working_days_structured, working_hours_start
       FROM worker_profiles
      WHERE (working_days IS NOT NULL AND btrim(working_days) <> '') OR (working_hours IS NOT NULL AND btrim(working_hours) <> '')`
  );
  for (const row of rows) {
    const parsed = parseLegacyWorkingSchedule(row.working_days, row.working_hours);
    const hasStructuredDays = row.working_days_structured && row.working_days_structured.length > 0;
    const hasStructuredHours = row.working_hours_start !== null;
    const who = `worker ${String(row.user_id).slice(0, 8)}`;

    if (parsed.days && !hasStructuredDays) {
      report.applied.push(`${who}: working days "${row.working_days}" -> ${parsed.days.join(', ')}`);
      if (APPLY) await client.query('UPDATE worker_profiles SET working_days_structured = $2 WHERE user_id = $1 AND (working_days_structured IS NULL OR cardinality(working_days_structured) = 0)', [row.user_id, parsed.days]);
    } else if (row.working_days && !parsed.days && !hasStructuredDays) {
      report.preserved.push(`${who}: working days "${row.working_days}" could not be read; left as text`);
    }

    if (parsed.hours && !hasStructuredHours) {
      report.applied.push(`${who}: working hours "${row.working_hours}" -> ${parsed.hours.start}-${parsed.hours.end}`);
      if (APPLY) await client.query('UPDATE worker_profiles SET working_hours_start = $2, working_hours_end = $3, working_hours_ends_next_day = false WHERE user_id = $1 AND working_hours_start IS NULL', [row.user_id, parsed.hours.start, parsed.hours.end]);
    } else if (parsed.hoursNeedReview && !hasStructuredHours) {
      report.preserved.push(`${who}: working hours "${row.working_hours}" are ambiguous (end is not after start, or no am/pm); NOT converted. The owner is asked to confirm them in the editor.`);
    }
  }
}

async function businessHours(client) {
  const { rows } = await client.query(
    `SELECT id, business_name, opening_hours FROM business_profiles
      WHERE opening_hours_structured IS NULL AND opening_hours IS NOT NULL AND btrim(opening_hours) <> ''`
  );
  for (const row of rows) {
    const parsed = parseLegacyBusinessHours(row.opening_hours);
    if (!parsed.ok) {
      report.preserved.push(`business "${row.business_name}": opening hours "${row.opening_hours}" NOT converted (${parsed.reason}); left as text, owner asked to set them in the editor`);
      continue;
    }
    report.applied.push(`business "${row.business_name}": opening hours "${row.opening_hours}" -> structured 7-day schedule`);
    if (APPLY) await client.query('UPDATE business_profiles SET opening_hours_structured = $2::jsonb WHERE id = $1 AND opening_hours_structured IS NULL', [row.id, JSON.stringify(parsed.schedule)]);
  }
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await durations(client);
    await workingSchedules(client);
    await businessHours(client);
    await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
    console.log(`[backfill] ${APPLY ? 'APPLIED' : 'DRY RUN (nothing written; pass --apply to write)'}`);
    console.log(`\nConverted (${report.applied.length}):`);
    report.applied.forEach((l) => console.log('  + ' + l));
    console.log(`\nPreserved as legacy text (${report.preserved.length}):`);
    report.preserved.forEach((l) => console.log('  ! ' + l));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[backfill] FAILED, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

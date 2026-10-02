# Service duration, working schedule and business hours

Price, pricing unit and duration are three separate concepts and are stored in separate fields. A bare number is never displayed on its own.

| Concept | Fields (API camelCase / DB snake_case) | Example |
|---|---|---|
| Price | `price` / `price` + `priceCurrency` / `price_currency` | 24 NGN |
| Pricing unit | `pricingType` / `pricing_type` (`hourly, daily, weekly, monthly, project, fixed, negotiable, contact_for_quote`) | Per project |
| Duration | `durationValue` + `durationUnit` / `duration_value` + `duration_unit` | 30 days |

## Service duration

* `durationValue`: whole number 1-999. `durationUnit`: `hours | days | weeks | months | years`.
* The two travel as a pair. Sending one without the other is rejected (`A duration needs both an amount and a unit`). Send both as `null` to clear a duration (PATCH).
* A DB `CHECK` (`professional_services_duration_chk`) enforces the same rule, so even a bypass of the API cannot store a unit-less number.
* Saving a structured duration (or clearing it) also sets the legacy `duration_estimate` to `NULL`, so a service never holds two durations.
* Endpoints: `POST /profiles/worker/me/services`, `PATCH /profiles/worker/me/services/:id` (validated by `createProfessionalServiceSchema` / `updateProfessionalServiceSchema` in `backend/src/validators/profileValidators.js`).

### How the frontend shows it
`ScheduleFormat.serviceDuration(service)` (`frontend/js/utils/scheduleFormat.js`) is the single formatter. The public card renders a labelled line, **Project duration - 30 days**, visually separate from the price block (**Starting from ₦24 / Per project**). Singular and plural are handled (`1 day`, `2 weeks`). A legacy free-text duration is shown only if it is not a bare number (e.g. "1-2 days" is shown as "Estimated duration"); a bare legacy number is never displayed. The editor uses a `[ amount ][ unit v ]` control, so a unit-less duration cannot be entered.

## Worker working schedule (migration 064)

* `working_days_structured TEXT[]` - subset of `monday..sunday`.
* `working_hours_start`, `working_hours_end` (`TIME`) and `working_hours_ends_next_day BOOLEAN`.
* A closing time earlier than the opening time is rejected unless "ends next day" is set, so `8:00 AM -> 6:00 AM` is never silently reinterpreted.
* The free-text `working_days` / `working_hours` columns are legacy and are kept untouched.

## Business opening hours (migration 065)

`business_profiles.opening_hours_structured` is a JSONB array of exactly 7 entries, Monday to Sunday, in that order:

```json
[
  { "day": "monday",   "open": true,  "is24h": false, "opens": "10:00", "closes": "17:00", "endsNextDay": false },
  { "day": "friday",   "open": true,  "is24h": false, "opens": "22:00", "closes": "05:00", "endsNextDay": true  },
  { "day": "saturday", "open": true,  "is24h": true },
  { "day": "sunday",   "open": false }
]
```

Times are 24-hour `HH:MM`. Validation (`openingHoursStructuredSchema`): 7 days in order; open days need both times or `is24h`; equal times rejected; closing before opening rejected unless `endsNextDay`. The service layer normalises each entry (closed/24h days carry no times) and sets the legacy `opening_hours` to `NULL`. Public display groups identical days via `ScheduleFormat.groupBusinessHours` (`Mon - Fri 10:00 AM - 5:00 PM`, `Sat, Sun Closed`).

## Legacy data

Old values are never destroyed. The additive migration leaves `duration_estimate`, `opening_hours`, `working_days`, `working_hours` in place, and the idempotent script converts only what it can read with certainty:

```bash
cd backend
npm run migrate                                   # applies 064/065
node src/database/backfillStructuredSchedules.js           # dry run: report only
node src/database/backfillStructuredSchedules.js --apply   # write
npm run backfill:schedules                        # same as the dry run/apply entry in package.json
npm test                                          # parser + validator tests (plain node)
```

| Legacy text | Result |
|---|---|
| `30` (service duration) | 30 days. The old form's only example was in days; the choice is flagged `assumedUnit` in the report. Original text is kept. |
| `2 weeks`, `5 hours` ... | converted as written |
| `Mon-Fri` | `monday..friday` |
| `Mon-Fri, 8am-6pm` | days + 08:00-18:00 |
| `8am-6am`, `10am-5am` (end before start, no overnight marker) | **not converted** - ambiguous. The text is kept and the editor asks the owner to confirm the hours. |
| missing am/pm, unreadable ranges | not converted, text preserved |

The structured columns are only filled when empty, so re-running never overwrites something a user saved in the new editor. Until an owner saves structured hours, a profile with only legacy business hours keeps showing the legacy text.

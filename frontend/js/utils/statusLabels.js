/**
 * JOB RUSH — Human labels for database states, rendered as .status-pill.
 *
 * Every key below is a value of a Postgres enum in
 * backend/src/database/migrations (named next to each map). Nothing here
 * decides what a user may do; it only names a state the server returned.
 * An unknown value (a future enum addition) falls back to a neutral pill
 * with the raw value made readable, rather than being hidden.
 *
 *   StatusLabels.pill('contract', c.status)   -> '<span class="status-pill …">Active</span>'
 *   StatusLabels.label('interview', 'no_show') -> 'No-show'
 *   StatusLabels.note('withdrawal', 'pending') -> one-line explanation or ''
 *
 * Tones map to the shared pill modifiers in components.css:
 * on (success), warn (waiting / needs attention), danger (problem), off (closed / neutral).
 */
const StatusLabels = (function () {
  const MAPS = {
    // 017 contract_status
    contract: {
      active: { label: 'Active', tone: 'on' },
      completed: { label: 'Completed', tone: 'on' },
      cancelled: { label: 'Cancelled', tone: 'off' },
      disputed: { label: 'In dispute', tone: 'danger' },
    },
    // 017 milestone_status
    milestone: {
      pending: { label: 'Not funded', tone: 'off' },
      funded: { label: 'Funded', tone: 'warn' },
      submitted: { label: 'Submitted for approval', tone: 'warn' },
      approved: { label: 'Approved', tone: 'on' },
      released: { label: 'Paid', tone: 'on' },
      disputed: { label: 'In dispute', tone: 'danger' },
    },
    // 019 escrow_status
    escrow: {
      pending_funding: { label: 'Awaiting payment', tone: 'warn', note: 'Payment started. It shows as funded once Paystack confirms it.' },
      funded: { label: 'Funded', tone: 'on', note: 'The money is held safely in escrow until it is released.' },
      released: { label: 'Released', tone: 'on', note: 'Paid out to the worker.' },
      refunded: { label: 'Refunded', tone: 'off', note: 'Returned to the hirer.' },
      disputed: { label: 'Frozen (dispute)', tone: 'danger', note: 'Escrow is frozen until the dispute is resolved.' },
    },
    // 018 payment_status
    payment: {
      pending: { label: 'Pending', tone: 'warn' },
      success: { label: 'Successful', tone: 'on' },
      failed: { label: 'Failed', tone: 'danger' },
      abandoned: { label: 'Not completed', tone: 'off' },
    },
    // 021 withdrawal_status
    withdrawal: {
      pending: { label: 'Under review', tone: 'warn', note: 'We’re reviewing this request. The amount is held until it’s approved or returned.' },
      approved: { label: 'Approved', tone: 'warn', note: 'Approved. The transfer to your bank account will start shortly.' },
      processing: { label: 'Being paid out', tone: 'warn', note: 'Approved. The transfer to your bank account is in progress.' },
      paid: { label: 'Paid', tone: 'on', note: 'The money has been sent to your bank account.' },
      rejected: { label: 'Not approved', tone: 'off', note: 'This request wasn’t approved. The amount was returned to your wallet.' },
      failed: { label: 'Transfer failed', tone: 'danger', note: 'The bank transfer didn’t go through. The amount was returned to your wallet.' },
    },
    // 011 application_status
    application: {
      applied: { label: 'Applied', tone: 'warn' },
      invited: { label: 'Invitation', tone: 'warn' },
      accepted: { label: 'Invitation accepted', tone: 'on' },
      declined: { label: 'Declined', tone: 'off' },
      shortlisted: { label: 'Shortlisted', tone: 'on' },
      hired: { label: 'Hired', tone: 'on' },
      rejected: { label: 'Not selected', tone: 'off' },
      withdrawn: { label: 'Withdrawn', tone: 'off' },
    },
    // 013 interview_status
    interview: {
      pending: { label: 'Awaiting response', tone: 'warn' },
      accepted: { label: 'Accepted', tone: 'on' },
      declined: { label: 'Declined', tone: 'off' },
      reschedule_requested: { label: 'New time requested', tone: 'warn' },
      scheduled: { label: 'Scheduled', tone: 'on' },
      in_progress: { label: 'In progress', tone: 'on' },
      completed: { label: 'Completed', tone: 'off' },
      cancelled: { label: 'Cancelled', tone: 'off' },
      no_show: { label: 'No-show', tone: 'danger' },
      passed: { label: 'Passed', tone: 'on' },
      failed: { label: 'Not successful', tone: 'off' },
    },
    // 027 dispute_status
    dispute: {
      open: { label: 'Dispute open', tone: 'danger' },
      under_review: { label: 'Dispute under review', tone: 'warn' },
      awaiting_information: { label: 'More information needed', tone: 'warn' },
      resolved: { label: 'Dispute resolved', tone: 'on' },
      rejected: { label: 'Dispute rejected', tone: 'off' },
      escalated: { label: 'Dispute escalated', tone: 'danger' },
    },
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function info(kind, status) {
    const known = MAPS[kind] && MAPS[kind][status];
    if (known) return known;
    const readable = String(status || 'unknown').replace(/_/g, ' ');
    return { label: readable.charAt(0).toUpperCase() + readable.slice(1), tone: 'off' };
  }

  const label = (kind, status) => info(kind, status).label;
  const note = (kind, status) => info(kind, status).note || '';
  const pill = (kind, status) => {
    const i = info(kind, status);
    return `<span class="status-pill status-pill--${i.tone}">${esc(i.label)}</span>`;
  };

  return { pill, label, note, info };
})();

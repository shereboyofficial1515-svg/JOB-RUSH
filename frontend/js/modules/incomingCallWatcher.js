/**
 * JOB RUSH — Incoming call watcher.
 * There is no push/WebSocket transport in this app (calls, like
 * messages, are polled) — so this is the mechanism by which a callee
 * ever learns a call is happening at all: poll GET
 * /messaging/calls/incoming every few seconds, and when one shows up,
 * ring and show a real accept/decline UI, tied to the call's actual
 * status in the `calls` table rather than page lifecycle.
 *
 * Mounted the same way NotificationBell is (see each page's
 * IncomingCallWatcher.start() call) — the same "logged-in app shell"
 * set of pages, so a call can be noticed from wherever the user
 * currently is, not only from inside the conversation it belongs to.
 */
const IncomingCallWatcher = (function () {
  const POLL_INTERVAL_MS = 3000;
  const RING_TIMEOUT_MS = 30000;

  let pollTimer = null;
  let ringTimeoutTimer = null;
  let currentCallId = null;
  let handled = false;

  function ringtoneAllowed() {
    const prefs = typeof Accessibility !== 'undefined' ? Accessibility.getPrefs() : {};
    return prefs.callRingtoneEnabled !== false; // undefined (not yet synced) or true => allowed
  }

  function postStatus(callId, status) {
    return API.post(`/messaging/calls/${callId}/status`, { status }).catch(() => {
      // Best-effort -- the UI-side outcome (stopping the ring, closing
      // the banner) must not depend on this write succeeding.
    });
  }

  function clearRingTimeout() {
    if (ringTimeoutTimer) clearTimeout(ringTimeoutTimer);
    ringTimeoutTimer = null;
  }

  /** Local cleanup only -- no status write. Used when the call already resolved some other way (answered elsewhere, expired, cancelled) and this device just needs to stop ringing. */
  function dismissSilently() {
    clearRingTimeout();
    RingtoneManager.stop('incoming');
    currentCallId = null;
    handled = true;
    Modal.close();
  }

  function accept(call) {
    handled = true;
    clearRingTimeout();
    RingtoneManager.stop('incoming');
    currentCallId = null;
    Modal.close();
    window.location.href = `call-room.html?type=call&id=${call.id}`;
  }

  function decline(callId) {
    handled = true;
    clearRingTimeout();
    RingtoneManager.stop('incoming');
    currentCallId = null;
    postStatus(callId, 'declined');
    Modal.close();
  }

  function timeout(callId) {
    handled = true;
    RingtoneManager.stop('incoming');
    currentCallId = null;
    postStatus(callId, 'missed');
    Modal.close();
  }

  async function showIncomingCall(call) {
    currentCallId = call.id;
    handled = false;

    // Real status transition (calling -> ringing), not cosmetic --
    // marks that this call is genuinely alerting on a device now.
    postStatus(call.id, 'ringing');

    const started = ringtoneAllowed() ? await RingtoneManager.play('incoming') : false;

    const avatar = (call.caller && call.caller.profilePictureUrl) || (typeof ASSETS !== 'undefined' ? ASSETS.defaultAvatar : '');
    const name = esc((call.caller && call.caller.fullName) || 'Someone');
    const callTypeLabel = call.callType === 'audio' ? 'Audio call' : 'Video call';

    Modal.open({
      title: 'Incoming call',
      bodyHtml: `
        <div style="text-align:center; padding: var(--space-2) 0 var(--space-4);">
          <img src="${esc(avatar)}" alt="" width="72" height="72" style="border-radius:50%; object-fit:cover; margin: 0 auto var(--space-4); display:block;" />
          <h3 style="margin-bottom: var(--space-1);">${name}</h3>
          <p class="text-secondary" style="margin-bottom: 0;">${callTypeLabel}</p>
          ${!started ? '<p class="text-xs text-secondary" id="incoming-call-sound-hint" style="margin-top: var(--space-3);">Tap anywhere to enable ringtone sound.</p>' : ''}
        </div>
        <div class="modal-actions" style="justify-content:center;">
          <button type="button" class="btn btn-danger" id="incoming-call-decline">Decline</button>
          <button type="button" class="btn btn-primary" id="incoming-call-accept">Answer</button>
        </div>
      `,
      onMount: (modalEl) => {
        if (!started) {
          modalEl.addEventListener(
            'click',
            () => {
              RingtoneManager.play('incoming');
              const hint = document.getElementById('incoming-call-sound-hint');
              if (hint) hint.hidden = true;
            },
            { once: true }
          );
        }
        modalEl.querySelector('#incoming-call-accept').addEventListener('click', () => accept(call));
        modalEl.querySelector('#incoming-call-decline').addEventListener('click', () => decline(call.id));
      },
      // Backdrop click / Escape also count as declining -- an incoming
      // call that gets dismissed without an explicit answer shouldn't
      // keep ringing indefinitely just because the modal itself closed.
      onClose: () => {
        if (!handled) decline(call.id);
      },
    });

    ringTimeoutTimer = setTimeout(() => timeout(call.id), RING_TIMEOUT_MS);
  }

  async function poll() {
    if (typeof API === 'undefined') return;
    try {
      const { call } = await API.get('/messaging/calls/incoming');
      if (call && call.id !== currentCallId) {
        showIncomingCall(call);
      } else if (!call && currentCallId) {
        dismissSilently();
      }
    } catch {
      // Not logged in, or offline -- try again next tick.
    }
  }

  function start() {
    poll();
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  return { start };
})();

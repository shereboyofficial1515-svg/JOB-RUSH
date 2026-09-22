/**
 * JOB RUSH — Ringtone manager.
 * Owns exactly two <audio> elements (incoming ring, outgoing ringback)
 * for the lifetime of the page — created lazily on first use, reused
 * on every subsequent play/stop, never one-per-call. Both assets are
 * short, synthesized tones (see frontend/assets/audio/) rather than
 * any third-party recording.
 *
 * Autoplay: browsers block audio.play() that isn't triggered by a user
 * gesture, and an incoming call is inherently NOT one — the call just
 * arrives. play() below handles the rejected promise gracefully (never
 * throws, never crashes the page) and reports back whether it actually
 * started, so callers (incomingCallWatcher.js) can show a "tap to
 * enable sound" affordance instead of silently failing forever.
 */
const RingtoneManager = (function () {
  // 'incoming' has a selectable tone (see TONES below); 'outgoing' has
  // just the one ringback, same as before.
  const SOURCES = {
    outgoing: '../assets/audio/outgoing-ringback.mp3',
  };

  // Every option is a short, synthesized tone (see
  // frontend/assets/audio/ — incoming-ringtone.mp3 predates this list
  // and is kept as 'classic' rather than duplicated) — never a
  // third-party recording.
  const TONES = {
    classic: '../assets/audio/incoming-ringtone.mp3',
    chime: '../assets/audio/ringtones/chime.mp3',
    pulse: '../assets/audio/ringtones/pulse.mp3',
  };

  const elements = {};
  let activeType = null;
  let currentToneId = 'classic';

  function getElement(type) {
    if (type === 'incoming') {
      const src = TONES[currentToneId] || TONES.classic;
      if (!elements.incoming || elements.incoming.dataset.toneId !== currentToneId) {
        if (elements.incoming) elements.incoming.pause();
        const el = new Audio(src);
        el.loop = true;
        el.preload = 'none';
        el.dataset.toneId = currentToneId;
        elements.incoming = el;
      }
      return elements.incoming;
    }
    if (!elements[type]) {
      const el = new Audio(SOURCES[type]);
      el.loop = true;
      el.preload = 'none'; // don't fetch the audio file until a call actually needs it
      elements[type] = el;
    }
    return elements[type];
  }

  /** Called whenever the user's selected ringtone changes (settings load/save) — the next play('incoming') picks it up. */
  function setTone(toneId) {
    if (TONES[toneId]) currentToneId = toneId;
  }

  /**
   * A short, one-shot playback for the Settings page's "Preview"
   * button — never loops, never touches the real incoming/outgoing
   * elements or activeType, so previewing a tone can't interfere with
   * (or get interrupted by) an actual call's ringtone.
   */
  function preview(toneId) {
    const src = TONES[toneId];
    if (!src) return;
    const el = new Audio(src);
    el.play().catch(() => {});
  }

  /**
   * Plays the given ringtone ('incoming' | 'outgoing'), stopping
   * whichever one (if any) was already playing first — only one can
   * ever be meaningfully active for a single browser tab/call at a
   * time. Returns true if playback actually started, false if the
   * browser blocked it (autoplay restriction, no gesture yet).
   */
  async function play(type) {
    stop(activeType);
    activeType = type;
    const el = getElement(type);
    el.currentTime = 0;
    try {
      await el.play();
      return true;
    } catch {
      // Blocked by autoplay policy, or the asset failed to load --
      // either way, never let this bubble up and break the call UI.
      return false;
    }
  }

  function stop(type) {
    if (!type || !elements[type]) return;
    elements[type].pause();
    elements[type].currentTime = 0;
    if (activeType === type) activeType = null;
  }

  function stopAll() {
    stop('incoming');
    stop('outgoing');
  }

  return { play, stop, stopAll, setTone, preview };
})();

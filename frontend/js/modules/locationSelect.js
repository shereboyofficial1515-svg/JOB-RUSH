/**
 * JOB RUSH — Shared Nigerian State -> LGA -> Area cascading selector.
 * Single source of truth for every page that needs location dropdowns
 * (profile editing, job posting, search/filters, admin management) so
 * the fetch + cascade logic isn't duplicated per page. Requires API
 * (api.js) and esc() (utils/sanitize.js) to already be loaded.
 */
const LocationSelect = (function () {
  // Generic on purpose — this reflects whatever the admin currently
  // has enabled (states.is_active), not a specific state. Job Rush
  // operates nationwide today, but this message needs to make sense
  // again if the admin ever narrows availability in the future.
  const STATE_UNAVAILABLE_MESSAGE = "This location isn't available on Job Rush yet.";

  let statesPromise = null;
  function fetchStates() {
    if (!statesPromise) statesPromise = API.get('/locations/states').then((r) => r.states);
    return statesPromise;
  }
  async function fetchLgas(stateId) {
    const { lgas } = await API.get(`/locations/states/${stateId}/lgas`);
    return lgas;
  }
  async function fetchAreas(lgaId) {
    const { areas } = await API.get(`/locations/lgas/${lgaId}/areas`);
    return areas;
  }

  /**
   * Wires a State <select> (required) plus optional LGA/Area <select>s
   * into a cascading, database-backed selector.
   *
   * - stateSelect (required), lgaSelect / areaSelect (optional — omit
   *   whichever a given page doesn't need, e.g. a filter bar with only
   *   State + LGA).
   * - messageEl: element to show the state-unavailable message in. Optional.
   * - initial: { stateId, lgaId, areaId } to preselect (editing an
   *   existing profile/job).
   * - restrictToActive: when true (the default — profile/job-posting
   *   forms), picking a state Admin hasn't turned on shows the
   *   unavailable message and leaves LGA/Area disabled instead of
   *   querying for data that can't exist. Set false for search/filter
   *   contexts, where filtering by any state is harmless.
   */
  async function init({ stateSelect, lgaSelect, areaSelect, messageEl, initial = {}, restrictToActive = true, statePlaceholder = 'Select a state' }) {
    function showMessage(text) {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.hidden = !text;
    }

    function resetLga(placeholder) {
      if (!lgaSelect) return;
      lgaSelect.disabled = true;
      lgaSelect.innerHTML = `<option value="">${placeholder}</option>`;
    }
    function resetArea(placeholder) {
      if (!areaSelect) return;
      areaSelect.disabled = true;
      areaSelect.innerHTML = `<option value="">${placeholder}</option>`;
    }

    async function loadLgas(stateId, preselectLgaId) {
      resetArea('Select an LGA first');
      if (!lgaSelect) return;
      if (!stateId) return resetLga('Select a state first');
      lgaSelect.disabled = false;
      lgaSelect.innerHTML = '<option value="">Loading…</option>';
      const lgas = await fetchLgas(stateId);
      lgaSelect.innerHTML =
        '<option value="">Select an LGA</option>' +
        lgas.map((l) => `<option value="${l.id}" ${l.id === preselectLgaId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    }

    async function loadAreas(lgaId, preselectAreaId) {
      if (!areaSelect) return;
      if (!lgaId) return resetArea('Select an LGA first');
      areaSelect.disabled = false;
      areaSelect.innerHTML = '<option value="">Loading…</option>';
      const areas = await fetchAreas(lgaId);
      areaSelect.innerHTML =
        '<option value="">Select an area (optional)</option>' +
        areas.map((a) => `<option value="${a.id}" ${a.id === preselectAreaId ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    }

    async function handleStateChange(stateId, preselect = {}) {
      const opt = stateId ? stateSelect.querySelector(`option[value="${stateId}"]`) : null;
      const isActive = opt ? opt.dataset.active === 'true' : false;

      if (stateId && restrictToActive && !isActive) {
        showMessage(STATE_UNAVAILABLE_MESSAGE);
        resetLga('Select a state first');
        resetArea('Select an LGA first');
        return;
      }
      showMessage(null);
      await loadLgas(stateId, preselect.lgaId);
      if (preselect.lgaId) await loadAreas(preselect.lgaId, preselect.areaId);
    }

    resetLga('Select a state first');
    resetArea('Select an LGA first');

    let states;
    try {
      states = await fetchStates();
    } catch {
      stateSelect.innerHTML = '<option value="">Could not load states</option>';
      return;
    }

    stateSelect.innerHTML =
      `<option value="">${statePlaceholder}</option>` +
      states
        .map((s) => `<option value="${s.id}" data-active="${s.is_active}" ${s.id === initial.stateId ? 'selected' : ''}>${esc(s.name)}</option>`)
        .join('');

    if (initial.stateId) await handleStateChange(initial.stateId, initial);

    stateSelect.addEventListener('change', () => handleStateChange(stateSelect.value));
    if (lgaSelect) lgaSelect.addEventListener('change', () => loadAreas(lgaSelect.value));
  }

  return { init, fetchStates, fetchLgas, fetchAreas, STATE_UNAVAILABLE_MESSAGE };
})();

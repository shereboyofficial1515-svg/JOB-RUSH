/**
 * JOB RUSH — Messaging UI.
 *
 * Phones: the conversation list lives in the app shell; opening a
 * conversation switches to a FULL-SCREEN chat (top bar, messages, composer)
 * with its own history entry, so Android Back returns to the list. Desktop:
 * list and chat side by side.
 *
 * Everything here talks to the real messaging API (see
 * backend/src/routes/messagingRoutes.js). Nothing is mocked: the list,
 * messages, pins, replies, edits, deletes, attachments, voice notes, read
 * receipts, presence and mute/block state all come from and go to the server.
 * Realtime comes from the SSE stream (js/modules/realtime.js); polling stays
 * only as a safety net.
 */
const Chat = (function () {
  'use strict';

  const EDIT_WINDOW_MS = 20 * 60 * 1000; // mirrors the server's rule; the server stays authoritative
  const PAGE_SIZE = 40;
  const MAX_RECORDING_SECONDS = 300;
  const LONG_PRESS_MS = 450;
  const LONG_PRESS_MOVE_PX = 10;
  const MAX_FILE_BYTES = { image: 25 * 1024 * 1024, document: 15 * 1024 * 1024 };
  const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.zip,application/pdf,application/msword,application/vnd.ms-excel,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // ---------------------------------------------------------------- icons
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    back: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
    phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    video: svg('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
    more: svg('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    send: svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    mic: svg('<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/>'),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    check2: svg('<polyline points="2 13 7 18 16 7"/><polyline points="11 16 13 18 22 7"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>'),
    reply: svg('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
    forward: svg('<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    pin: svg('<path d="M12 17v5"/><path d="M5 17h14l-1.8-3.2V6H18V3H6v3h.8v7.8Z"/>'),
    flag: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    ban: svg('<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
    bellOff: svg('<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.9 17.9 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    archive: svg('<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
    camera: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    play: svg('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'),
    chevronDown: svg('<polyline points="6 9 12 15 18 9"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    shield: svg('<path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
    list: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>'),
  };

  // ---------------------------------------------------------------- state
  const S = {
    user: null,
    convs: new Map(),
    filter: '',
    activeId: null,
    detail: null,
    msgs: [],            // ascending; may include pending (client-only) messages
    hasOlder: false,
    hasNewer: false,
    loadingOlder: false,
    loadingNewer: false,
    pins: [],
    pinCursor: 0,
    reply: null,
    edit: null,
    staged: [],          // attachments chosen but not sent yet
    recorder: null,
    unseenBelow: 0,
    layers: [],
    ignorePops: 0,
    audio: null,         // { el, key }
    urlCache: new Map(), // "<msgId>:<mediaId>:<variant>" -> { url, exp }
    urlInflight: new Map(),
    searchSeq: 0,
    blobUrls: [],       // local previews kept for just-sent media; released when the chat closes
  };
  let els = {};
  let drafts = new Map(); // conversationId -> typed text
  let pollTimers = [];
  let imageObserver = null;
  const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;
  const inNativeApp = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const me = () => S.user.id;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function dayKey(iso) { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  function fmtDay(iso) {
    const d = new Date(iso);
    const today = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  function fmtListTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 86400 && dayKey(iso) === dayKey(new Date().toISOString())) return fmtTime(iso);
    if (diff < 604800) return new Date(iso).toLocaleDateString([], { weekday: 'short' });
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function fmtBytes(n) {
    if (!n) return '';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 || v >= 10 ? 0 : 1)} ${u[i]}`;
  }
  function fmtDuration(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  /** Escapes first, then turns plain URLs into safe links (never injects user HTML). */
  function linkify(text) {
    return esc(text).replace(/\bhttps?:\/\/[^\s<]+/gi, (url) => {
      const trail = url.match(/[).,!?;:]+$/);
      const clean = trail ? url.slice(0, -trail[0].length) : url;
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trail ? trail[0] : ''}`;
    });
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ } }
  function typeLabel(t) { return ({ image: 'Photo', voice_note: 'Voice message', document: 'File', video: 'Video' })[t] || ''; }
  function previewOf(m) {
    if (m.deleted_at) return 'This message was deleted';
    return m.content || typeLabel(m.message_type) || '';
  }
  function toast(kind, msg) { if (typeof Toast !== 'undefined') (Toast[kind] || Toast.show)(msg); }

  // ---------------------------------------------------------------- history layers (Android Back)
  // Every overlay (the chat screen on phones, a sheet, the photo viewer) is one
  // entry on this stack AND one browser-history entry, so the hardware Back
  // button / gesture closes the top layer instead of leaving the page.
  function pushLayer(close) {
    const layer = { close };
    S.layers.push(layer);
    window.history.pushState({ jrChatLayer: S.layers.length }, '');
    return layer;
  }
  function popLayer(layer) {
    const i = S.layers.indexOf(layer);
    if (i === -1) return;
    S.layers.splice(i, 1);
    S.ignorePops += 1;
    window.history.back();
  }
  window.addEventListener('popstate', () => {
    if (S.ignorePops > 0) { S.ignorePops -= 1; return; }
    const layer = S.layers.pop();
    if (layer) layer.close();
  });

  // ---------------------------------------------------------------- API
  const api = {
    conversations: () => API.get('/messaging/conversations'),
    detail: (id) => API.get(`/messaging/conversations/${id}`),
    messages: (id, qs = '') => API.get(`/messaging/conversations/${id}/messages${qs}`),
    pins: (id) => API.get(`/messaging/conversations/${id}/pins`),
    send: (id, body) => API.post(`/messaging/conversations/${id}/messages`, body),
    read: (id) => API.post(`/messaging/conversations/${id}/read`),
  };

  // ================================================================ CONVERSATION LIST
  function conversationRowHtml(c) {
    const name = esc(c.other_full_name) || 'Unknown user';
    const own = c.last_message_sender_id === me();
    const preview = c.last_message_preview ? `${own ? 'You: ' : ''}${esc(c.last_message_preview)}` : 'No messages yet';
    const unread = c.unread_count > 0;
    return `
      <a class="conversation-item ${c.id === S.activeId ? 'is-active' : ''} ${unread ? 'has-unread' : ''}" role="button" tabindex="0" data-conversation-id="${c.id}" aria-label="Conversation with ${name}${unread ? `, ${c.unread_count} unread` : ''}">
        <span class="conversation-avatar"><img src="${esc(c.other_profile_picture_url || ASSETS.defaultAvatar)}" alt="" loading="lazy" /></span>
        <span class="conversation-body">
          <span class="conversation-row"><span class="conversation-name">${name}</span><span class="conversation-time">${fmtListTime(c.last_message_created_at || c.last_message_at)}</span></span>
          <span class="conversation-row"><span class="preview">${preview}</span>
            <span class="conversation-meta">${c.is_muted ? I.bellOff : ''}${unread ? `<span class="unread-badge">${c.unread_count > 99 ? '99+' : c.unread_count}</span>` : ''}</span></span>
        </span>
      </a>`;
  }

  function renderList() {
    const list = els.list;
    const term = S.filter.trim().toLowerCase();
    const items = [...S.convs.values()]
      .filter((c) => !term || (c.other_full_name || '').toLowerCase().includes(term) || (c.last_message_preview || '').toLowerCase().includes(term))
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
    if (items.length === 0) {
      list.innerHTML = S.convs.size === 0
        ? `<div class="chat-list-empty"><p>No conversations yet. Message a hirer or worker from their profile or a job application to start one.</p></div>`
        : `<div class="chat-list-empty"><p>No conversations match "${esc(S.filter)}".</p></div>`;
      return;
    }
    list.innerHTML = items.map(conversationRowHtml).join('');
  }

  async function loadConversations(background) {
    try {
      const { conversations } = await api.conversations();
      S.convs = new Map(conversations.map((c) => [c.id, c]));
      if (typeof SidebarNav !== 'undefined') SidebarNav.setUnread('messages', conversations.reduce((n, c) => n + (c.unread_count || 0), 0));
      renderList();
    } catch (err) {
      if (typeof PullToRefresh !== 'undefined' && PullToRefresh.isRefreshing()) throw err;
      if (!background) StateView.error(els.list, err, { title: 'Unable to load your conversations', compact: true, retry: () => loadConversations() });
    }
  }

  function bumpConversation(conversationId, message, { fromMe, active }) {
    const c = S.convs.get(conversationId);
    if (!c) { loadConversations(true); return; } // a brand-new conversation: ask the server
    c.last_message_at = message.created_at;
    c.last_message_created_at = message.created_at;
    c.last_message_preview = previewOf(message);
    c.last_message_sender_id = message.sender_id;
    c.last_message_type = message.message_type;
    if (!fromMe && !active) c.unread_count = (c.unread_count || 0) + 1;
    renderList();
  }

  // ================================================================ OPEN / CLOSE A CONVERSATION
  function buildThreadShell() {
    const panel = els.panel;
    panel.innerHTML = `
      <header class="thread-header">
        <button type="button" class="icon-btn back-to-list-btn" id="chat-back" aria-label="Back to conversations">${I.back}</button>
        <button type="button" class="thread-peer" id="chat-peer" aria-label="Open profile"></button>
        <button type="button" class="icon-btn" id="chat-audio-call" aria-label="Audio call">${I.phone}</button>
        <button type="button" class="icon-btn" id="chat-video-call" aria-label="Video call">${I.video}</button>
        <button type="button" class="icon-btn" id="chat-more" aria-label="Chat options" aria-haspopup="menu">${I.more}</button>
      </header>
      <div class="thread-search" id="chat-search" hidden>
        <button type="button" class="icon-btn" id="chat-search-close" aria-label="Close search">${I.back}</button>
        <input type="search" id="chat-search-input" placeholder="Search this chat" autocomplete="off" aria-label="Search this chat" />
      </div>
      <div class="search-results" id="chat-search-results" hidden></div>
      <div class="pinned-bar" id="chat-pinned" hidden></div>
      <div class="thread-messages" id="thread-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <button type="button" class="jump-latest" id="chat-jump" hidden aria-label="Jump to latest messages">${I.chevronDown}<span id="chat-jump-label">Latest</span></button>
      <div class="composer-stack" id="composer-stack">
        <div class="composer-context" id="composer-context" hidden></div>
        <div class="attachment-strip" id="attachment-strip" hidden></div>
        <form class="thread-composer" id="composer-form" autocomplete="off"></form>
      </div>
      <div class="chat-scrim" id="chat-scrim" hidden></div>
      <input type="file" id="file-camera" accept="image/*" capture="environment" hidden />
      <input type="file" id="file-photos" accept="image/*" multiple hidden />
      <input type="file" id="file-docs" accept="${DOC_ACCEPT}" multiple hidden />`;
    els.back = $('#chat-back'); els.peer = $('#chat-peer'); els.messages = $('#thread-messages'); els.pinned = $('#chat-pinned');
    els.search = $('#chat-search'); els.searchInput = $('#chat-search-input'); els.searchResults = $('#chat-search-results');
    els.jump = $('#chat-jump'); els.composerStack = $('#composer-stack'); els.composerContext = $('#composer-context');
    els.strip = $('#attachment-strip'); els.form = $('#composer-form'); els.scrim = $('#chat-scrim');
    wireThreadShell();
  }

  function setPeerHeader() {
    const d = S.detail; if (!d) return;
    const o = d.other;
    const badges = `${o.is_verified ? `<span class="peer-badge" title="Verified">${I.shield}</span>` : ''}${o.is_pro ? '<span class="peer-badge peer-badge--pro">PRO</span>' : ''}`;
    const status = d.blocked_by_me || d.blocked_me ? '' : (o.online ? 'Online' : 'Offline');
    els.peer.innerHTML = `
      <span class="conversation-avatar"><img src="${esc(o.profile_picture_url || ASSETS.defaultAvatar)}" alt="" />${o.online && !d.blocked_by_me && !d.blocked_me ? '<span class="presence-dot"></span>' : ''}</span>
      <span class="thread-peer-text">
        <span class="thread-peer-name"><span>${esc(o.full_name)}</span>${badges}</span>
        <span class="thread-peer-status ${o.online ? 'is-online' : ''}" id="chat-status">${status}${d.muted_until ? `${status ? ' · ' : ''}Muted` : ''}</span>
      </span>`;
    const canView = o.role !== 'hirer';
    els.peer.disabled = !canView;
    els.peer.setAttribute('aria-label', canView ? `Open ${o.full_name}'s profile` : o.full_name);
    $('#chat-audio-call').disabled = !!(d.blocked_by_me || d.blocked_me);
    $('#chat-video-call').disabled = !!(d.blocked_by_me || d.blocked_me);
    renderComposer();
  }

  async function openConversation(id, { focusMessageId = null, fromPop = false } = {}) {
    if (S.activeId === id && els.messages) { if (focusMessageId) jumpTo(focusMessageId); return; }
    if (S.activeId) teardownActive();
    S.activeId = id;
    S.msgs = []; S.pins = []; S.reply = null; S.edit = null; S.staged = []; S.unseenBelow = 0; S.hasOlder = false; S.hasNewer = false;
    document.querySelectorAll('.conversation-item').forEach((i) => i.classList.toggle('is-active', i.dataset.conversationId === id));

    buildThreadShell();
    els.messages.innerHTML = `<div class="chat-empty-hint">Loading messages…</div>`;

    if (!isDesktop()) {
      els.panel.classList.add('is-open-on-mobile');
      els.list.closest('.conversation-list').classList.add('is-hidden-on-mobile');
      document.body.classList.add('chat-open');
      S.chatLayer = pushLayer(() => closeConversation({ viaBack: true }));
    }
    syncViewport();
    try { history.replaceState(history.state, '', `${location.pathname}?conversation=${encodeURIComponent(id)}`); } catch { /* ignore */ }

    const conv = S.convs.get(id);
    if (conv) { S.detail = { id, other: { user_id: conv.other_user_id, full_name: conv.other_full_name, role: conv.other_role, profile_picture_url: conv.other_profile_picture_url, is_verified: !!conv.other_is_verified, is_pro: !!conv.other_is_pro, online: false }, other_last_read_at: conv.other_last_read_at, muted_until: conv.is_muted ? conv.muted_until : null, blocked_by_me: false, blocked_me: false }; setPeerHeader(); }

    try {
      const [detailRes, messagesRes, pinsRes] = await Promise.all([
        api.detail(id),
        focusMessageId ? api.messages(id, `?aroundMessageId=${encodeURIComponent(focusMessageId)}&limit=${PAGE_SIZE}`) : api.messages(id, `?limit=${PAGE_SIZE}`),
        api.pins(id).catch(() => ({ messages: [] })),
      ]);
      if (S.activeId !== id) return; // user already moved on
      S.detail = detailRes.conversation;
      S.msgs = messagesRes.messages;
      S.hasOlder = messagesRes.messages.length >= (focusMessageId ? Math.floor(PAGE_SIZE / 2) : PAGE_SIZE);
      S.hasNewer = !!focusMessageId;
      S.pins = pinsRes.messages;
      setPeerHeader();
      renderPinned();
      renderMessages({ scroll: focusMessageId ? 'none' : 'bottom' });
      if (focusMessageId) jumpTo(focusMessageId);
      const draft = drafts.get(id);
      if (draft && els.input) { els.input.value = draft; autoGrow(); renderComposerButtons(); }
      markReadIfVisible();
    } catch (err) {
      if (S.activeId !== id) return;
      els.messages.innerHTML = `<div class="chat-empty-hint">${esc(err.message)}<br><button type="button" class="btn btn-secondary btn-sm" id="chat-retry-open" style="margin-top:var(--space-3)">Try again</button></div>`;
      $('#chat-retry-open').addEventListener('click', () => { const keep = S.activeId; teardownActive(); S.activeId = null; openConversation(keep); });
    }
  }

  function teardownActive() {
    if (els.input) drafts.set(S.activeId, els.input.value);
    stopAudio();
    cancelRecording(true);
    S.staged.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    S.blobUrls.forEach((u) => URL.revokeObjectURL(u)); S.blobUrls = [];
    if (imageObserver) { imageObserver.disconnect(); imageObserver = null; }
    if (S.resizeObserver) { S.resizeObserver.disconnect(); S.resizeObserver = null; }
    closeSheet({ silent: true });
    closeLightbox({ silent: true });
  }

  function closeConversation({ viaBack = false } = {}) {
    if (!S.activeId) return;
    teardownActive();
    S.activeId = null; S.detail = null; S.msgs = [];
    els.panel.classList.remove('is-open-on-mobile');
    els.list.closest('.conversation-list').classList.remove('is-hidden-on-mobile');
    document.body.classList.remove('chat-open');
    els.panel.innerHTML = placeholderHtml();
    document.querySelectorAll('.conversation-item.is-active').forEach((i) => i.classList.remove('is-active'));
    if (!viaBack && S.chatLayer) { popLayer(S.chatLayer); }
    S.chatLayer = null;
    try { history.replaceState(history.state, '', location.pathname); } catch { /* ignore */ }
    loadConversations(true);
  }

  function placeholderHtml() {
    return `<div class="thread-placeholder"><img src="../assets/images/empty-state.svg" alt="" /><h3>Select a conversation</h3><p>Choose someone from the list to see your messages.</p></div>`;
  }

  // ================================================================ MESSAGES RENDER
  function isReadByOther(m) {
    return !!(S.detail && S.detail.other_last_read_at && new Date(S.detail.other_last_read_at) >= new Date(m.created_at));
  }

  function ticksHtml(m) {
    if (m.sender_id !== me()) return '';
    if (m._status === 'sending') return `<span class="tick" title="Sending">${I.clock}</span>`;
    if (m._status === 'failed') return '';
    const read = isReadByOther(m);
    return `<span class="tick ${read ? 'is-read' : ''}" title="${read ? 'Read' : 'Sent'}">${read ? I.check2 : I.check}</span>`;
  }

  function mediaHtml(m) {
    return (m.media || []).map((media) => {
      if (media.media_type === 'image') {
        const ratio = media.width && media.height ? `style="aspect-ratio:${media.width}/${media.height}"` : '';
        const local = media._localUrl ? `src="${media._localUrl}"` : '';
        return `<button type="button" class="media-image ${local ? '' : 'is-loading'}" ${ratio} data-open-image="${media.id}" aria-label="Open photo">
          <img ${local} alt="Photo" data-lazy-media="${m.id}:${media.id}" ${media.width ? `width="${media.width}" height="${media.height}"` : ''} />
          ${m._status === 'sending' ? `<span class="media-progress"><progress max="100" value="${m._progress || 0}"></progress>${m._progress ? `${m._progress}%` : 'Sending…'}</span>` : ''}
        </button>`;
      }
      if (media.media_type === 'voice_note') {
        const wave = (media.waveform && media.waveform.length ? media.waveform : new Array(32).fill(30)).map((v) => `<i style="--h:${Math.max(8, Math.min(100, v))}%"></i>`).join('');
        return `<div class="voice-note" data-voice="${media.id}">
          <button type="button" class="voice-play" aria-label="Play voice message" data-voice-toggle="${media.id}">${I.play}</button>
          <div class="voice-wave" data-voice-seek="${media.id}" role="slider" aria-label="Voice message position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">${wave}</div>
          <span class="voice-time" data-voice-time="${media.id}">${fmtDuration(media.duration_seconds)}</span>
        </div>${m._status === 'sending' ? `<div class="message-meta"><progress max="100" value="${m._progress || 0}" style="width:100%;height:4px"></progress></div>` : ''}`;
      }
      // document / video / anything else: a file card
      const name = esc(media.file_name || 'Attachment');
      return `<div class="file-card">
        <span class="file-card-icon">${I.file}</span>
        <span class="file-card-text"><span class="file-card-name" title="${name}">${name}</span><span class="file-card-size">${fmtBytes(media.file_size)}${m._status === 'sending' && m._progress ? ` · ${m._progress}%` : ''}</span></span>
        ${m._status === 'sending' || m.id.startsWith('tmp-') ? '' : `<button type="button" class="icon-btn" data-download="${media.id}" aria-label="Download ${name}">${I.download}</button>`}
      </div>`;
    }).join('');
  }

  function bubbleHtml(m, isNew) {
    const isOwn = m.sender_id === me();
    const deleted = !!m.deleted_at;
    const failed = m._status === 'failed';
    const quote = m.reply_to ? `<button type="button" class="reply-quote" data-goto="${m.reply_to.id}" aria-label="Go to the original message"><strong>${m.reply_to.sender_id === me() ? 'You' : esc(m.reply_to.sender_name || 'Message')}</strong><span>${m.reply_to.deleted ? 'This message was deleted' : esc(m.reply_to.content || typeLabel(m.reply_to.message_type) || 'Message')}</span></button>` : '';
    const body = deleted
      ? `<div class="message-text">This message was deleted</div>`
      : `${quote}${mediaHtml(m)}${m.content ? `<div class="message-text">${linkify(m.content)}</div>` : ''}`;
    const meta = failed
      ? `<span style="color:var(--status-danger)">Not sent</span> · <button type="button" class="retry-send-btn" data-retry="${m.id}">Retry</button> · <button type="button" class="retry-send-btn" data-discard="${m.id}">Delete</button>`
      : `${m.is_pinned ? `<span class="pin-flag" title="Pinned">${I.pin}</span>` : ''}${m.is_edited && !deleted ? '<span>edited</span>' : ''}<span>${fmtTime(m.created_at)}</span>${ticksHtml(m)}`;
    const cls = ['message-bubble', isOwn ? 'own' : 'other', isNew ? 'msg-enter' : '', m._status === 'sending' ? 'is-sending' : '', failed ? 'is-failed' : '', deleted ? 'is-tombstone' : ''].filter(Boolean).join(' ');
    const menuBtn = !deleted && !m._status ? `<button type="button" class="bubble-menu-btn" data-bubble-menu="${m.id}" aria-label="Message actions" aria-haspopup="menu">${I.chevronDown}</button>` : '';
    return `<div class="${cls}" data-message-id="${m.id}" ${m.client_message_id ? `data-client-id="${m.client_message_id}"` : ''} tabindex="-1">${menuBtn}${body}<div class="message-meta">${meta}</div></div>`;
  }

  function messagesHtml(list) {
    let html = ''; let prev = '';
    for (const m of list) {
      const k = dayKey(m.created_at);
      if (k !== prev) { html += `<div class="day-separator" role="separator">${esc(fmtDay(m.created_at))}</div>`; prev = k; }
      html += bubbleHtml(m, false);
    }
    return html;
  }

  /** Full render. `scroll`: 'bottom' | 'keep' (anchor on the first visible element) | 'none'. */
  function renderMessages({ scroll = 'keep' } = {}) {
    const c = els.messages; if (!c) return;
    let anchor = null;
    if (scroll === 'keep') {
      const first = [...c.querySelectorAll('[data-message-id]')].find((el) => el.offsetTop + el.offsetHeight > c.scrollTop);
      if (first) anchor = { id: first.dataset.messageId, offset: first.offsetTop - c.scrollTop };
    }
    const empty = S.msgs.length === 0
      ? `<div class="chat-empty-hint">No messages yet — say hello.</div>`
      : '';
    c.innerHTML = `${S.hasOlder ? '<div class="thread-loading-older" id="chat-older" aria-hidden="true">Loading earlier messages…</div>' : ''}${empty}${messagesHtml(S.msgs)}`;
    if (!S.hasOlder) { const o = $('#chat-older'); if (o) o.remove(); }
    if (scroll === 'bottom') { c.scrollTop = c.scrollHeight; S.stick = true; }
    else if (anchor) {
      const el = c.querySelector(`[data-message-id="${CSS.escape(anchor.id)}"]`);
      if (el) c.scrollTop = el.offsetTop - anchor.offset;
    }
    observeMedia();
    updateJump();
  }

  function replaceBubble(id, m) {
    const el = els.messages && els.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!el) return;
    const wasSelected = el.classList.contains('is-selected');
    const t = document.createElement('div'); t.innerHTML = bubbleHtml(m, false).trim();
    const fresh = t.firstElementChild;
    if (wasSelected) fresh.classList.add('is-selected');
    el.replaceWith(fresh);
    observeMedia(fresh);
  }

  function appendBubble(m, isNew = true) {
    const c = els.messages; if (!c) return;
    const hint = c.querySelector('.chat-empty-hint'); if (hint) hint.remove();
    const wasNear = isNearBottom();
    const last = S.msgs[S.msgs.length - 2];
    let html = '';
    if (!last || dayKey(last.created_at) !== dayKey(m.created_at)) html += `<div class="day-separator" role="separator">${esc(fmtDay(m.created_at))}</div>`;
    html += bubbleHtml(m, isNew);
    const t = document.createElement('div'); t.innerHTML = html;
    const nodes = [...t.children];
    nodes.forEach((n) => c.appendChild(n));
    observeMedia(nodes[nodes.length - 1]);
    if (wasNear || m.sender_id === me()) c.scrollTop = c.scrollHeight;
  }

  function refreshTicks() {
    S.msgs.filter((m) => m.sender_id === me() && !m._status).forEach((m) => {
      const el = els.messages && els.messages.querySelector(`[data-message-id="${CSS.escape(m.id)}"] .tick`);
      if (!el) return;
      const read = isReadByOther(m);
      el.className = `tick ${read ? 'is-read' : ''}`;
      el.innerHTML = read ? I.check2 : I.check;
      el.title = read ? 'Read' : 'Sent';
    });
  }

  // ---- scrolling
  function isNearBottom() { const c = els.messages; return !c || c.scrollHeight - c.scrollTop - c.clientHeight < 120; }
  function scrollToBottom() { if (els.messages) { els.messages.scrollTop = els.messages.scrollHeight; S.stick = true; } }
  function updateJump() {
    if (!els.jump || !els.messages) return;
    const far = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight > 420;
    const show = far || S.hasNewer || S.unseenBelow > 0;
    els.jump.hidden = !show;
    $('#chat-jump-label').innerHTML = S.unseenBelow > 0 ? `New messages <span class="unread-badge">${S.unseenBelow}</span>` : 'Latest';
  }
  async function onScroll() {
    const c = els.messages; if (!c) return;
    S.stick = isNearBottom();
    if (c.scrollTop < 160 && S.hasOlder && !S.loadingOlder) loadOlder();
    if (S.hasNewer && !S.loadingNewer && c.scrollHeight - c.scrollTop - c.clientHeight < 200) loadNewer();
    if (isNearBottom() && !S.hasNewer && S.unseenBelow > 0) { S.unseenBelow = 0; markReadIfVisible(); }
    updateJump();
  }

  async function loadOlder() {
    const firstReal = S.msgs.find((m) => !m._status);
    if (!firstReal) return;
    S.loadingOlder = true;
    const id = S.activeId;
    try {
      const { messages } = await api.messages(id, `?beforeMessageId=${encodeURIComponent(firstReal.id)}&limit=${PAGE_SIZE}`);
      if (id !== S.activeId) return;
      const known = new Set(S.msgs.map((m) => m.id));
      const fresh = messages.filter((m) => !known.has(m.id));
      S.hasOlder = messages.length >= PAGE_SIZE;
      if (fresh.length) S.msgs = [...fresh, ...S.msgs];
      renderMessages({ scroll: 'keep' });
    } catch { /* the next scroll tries again */ } finally { S.loadingOlder = false; }
  }
  async function loadNewer() {
    const lastReal = [...S.msgs].reverse().find((m) => !m._status);
    if (!lastReal) return;
    S.loadingNewer = true;
    const id = S.activeId;
    try {
      const { messages } = await api.messages(id, `?afterMessageId=${encodeURIComponent(lastReal.id)}&limit=${PAGE_SIZE}`);
      if (id !== S.activeId) return;
      const known = new Set(S.msgs.map((m) => m.id));
      S.msgs = [...S.msgs, ...messages.filter((m) => !known.has(m.id))];
      if (messages.length < PAGE_SIZE) { S.hasNewer = false; }
      renderMessages({ scroll: 'keep' });
    } catch { /* retry on next scroll */ } finally { S.loadingNewer = false; }
  }

  async function jumpLatest() {
    const id = S.activeId;
    S.unseenBelow = 0;
    if (!S.hasNewer) { scrollToBottom(); updateJump(); markReadIfVisible(); return; }
    try {
      const { messages } = await api.messages(id, `?limit=${PAGE_SIZE}`);
      if (id !== S.activeId) return;
      const pending = S.msgs.filter((m) => m._status);
      S.msgs = [...messages, ...pending]; S.hasOlder = messages.length >= PAGE_SIZE; S.hasNewer = false;
      renderMessages({ scroll: 'bottom' });
      markReadIfVisible();
    } catch (err) { toast('error', err.message); }
  }

  /** Scroll to (and highlight) a message, loading a window around it first when it is not on screen. */
  async function jumpTo(messageId) {
    let el = els.messages.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!el) {
      try {
        const { messages } = await api.messages(S.activeId, `?aroundMessageId=${encodeURIComponent(messageId)}&limit=${PAGE_SIZE}`);
        if (!messages.find((m) => m.id === messageId)) { toast('info', 'That message is no longer available.'); return; }
        S.msgs = messages; S.hasOlder = true; S.hasNewer = true;
        renderMessages({ scroll: 'none' });
        el = els.messages.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      } catch (err) { toast('error', err.message); return; }
    }
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
    updateJump();
  }

  // ================================================================ MEDIA (private storage, signed URLs)
  async function mediaUrl(messageId, mediaId, variant = 'full', download = false) {
    const key = `${messageId}:${mediaId}:${variant}${download ? ':dl' : ''}`;
    const hit = S.urlCache.get(key);
    if (hit && hit.exp > Date.now() + 15000) return hit.url;
    if (S.urlInflight.has(key)) return S.urlInflight.get(key);
    const p = API.get(`/messaging/messages/${messageId}/media/${mediaId}/url?${variant === 'thumb' ? 'variant=thumb&' : ''}${download ? 'download=1' : ''}`)
      .then(({ signedUrl, expiresIn }) => { S.urlCache.set(key, { url: signedUrl, exp: Date.now() + (expiresIn || 300) * 1000 }); return signedUrl; })
      .finally(() => S.urlInflight.delete(key));
    S.urlInflight.set(key, p);
    return p;
  }

  /** Images load their small preview only when they scroll near the viewport. */
  function observeMedia(root) {
    const scope = root || els.messages; if (!scope) return;
    if (!imageObserver) {
      imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
          if (!entry.isIntersecting) return;
          const img = entry.target; imageObserver.unobserve(img);
          const [messageId, mediaId] = img.dataset.lazyMedia.split(':');
          if (img.getAttribute('src')) return;
          try {
            img.src = await mediaUrl(messageId, mediaId, 'thumb');
            img.addEventListener('load', () => img.closest('.media-image') && img.closest('.media-image').classList.remove('is-loading'), { once: true });
            img.addEventListener('error', () => { S.urlCache.clear(); }, { once: true });
          } catch { /* shows the placeholder box */ }
        });
      }, { root: els.messages, rootMargin: '300px 0px' });
    }
    const imgs = scope.matches && scope.matches('[data-lazy-media]') ? [scope] : [...scope.querySelectorAll('img[data-lazy-media]')];
    imgs.forEach((img) => { if (!img.getAttribute('src')) imageObserver.observe(img); });
  }

  // ---- voice note playback (one at a time)
  function stopAudio() {
    if (S.audio) { S.audio.el.pause(); S.audio.el.src = ''; resetVoiceUi(S.audio.key); S.audio = null; }
  }
  function resetVoiceUi(key) {
    if (!els.messages) return;
    const [, mediaId] = key.split(':');
    const root = els.messages.querySelector(`[data-voice="${CSS.escape(mediaId)}"]`);
    if (!root) return;
    root.querySelector('.voice-play').innerHTML = I.play;
    root.querySelector('.voice-play').setAttribute('aria-label', 'Play voice message');
    root.querySelectorAll('.voice-wave i').forEach((b) => b.classList.remove('is-played'));
  }
  async function toggleVoice(messageId, mediaId) {
    const key = `${messageId}:${mediaId}`;
    if (S.audio && S.audio.key === key) {
      if (S.audio.el.paused) { S.audio.el.play(); setVoicePlaying(mediaId, true); } else { S.audio.el.pause(); setVoicePlaying(mediaId, false); }
      return;
    }
    stopAudio();
    const msg = S.msgs.find((m) => m.id === messageId);
    const media = msg && (msg.media || []).find((x) => x.id === mediaId);
    try {
      const url = media && media._localUrl ? media._localUrl : await mediaUrl(messageId, mediaId);
      const el = new Audio(url);
      S.audio = { el, key, duration: media && media.duration_seconds };
      el.addEventListener('timeupdate', () => updateVoiceProgress(mediaId, el));
      el.addEventListener('ended', () => { resetVoiceUi(key); setVoiceTime(mediaId, S.audio && S.audio.duration); S.audio = null; });
      el.addEventListener('error', () => { toast('error', 'Could not play this voice message.'); resetVoiceUi(key); S.audio = null; S.urlCache.clear(); });
      await el.play();
      setVoicePlaying(mediaId, true);
    } catch (err) { toast('error', 'Could not play this voice message.'); S.audio = null; }
  }
  function setVoicePlaying(mediaId, playing) {
    const root = els.messages.querySelector(`[data-voice="${CSS.escape(mediaId)}"]`); if (!root) return;
    const btn = root.querySelector('.voice-play');
    btn.innerHTML = playing ? I.pause : I.play;
    btn.setAttribute('aria-label', playing ? 'Pause voice message' : 'Play voice message');
  }
  function setVoiceTime(mediaId, sec) {
    const t = els.messages.querySelector(`[data-voice-time="${CSS.escape(mediaId)}"]`); if (t) t.textContent = fmtDuration(sec);
  }
  function updateVoiceProgress(mediaId, el) {
    const root = els.messages.querySelector(`[data-voice="${CSS.escape(mediaId)}"]`); if (!root) return;
    const total = (S.audio && S.audio.duration) || (Number.isFinite(el.duration) ? el.duration : 0);
    const frac = total ? Math.min(1, el.currentTime / total) : 0;
    const bars = root.querySelectorAll('.voice-wave i');
    const upTo = Math.round(frac * bars.length);
    bars.forEach((b, i) => b.classList.toggle('is-played', i < upTo));
    const wave = root.querySelector('.voice-wave'); if (wave) wave.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    setVoiceTime(mediaId, el.currentTime);
  }
  function seekVoice(mediaId, ev, wave) {
    if (!S.audio || !S.audio.key.endsWith(`:${mediaId}`)) return;
    const rect = wave.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const total = S.audio.duration || S.audio.el.duration;
    if (total && Number.isFinite(total)) S.audio.el.currentTime = frac * total;
  }

  // ---- photo viewer + downloads
  function openLightbox(messageId, mediaId) {
    closeLightbox({ silent: true });
    const box = document.createElement('div');
    box.className = 'chat-lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo');
    box.innerHTML = `<div class="chat-lightbox-bar"><button type="button" class="icon-btn" id="lb-close" aria-label="Close photo">${I.back}</button><button type="button" class="icon-btn" id="lb-download" aria-label="Download photo">${I.download}</button></div><div class="chat-lightbox-stage"><img alt="Photo" /></div>`;
    document.body.appendChild(box);
    S.lightbox = { box, layer: pushLayer(() => closeLightbox({ viaBack: true })) };
    const img = box.querySelector('img');
    const msg = S.msgs.find((m) => m.id === messageId);
    const media = msg && (msg.media || []).find((x) => x.id === mediaId);
    if (media && media._localUrl) img.src = media._localUrl;
    else mediaUrl(messageId, mediaId).then((u) => { img.src = u; }).catch(() => toast('error', 'Could not load the photo.'));
    box.querySelector('#lb-close').addEventListener('click', () => closeLightbox());
    box.querySelector('#lb-download').addEventListener('click', () => downloadMedia(messageId, mediaId));
    box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('chat-lightbox-stage')) closeLightbox(); });
    box.querySelector('#lb-close').focus();
  }
  function closeLightbox({ silent = false, viaBack = false } = {}) {
    if (!S.lightbox) return;
    const { box, layer } = S.lightbox; S.lightbox = null;
    box.remove();
    if (!silent && !viaBack) popLayer(layer);
    else if (silent) { const i = S.layers.indexOf(layer); if (i !== -1) S.layers.splice(i, 1); }
  }
  async function downloadMedia(messageId, mediaId) {
    try {
      const url = await mediaUrl(messageId, mediaId, 'full', true);
      // In the Android app the system browser/download manager handles the file;
      // on the web the signed URL's attachment header triggers a normal download.
      if (inNativeApp()) window.open(url, '_blank'); else { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (err) { toast('error', err.message || 'Could not download the file.'); }
  }

  // ================================================================ PINNED
  function renderPinned() {
    const bar = els.pinned; if (!bar) return;
    if (!S.pins.length) { bar.hidden = true; bar.innerHTML = ''; return; }
    if (S.pinCursor >= S.pins.length) S.pinCursor = 0;
    const p = S.pins[S.pinCursor];
    bar.hidden = false;
    bar.innerHTML = `<button type="button" class="pinned-bar-main" id="pinned-go" aria-label="Go to pinned message ${S.pinCursor + 1} of ${S.pins.length}"><span class="pinned-bar-text-wrap"><span class="pinned-bar-title">Pinned message${S.pins.length > 1 ? ` ${S.pinCursor + 1}/${S.pins.length}` : ''}</span><span class="pinned-bar-text">${esc(previewOf(p))}</span></span></button><button type="button" class="icon-btn" id="pinned-list" aria-label="View all pinned messages">${I.list}</button>`;
    $('#pinned-go').addEventListener('click', () => { jumpTo(p.id); S.pinCursor = (S.pinCursor + 1) % S.pins.length; renderPinned(); });
    $('#pinned-list').addEventListener('click', openPinnedSheet);
  }
  async function reloadPins() {
    try { S.pins = (await api.pins(S.activeId)).messages; renderPinned(); } catch { /* keep what we have */ }
  }
  function openPinnedSheet() {
    openSheet({
      title: 'Pinned messages',
      actions: S.pins.map((p) => ({ icon: I.pin, label: previewOf(p).slice(0, 80) || 'Message', sub: `${p.sender_id === me() ? 'You' : esc(S.detail.other.full_name)} · ${fmtTime(p.created_at)}`, run: () => jumpTo(p.id) })),
    });
  }

  // ================================================================ SHEETS (long-press menu, chat menu, attachments …)
  function openSheet({ title, actions, html, onMount, selected }) {
    closeSheet({ silent: true });
    const sheet = document.createElement('div');
    sheet.className = 'chat-sheet'; sheet.setAttribute('role', 'menu');
    sheet.innerHTML = `${title ? `<div class="chat-sheet-title">${esc(title)}</div>` : ''}${html || (actions || []).map((a, i) => `<button type="button" class="sheet-action ${a.danger ? 'sheet-action--danger' : ''}" role="menuitem" data-sheet-action="${i}">${a.icon || ''}<span>${a.html || esc(a.label)}${a.sub ? `<small>${a.sub}</small>` : ''}</span></button>`).join('')}`;
    els.scrim.hidden = false;
    els.panel.appendChild(sheet);
    els.panel.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
    if (selected) {
      selected.classList.add('is-selected');
      revealAboveSheet(selected, sheet);
    }
    const layer = pushLayer(() => closeSheet({ viaBack: true }));
    S.sheet = { sheet, layer, selected };
    sheet.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sheet-action]'); if (!btn) return;
      const action = actions[Number(btn.dataset.sheetAction)];
      closeSheet();
      if (action && action.run) setTimeout(() => action.run(), 0);
    });
    els.scrim.onclick = () => closeSheet();
    const first = sheet.querySelector('button'); if (first) first.focus({ preventScroll: true });
    if (onMount) onMount(sheet);
    return sheet;
  }
  /**
   * The sheet covers the bottom of the chat. Make room for it (extra space under
   * the last message) and scroll so the selected message stays visible just above
   * the sheet -- you can always see which message the actions apply to.
   */
  function revealAboveSheet(el, sheet) {
    const c = els.messages;
    const composerH = els.composerStack.offsetHeight;
    c.style.paddingBottom = `${Math.max(0, sheet.offsetHeight - composerH) + 8}px`;
    const sheetTop = sheet.getBoundingClientRect().top;
    const box = el.getBoundingClientRect();
    const cTop = c.getBoundingClientRect().top;
    if (box.bottom > sheetTop - 8) c.scrollTop += box.bottom - (sheetTop - 8);
    if (el.getBoundingClientRect().top < cTop + 4) c.scrollTop -= cTop + 4 - el.getBoundingClientRect().top; // taller than the free area: keep its top in view
  }

  function closeSheet({ silent = false, viaBack = false } = {}) {
    if (!S.sheet) return;
    const { sheet, layer, selected } = S.sheet; S.sheet = null;
    if (els.messages) els.messages.style.paddingBottom = '';
    sheet.remove();
    if (selected) selected.classList.remove('is-selected');
    if (els.scrim) { els.scrim.hidden = true; els.scrim.onclick = null; }
    if (els.panel) els.panel.style.removeProperty('--sheet-h');
    if (!silent && !viaBack) popLayer(layer);
    else if (silent) { const i = S.layers.indexOf(layer); if (i !== -1) S.layers.splice(i, 1); }
  }

  // ================================================================ MESSAGE ACTIONS (long press / right click / ⋯)
  function canEdit(m) {
    return m.sender_id === me() && !m._status && !m.deleted_at && m.message_type !== 'voice_note' && !!m.content && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
  }

  function openMessageActions(el, m) {
    if (!m) return;
    vibrate(12);
    const live = !m._status && !m.deleted_at;
    const isOwn = m.sender_id === me();
    const actions = [];
    if (m._status === 'failed') {
      actions.push({ icon: I.send, label: 'Retry sending', run: () => retrySend(m.id) });
      actions.push({ icon: I.trash, label: 'Delete', danger: true, run: () => discardPending(m.id) });
    } else if (live) {
      const blocked = S.detail && (S.detail.blocked_by_me || S.detail.blocked_me);
      if (!blocked) actions.push({ icon: I.reply, label: 'Reply', run: () => startReply(m) });
      if (m.content) actions.push({ icon: I.copy, label: 'Copy', run: () => copyText(m.content) });
      if (m.content && !blocked) actions.push({ icon: I.forward, label: 'Forward', run: () => openForward(m) });
      if (canEdit(m)) actions.push({ icon: I.edit, label: 'Edit', sub: 'Available for 20 minutes after sending', run: () => startEdit(m) });
      actions.push(m.is_pinned
        ? { icon: I.pin, label: 'Unpin', run: () => togglePin(m, false) }
        : { icon: I.pin, label: 'Pin', run: () => togglePin(m, true) });
      if (!isOwn) actions.push({ icon: I.flag, label: 'Report', run: () => openReport(m) });
      actions.push({ icon: I.trash, label: 'Delete', danger: true, run: () => openDelete(m) });
    } else if (m.deleted_at) {
      actions.push({ icon: I.trash, label: 'Delete for me', danger: true, run: () => deleteMessage(m, 'me') });
    }
    if (!actions.length) return;
    openSheet({ title: 'Message', actions, selected: el });
  }

  function openDelete(m) {
    const actions = [{ icon: I.trash, label: 'Delete for me', sub: 'Removes it from your view only', run: () => deleteMessage(m, 'me') }];
    if (m.sender_id === me()) actions.push({ icon: I.trash, label: 'Delete for everyone', sub: 'Replaces it with "This message was deleted" for both of you', danger: true, run: () => deleteMessage(m, 'everyone') });
    openSheet({ title: 'Delete message', actions });
  }
  async function deleteMessage(m, scope) {
    try {
      const { message } = await API.delete(`/messaging/messages/${m.id}?scope=${scope}`);
      if (scope === 'me') removeMessage(m.id); else applyServerMessage(message);
      toast('success', scope === 'me' ? 'Deleted for you.' : 'Deleted for everyone.');
    } catch (err) { toast('error', err.message); }
  }
  function removeMessage(id) {
    S.msgs = S.msgs.filter((x) => x.id !== id);
    const el = els.messages && els.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (el) el.remove();
    S.pins = S.pins.filter((p) => p.id !== id); renderPinned();
  }
  async function togglePin(m, pin) {
    try {
      if (pin) await API.post(`/messaging/messages/${m.id}/pin`); else await API.delete(`/messaging/messages/${m.id}/pin`);
      m.is_pinned = pin; replaceBubble(m.id, m); await reloadPins();
      toast('success', pin ? 'Message pinned.' : 'Message unpinned.');
    } catch (err) { toast('error', err.message); }
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('success', 'Copied.'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('success', 'Copied.'); } catch { toast('error', 'Could not copy.'); }
      ta.remove();
    }
  }
  function openReport(m) {
    const reasons = ['Spam', 'Harassment or abuse', 'Scam or fraud', 'Inappropriate content', 'Something else'];
    openSheet({
      title: 'Report this message',
      actions: reasons.map((r) => ({ icon: I.flag, label: r, run: async () => {
        try { await API.post(`/messaging/messages/${m.id}/report`, { reason: r }); toast('success', 'Thanks — our team will review this message.'); } catch (err) { toast('error', err.message); }
      } })),
    });
  }
  function openForward(m) {
    const targets = [...S.convs.values()].filter((c) => c.id !== S.activeId);
    if (!targets.length) { toast('info', 'You have no other conversations to forward to.'); return; }
    openSheet({
      title: 'Forward to…',
      html: targets.map((c, i) => `<button type="button" class="forward-item" role="menuitem" data-forward="${i}"><img src="${esc(c.other_profile_picture_url || ASSETS.defaultAvatar)}" alt="" /><span>${esc(c.other_full_name)}</span></button>`).join(''),
      onMount: (sheet) => sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-forward]'); if (!b) return;
        const target = targets[Number(b.dataset.forward)];
        closeSheet();
        try { await api.send(target.id, { content: m.content, clientMessageId: uuid() }); toast('success', `Forwarded to ${target.other_full_name}.`); } catch (err) { toast('error', err.message); }
      }),
    });
  }

  function wireLongPress() {
    const c = els.messages;
    let timer = null; let startX = 0; let startY = 0; let target = null;
    const cancel = () => { clearTimeout(timer); timer = null; target = null; };
    const bubbleFor = (e) => {
      if (e.target.closest('a, button, .voice-wave, audio')) return null;
      return e.target.closest('.message-bubble');
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // desktop: right-click / the ⋯ button
      const b = bubbleFor(e); if (!b) return;
      startX = e.clientX; startY = e.clientY; target = b;
      timer = setTimeout(() => { const m = findMsg(b.dataset.messageId); const t = target; cancel(); if (m && t) openMessageActions(t, m); }, LONG_PRESS_MS);
    });
    // A scroll or any real finger movement cancels the press, so scrolling can never open a menu.
    c.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > LONG_PRESS_MOVE_PX) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => c.addEventListener(ev, cancel));
    c.addEventListener('scroll', cancel, { passive: true });
    c.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('.message-bubble');
      if (!b) return;
      e.preventDefault(); // also suppresses the native long-press menu on Android
      const m = findMsg(b.dataset.messageId); if (m) openMessageActions(b, m);
    });
  }
  const findMsg = (id) => S.msgs.find((m) => m.id === id);

  // ================================================================ COMPOSER
  function autoGrow() {
    if (!els.input) return;
    els.input.style.height = 'auto';
    const h = Math.min(els.input.scrollHeight, 132);
    els.input.style.height = `${h}px`;
    els.input.style.overflowY = els.input.scrollHeight > 132 ? 'auto' : 'hidden'; // no scrollbar until the field is actually full
    els.panel.style.setProperty('--composer-h', `${els.composerStack.offsetHeight}px`);
  }

  function composerBlockedMessage() {
    const d = S.detail;
    if (!d) return null;
    if (d.blocked_by_me) return { text: 'You blocked this person.', action: 'Unblock', run: toggleBlock };
    if (d.blocked_me) return { text: "You can't send messages to this person." };
    return null;
  }

  function renderComposer() {
    if (!els.form) return;
    const blocked = composerBlockedMessage();
    if (blocked) {
      els.form.innerHTML = `<div class="composer-blocked" style="flex:1">${esc(blocked.text)} ${blocked.action ? `<button type="button" class="btn btn-secondary btn-sm" id="composer-unblock" style="margin-left:var(--space-2)">${blocked.action}</button>` : ''}</div>`;
      const ub = $('#composer-unblock'); if (ub) ub.addEventListener('click', blocked.run);
      els.input = null; return;
    }
    if (S.recorder) { renderRecorder(); return; }
    const draft = els.input ? els.input.value : '';
    els.form.innerHTML = `
      <button type="button" class="icon-btn" id="composer-attach" aria-label="Attach a photo or file">${I.plus}</button>
      <div class="composer-field"><textarea id="composer-input" rows="1" placeholder="Message" enterkeyhint="send" autocomplete="off" aria-label="Message"></textarea></div>
      <button type="button" class="icon-btn" id="composer-mic" aria-label="Record a voice message">${I.mic}</button>
      <button type="submit" class="icon-btn composer-send" id="composer-send" aria-label="Send" hidden>${I.send}</button>`;
    els.input = $('#composer-input');
    els.input.value = draft || (S.edit ? S.edit.original : '');
    $('#composer-attach').addEventListener('click', openAttachSheet);
    $('#composer-mic').addEventListener('click', startRecording);
    els.input.addEventListener('input', () => { autoGrow(); renderComposerButtons(); });
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); els.form.requestSubmit(); }
      if (e.key === 'Escape' && (S.reply || S.edit)) cancelContext();
    });
    // Keep the newest message visible when the keyboard opens.
    els.input.addEventListener('focus', () => { setTimeout(() => { if (isNearBottom()) scrollToBottom(); }, 250); });
    autoGrow(); renderComposerButtons();
  }

  function renderComposerButtons() {
    const hasText = !!(els.input && els.input.value.trim());
    const hasStaged = S.staged.length > 0;
    const send = $('#composer-send'); const mic = $('#composer-mic'); const attach = $('#composer-attach');
    if (!send || !mic) return;
    const sendable = hasText || hasStaged;
    send.hidden = !sendable; mic.hidden = sendable || S.edit != null || typeof MediaRecorder === 'undefined';
    if (S.edit) { send.innerHTML = I.check; send.setAttribute('aria-label', 'Save changes'); } else { send.innerHTML = I.send; send.setAttribute('aria-label', 'Send'); }
    if (attach) attach.disabled = S.edit != null;
    els.panel.style.setProperty('--composer-h', `${els.composerStack.offsetHeight}px`);
  }

  function renderContext() {
    const box = els.composerContext;
    if (S.edit) {
      box.hidden = false;
      box.innerHTML = `<div class="composer-context-body"><span class="composer-context-title">Editing message</span><span class="composer-context-text">${esc(S.edit.original)}</span></div><button type="button" class="icon-btn" id="ctx-cancel" aria-label="Cancel editing">${I.close}</button>`;
    } else if (S.reply) {
      const r = S.reply;
      box.hidden = false;
      box.innerHTML = `<div class="composer-context-body"><span class="composer-context-title">Replying to ${r.sender_id === me() ? 'yourself' : esc(S.detail.other.full_name)}</span><span class="composer-context-text">${esc(previewOf(r))}</span></div><button type="button" class="icon-btn" id="ctx-cancel" aria-label="Cancel reply">${I.close}</button>`;
    } else { box.hidden = true; box.innerHTML = ''; }
    const cancel = $('#ctx-cancel'); if (cancel) cancel.addEventListener('click', cancelContext);
    renderComposerButtons();
  }
  function startReply(m) { S.edit = null; S.reply = m; renderContext(); if (els.input) els.input.focus(); }
  function startEdit(m) {
    S.reply = null; S.edit = { id: m.id, original: m.content };
    renderContext(); renderComposer();
    if (els.input) { els.input.value = m.content; autoGrow(); els.input.focus(); }
    renderComposerButtons();
  }
  function cancelContext() {
    const wasEdit = !!S.edit; S.reply = null; S.edit = null;
    if (wasEdit && els.input) els.input.value = '';
    renderContext(); renderComposer();
  }

  // ---- staged attachments
  function renderStrip() {
    const strip = els.strip; if (!strip) return;
    if (!S.staged.length) { strip.hidden = true; strip.innerHTML = ''; renderComposerButtons(); return; }
    strip.hidden = false;
    strip.innerHTML = S.staged.map((a) => `<div class="attachment-chip">${a.kind === 'image' ? `<img src="${a.previewUrl}" alt="" />` : `<span class="file-card-icon" style="width:32px;height:32px">${I.file}</span>`}<span class="attachment-chip-name">${esc(a.name)}</span><button type="button" class="icon-btn" data-unstage="${a.id}" aria-label="Remove ${esc(a.name)}">${I.close}</button></div>`).join('');
    strip.querySelectorAll('[data-unstage]').forEach((b) => b.addEventListener('click', () => {
      const a = S.staged.find((x) => x.id === b.dataset.unstage);
      if (a && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      S.staged = S.staged.filter((x) => x.id !== b.dataset.unstage); renderStrip();
    }));
    renderComposerButtons();
  }

  /** Photos are downscaled in the browser before upload (the server re-encodes too): a 12MP phone photo should not cross a mobile network at full size. */
  async function compressImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const max = 1600; const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return file; }
  }

  async function stageFiles(fileList, kind) {
    for (const file of Array.from(fileList)) {
      const isImage = kind === 'image' || /^image\//.test(file.type);
      const limit = isImage ? MAX_FILE_BYTES.image : MAX_FILE_BYTES.document;
      if (file.size > limit) { toast('error', `"${file.name}" is too large (max ${Math.round(limit / 1048576)}MB).`); continue; }
      if (!isImage && !/\.(pdf|docx?|xlsx?|zip)$/i.test(file.name)) { toast('error', `"${file.name}" is not a supported file type (PDF, Word, Excel or ZIP).`); continue; }
      const prepared = isImage ? await compressImage(file) : file;
      S.staged.push({ id: uuid(), file: prepared, kind: isImage ? 'image' : 'document', name: file.name, size: prepared.size, previewUrl: isImage ? URL.createObjectURL(prepared) : null });
    }
    renderStrip();
  }

  function openAttachSheet() {
    openSheet({
      title: 'Share',
      html: `<div class="attach-grid">
        <button type="button" class="attach-option" data-attach="camera"><span class="attach-icon">${I.camera}</span>Camera</button>
        <button type="button" class="attach-option" data-attach="photos"><span class="attach-icon">${I.image}</span>Photos</button>
        <button type="button" class="attach-option" data-attach="docs"><span class="attach-icon">${I.file}</span>File</button>
      </div>`,
      onMount: (sheet) => sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-attach]'); if (!b) return;
        const which = b.dataset.attach;
        closeSheet();
        $(which === 'camera' ? '#file-camera' : which === 'photos' ? '#file-photos' : '#file-docs').click();
      }),
    });
  }

  // ================================================================ SENDING
  function submitComposer(e) {
    e.preventDefault();
    if (!els.input) return;
    const text = els.input.value.trim();
    if (S.edit) return saveEdit(text);
    if (!text && !S.staged.length) return;
    const reply = S.reply;
    const staged = S.staged.slice();
    S.reply = null; S.staged = []; els.input.value = ''; autoGrow();
    drafts.delete(S.activeId);
    renderContext(); renderStrip();
    if (!staged.length) { enqueue({ content: text, reply }); }
    else staged.forEach((a, i) => enqueue({ content: i === 0 ? text : '', reply: i === 0 ? reply : null, files: [a] }));
    scrollToBottom();
    els.input.focus();
  }

  function pendingMessage({ content, reply, files, voice }) {
    const clientId = uuid();
    const media = [];
    (files || []).forEach((f) => media.push({ id: `tmp-m-${f.id}`, media_type: f.kind === 'image' ? 'image' : 'document', file_name: f.name, file_size: f.size, _localUrl: f.previewUrl || null }));
    if (voice) media.push({ id: `tmp-m-${voice.id}`, media_type: 'voice_note', duration_seconds: voice.duration, waveform: voice.waveform, _localUrl: voice.url });
    const type = voice ? 'voice_note' : files && files[0] ? (files[0].kind === 'image' ? 'image' : 'document') : 'text';
    return {
      id: `tmp-${clientId}`, client_message_id: clientId, conversation_id: S.activeId, sender_id: me(), message_type: type,
      content: content || null, created_at: new Date().toISOString(), _status: 'sending', _progress: 0,
      reply_to_message_id: reply ? reply.id : null,
      reply_to: reply ? { id: reply.id, sender_id: reply.sender_id, sender_name: reply.sender_id === me() ? S.user.fullName : S.detail.other.full_name, message_type: reply.message_type, deleted: false, content: (reply.content || '').slice(0, 140) } : null,
      media, _files: files || null, _voice: voice || null, is_pinned: false,
    };
  }

  function enqueue(opts) {
    const p = pendingMessage(opts);
    S.msgs.push(p); appendBubble(p, true);
    bumpConversation(S.activeId, p, { fromMe: true, active: true });
    deliver(p);
  }

  async function uploadOne(p, file, category, extra) {
    const fd = new FormData();
    fd.append('file', file instanceof File ? file : new File([file], extra.fileName || 'voice-message', { type: file.type }));
    const res = await API.uploadWithProgress(`/storage/chat/${category}`, fd, (pct) => { p._progress = pct; updateProgress(p); });
    return { storagePath: res.storagePath, thumbnailPath: res.thumbnailPath || undefined, fileName: res.fileName || extra.fileName || undefined, width: res.width || undefined, height: res.height || undefined, ...extra.meta };
  }
  function updateProgress(p) {
    const el = els.messages && els.messages.querySelector(`[data-message-id="${CSS.escape(p.id)}"]`); if (!el) return;
    el.querySelectorAll('progress').forEach((pr) => { pr.value = p._progress || 0; });
    const size = el.querySelector('.file-card-size'); if (size && p._files) size.textContent = `${fmtBytes(p._files[0].size)}${p._progress ? ` · ${p._progress}%` : ''}`;
  }

  /** Upload (if needed) then POST. Idempotent: the same clientMessageId is reused on retry, so a resend can never duplicate. */
  async function deliver(p) {
    const convId = p.conversation_id;
    p._status = 'sending'; replaceBubble(p.id, p);
    try {
      let mediaItems;
      if (p._files || p._voice) {
        mediaItems = [];
        for (const f of p._files || []) {
          if (!f.uploaded) f.uploaded = await uploadOne(p, f.file, f.kind === 'image' ? 'image' : 'document', { fileName: f.name });
          mediaItems.push(f.uploaded);
        }
        if (p._voice) {
          if (!p._voice.uploaded) p._voice.uploaded = await uploadOne(p, p._voice.blob, 'voice_note', { fileName: 'voice-message', meta: { durationSeconds: p._voice.duration, waveform: p._voice.waveform } });
          mediaItems.push(p._voice.uploaded);
        }
      }
      const body = { content: p.content || undefined, replyToMessageId: p.reply_to_message_id || undefined, clientMessageId: p.client_message_id, mediaItems };
      const { message } = await api.send(convId, body);
      if (convId !== S.activeId) return;
      swapPending(p, message);
    } catch (err) {
      p._status = 'failed'; p._error = err.message;
      if (convId === S.activeId) replaceBubble(p.id, p);
      if (err.code === 'BLOCKED') { toast('error', err.message); await refreshDetail(); }
    }
  }

  /** Replace the optimistic bubble with the server's message (or just drop it if the realtime echo already delivered it). */
  function swapPending(p, message) {
    const dup = S.msgs.find((m) => m.id === message.id);
    // Own just-sent media keeps showing the local preview/recording instead of
    // re-downloading what this device already has (no flicker, one request fewer).
    (message.media || []).forEach((media, i) => { const local = p.media && p.media[i] && p.media[i]._localUrl; if (local) media._localUrl = local; });
    (p.media || []).forEach((media) => { if (media._localUrl) S.blobUrls.push(media._localUrl); });
    if (dup) { S.msgs = S.msgs.filter((m) => m !== p); const el = els.messages.querySelector(`[data-message-id="${CSS.escape(p.id)}"]`); if (el) el.remove(); }
    else { const i = S.msgs.indexOf(p); if (i !== -1) S.msgs[i] = message; replaceBubble(p.id, message); }
  }
  /** A message that never got sent: nothing to keep, release its local files now. */
  function cleanupPendingUrls(p) {
    (p.media || []).forEach((media) => { if (media._localUrl) URL.revokeObjectURL(media._localUrl); });
  }
  function retrySend(id) { const p = findMsg(id); if (p && p._status === 'failed') deliver(p); }
  function discardPending(id) {
    const p = findMsg(id); if (!p) return;
    cleanupPendingUrls(p); removeMessage(id);
  }

  async function saveEdit(text) {
    const edit = S.edit;
    if (!text) { toast('error', 'A message cannot be empty. Delete it instead.'); return; }
    if (text === edit.original) { cancelContext(); return; }
    try {
      const { message } = await API.patch(`/messaging/messages/${edit.id}`, { content: text });
      S.edit = null; if (els.input) els.input.value = '';
      applyServerMessage(message); renderContext(); renderComposer();
    } catch (err) { toast('error', err.message); }
  }

  /** Merge an updated/deleted message from the server into state + DOM. */
  function applyServerMessage(message) {
    const i = S.msgs.findIndex((m) => m.id === message.id);
    if (i === -1) return;
    S.msgs[i] = message; replaceBubble(message.id, message);
    S.pins = message.deleted_at ? S.pins.filter((p) => p.id !== message.id) : S.pins.map((p) => (p.id === message.id ? message : p));
    renderPinned();
    if (message.reply_to_message_id === undefined) return;
    // quoted copies of an edited/deleted message update too
    S.msgs.forEach((m) => { if (m.reply_to && m.reply_to.id === message.id) { m.reply_to = { ...m.reply_to, content: message.deleted_at ? null : (message.content || '').slice(0, 140), deleted: !!message.deleted_at }; replaceBubble(m.id, m); } });
  }

  // ================================================================ VOICE RECORDING
  const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

  async function startRecording() {
    if (S.recorder) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('error', 'Voice messages are not supported on this device.'); return;
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      toast('error', denied ? 'Microphone access was denied. Allow it in your phone settings (Apps → Job Rush → Permissions) and try again.' : err && err.name === 'NotFoundError' ? 'No microphone was found on this device.' : 'Could not start the microphone.');
      return;
    }
    const mime = RECORDER_MIMES.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const state = { state: 'recording', stream, rec, chunks: [], peaks: [], startedAt: Date.now(), mime: rec.mimeType || mime || 'audio/webm', ctx: null, timer: null, sampler: null, cancelled: false };
    S.recorder = state;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    rec.onstop = () => onRecorderStopped(state);
    // Level meter -> both the live bars and the waveform that is stored with the message.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Ctx(); const src = state.ctx.createMediaStreamSource(stream); const an = state.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      state.sampler = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let max = 0; for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i] - 128));
        state.peaks.push(Math.round((max / 128) * 100));
        paintLevel(state);
      }, 100);
    } catch { /* the recording works without a meter */ }
    rec.start(250);
    state.timer = setInterval(() => {
      const secs = (Date.now() - state.startedAt) / 1000;
      const t = $('#rec-time'); if (t) t.textContent = fmtDuration(secs);
      if (secs >= MAX_RECORDING_SECONDS) stopRecording();
    }, 250);
    renderRecorder();
  }

  function paintLevel(state) {
    const box = $('#rec-level'); if (!box) return;
    const slots = Math.max(8, Math.floor(box.clientWidth / 5));
    const recent = state.peaks.slice(-slots);
    box.innerHTML = recent.map((v) => `<i style="--h:${Math.max(8, v)}%"></i>`).join('');
  }

  function releaseRecorderResources(state) {
    clearInterval(state.timer); clearInterval(state.sampler);
    try { state.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { if (state.ctx) state.ctx.close(); } catch { /* ignore */ }
  }

  function stopRecording() {
    const st = S.recorder; if (!st || st.state !== 'recording') return;
    try { st.rec.stop(); } catch { /* already stopped */ }
  }

  function onRecorderStopped(st) {
    releaseRecorderResources(st);
    if (st.cancelled || S.recorder !== st) return;
    const duration = Math.max(1, (Date.now() - st.startedAt) / 1000);
    const blob = new Blob(st.chunks, { type: st.mime.split(';')[0] });
    if (blob.size < 800) { toast('error', 'That recording was too short.'); S.recorder = null; renderComposer(); return; }
    // Downsample the captured peaks to 40 bars, normalised so quiet recordings still look like a waveform.
    const bars = 40; const out = [];
    for (let i = 0; i < bars; i++) {
      const a = Math.floor((i / bars) * st.peaks.length); const b = Math.max(a + 1, Math.floor(((i + 1) / bars) * st.peaks.length));
      const slice = st.peaks.slice(a, b); out.push(slice.length ? Math.max(...slice) : 10);
    }
    const top = Math.max(...out, 1);
    st.state = 'preview'; st.blob = blob; st.duration = Math.round(duration);
    st.waveform = out.map((v) => Math.max(8, Math.round((v / top) * 100)));
    st.url = URL.createObjectURL(blob);
    renderRecorder();
  }

  function cancelRecording(silent) {
    const st = S.recorder; if (!st) return;
    st.cancelled = true;
    try { if (st.rec.state !== 'inactive') st.rec.stop(); } catch { /* ignore */ }
    releaseRecorderResources(st);
    if (st.url) URL.revokeObjectURL(st.url);
    if (st.previewAudio) st.previewAudio.pause();
    S.recorder = null;
    if (!silent) renderComposer();
  }

  function renderRecorder() {
    const st = S.recorder; if (!st) { renderComposer(); return; }
    els.input = null;
    if (st.state === 'recording') {
      els.form.innerHTML = `
        <button type="button" class="icon-btn" id="rec-cancel" aria-label="Cancel recording">${I.trash}</button>
        <div class="recorder"><span class="recorder-dot" aria-hidden="true"></span><span class="recorder-time" id="rec-time" aria-live="off">0:00</span><div class="recorder-level" id="rec-level" aria-hidden="true"></div></div>
        <button type="button" class="icon-btn composer-send" id="rec-stop" aria-label="Stop recording">${I.stop}</button>`;
      $('#rec-cancel').addEventListener('click', () => cancelRecording());
      $('#rec-stop').addEventListener('click', stopRecording);
    } else {
      const bars = st.waveform.map((v) => `<i style="--h:${v}%"></i>`).join('');
      els.form.innerHTML = `
        <button type="button" class="icon-btn" id="rec-discard" aria-label="Discard recording">${I.trash}</button>
        <div class="recorder"><button type="button" class="voice-play" id="rec-play" aria-label="Play recording">${I.play}</button><div class="voice-wave" id="rec-wave">${bars}</div><span class="voice-time" id="rec-dur">${fmtDuration(st.duration)}</span></div>
        <button type="submit" class="icon-btn composer-send" id="rec-send" aria-label="Send voice message">${I.send}</button>`;
      $('#rec-discard').addEventListener('click', () => cancelRecording());
      $('#rec-play').addEventListener('click', () => {
        if (!st.previewAudio) {
          st.previewAudio = new Audio(st.url);
          st.previewAudio.addEventListener('ended', () => { $('#rec-play').innerHTML = I.play; });
          st.previewAudio.addEventListener('timeupdate', () => { const bs = $('#rec-wave').querySelectorAll('i'); const up = Math.round((st.previewAudio.currentTime / st.duration) * bs.length); bs.forEach((b, i) => b.classList.toggle('is-played', i < up)); });
        }
        if (st.previewAudio.paused) { st.previewAudio.play(); $('#rec-play').innerHTML = I.pause; } else { st.previewAudio.pause(); $('#rec-play').innerHTML = I.play; }
      });
    }
    els.panel.style.setProperty('--composer-h', `${els.composerStack.offsetHeight}px`);
  }

  function sendRecording() {
    const st = S.recorder; if (!st || st.state !== 'preview') return false;
    if (st.previewAudio) st.previewAudio.pause();
    const reply = S.reply; S.reply = null; renderContext();
    // The blob + object URL now belong to the pending message (released after it is sent).
    S.recorder = null;
    enqueue({ reply, voice: { id: uuid(), blob: st.blob, url: st.url, duration: st.duration, waveform: st.waveform } });
    renderComposer(); scrollToBottom();
    return true;
  }

  // ================================================================ CHAT MENU (top-right ⋮)
  function openChatMenu() {
    const d = S.detail; if (!d) return;
    const actions = [];
    actions.push({ icon: I.search, label: 'Search in chat', run: openSearch });
    if (d.other.role !== 'hirer') actions.push({ icon: I.user, label: 'View profile', run: () => { window.location.href = `worker-profile.html?id=${encodeURIComponent(d.other.user_id)}`; } });
    actions.push({ icon: I.image, label: 'Media & files', run: openMediaSheet });
    actions.push(d.muted_until
      ? { icon: I.bell, label: 'Unmute notifications', run: () => muteConversation(null) }
      : { icon: I.bellOff, label: 'Mute notifications', run: openMuteSheet });
    actions.push({ icon: I.gear, label: 'Chat settings', sub: 'Theme, wallpaper and ringtone', run: () => { window.location.href = 'profile-settings.html?tab=chat'; } });
    actions.push({ icon: I.archive, label: 'Archive chat', run: archiveChat });
    actions.push({ icon: I.trash, label: 'Clear chat', sub: 'Removes the history for you only', danger: true, run: clearChat });
    actions.push(d.blocked_by_me
      ? { icon: I.ban, label: 'Unblock', run: toggleBlock }
      : { icon: I.ban, label: 'Block', danger: true, run: toggleBlock });
    openSheet({ title: d.other.full_name, actions });
  }

  function openMuteSheet() {
    openSheet({ title: 'Mute notifications', actions: [
      { icon: I.bellOff, label: 'For 8 hours', run: () => muteConversation('8h') },
      { icon: I.bellOff, label: 'For 1 week', run: () => muteConversation('1w') },
      { icon: I.bellOff, label: 'Always', run: () => muteConversation('forever') },
    ] });
  }
  async function muteConversation(duration) {
    try {
      const res = await API.post(`/messaging/conversations/${S.activeId}/mute`, { duration });
      S.detail.muted_until = res.muted_until;
      const c = S.convs.get(S.activeId); if (c) { c.is_muted = !!res.muted_until; c.muted_until = res.muted_until; }
      setPeerHeader(); renderList();
      toast('success', res.muted_until ? 'Notifications muted for this chat.' : 'Notifications turned back on.');
    } catch (err) { toast('error', err.message); }
  }
  async function archiveChat() {
    try { await API.post(`/messaging/conversations/${S.activeId}/archive`); S.convs.delete(S.activeId); toast('success', 'Chat archived. Find it under Chat settings → Archived chats.'); closeConversation(); renderList(); }
    catch (err) { toast('error', err.message); }
  }
  async function clearChat() {
    const ok = await Modal.confirm({ title: 'Clear this chat?', message: 'This removes the message history from your view only. The other person keeps their copy.', confirmLabel: 'Clear chat', danger: true });
    if (!ok) return;
    try {
      await API.post(`/messaging/conversations/${S.activeId}/clear`);
      S.msgs = []; S.pins = []; renderPinned(); renderMessages({ scroll: 'bottom' });
      const c = S.convs.get(S.activeId); if (c) { c.last_message_preview = null; c.unread_count = 0; renderList(); }
      toast('success', 'Chat cleared.');
    } catch (err) { toast('error', err.message); }
  }
  async function toggleBlock() {
    const d = S.detail; const blocking = !d.blocked_by_me;
    if (blocking) {
      const ok = await Modal.confirm({ title: `Block ${esc(d.other.full_name)}?`, message: "They won't be able to message or call you, and you won't be able to message them.", confirmLabel: 'Block', danger: true });
      if (!ok) return;
    }
    try {
      if (blocking) await API.post('/messaging/block', { userId: d.other.user_id }); else await API.delete(`/messaging/block/${d.other.user_id}`);
      await refreshDetail(); toast('success', blocking ? 'User blocked.' : 'User unblocked.');
    } catch (err) { toast('error', err.message); }
  }
  async function refreshDetail() {
    if (!S.activeId) return;
    try { S.detail = (await api.detail(S.activeId)).conversation; setPeerHeader(); } catch { /* keep the old header */ }
  }

  // ---- search inside the conversation
  function openSearch() {
    els.search.hidden = false; els.searchInput.value = ''; els.searchInput.focus();
    S.searchLayer = pushLayer(() => closeSearch({ viaBack: true }));
  }
  function closeSearch({ viaBack = false } = {}) {
    if (!els.search || els.search.hidden) return;
    els.search.hidden = true; els.searchResults.hidden = true; els.searchResults.innerHTML = '';
    if (!viaBack && S.searchLayer) popLayer(S.searchLayer); else if (S.searchLayer) { const i = S.layers.indexOf(S.searchLayer); if (i !== -1) S.layers.splice(i, 1); }
    S.searchLayer = null;
  }
  let searchTimer = null;
  function onSearchInput() {
    clearTimeout(searchTimer);
    const q = els.searchInput.value.trim();
    if (q.length < 2) { els.searchResults.hidden = true; return; }
    searchTimer = setTimeout(async () => {
      const seq = ++S.searchSeq;
      try {
        const { messages } = await API.get(`/messaging/conversations/${S.activeId}/messages/search?q=${encodeURIComponent(q)}`);
        if (seq !== S.searchSeq) return; // a newer search superseded this one
        els.searchResults.hidden = false;
        const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
        els.searchResults.innerHTML = messages.length
          ? messages.map((m) => `<button type="button" class="search-hit" data-hit="${m.id}"><span class="search-hit-meta">${m.sender_id === me() ? 'You' : esc(S.detail.other.full_name)} · ${esc(fmtDay(m.created_at))} ${fmtTime(m.created_at)}</span><span class="search-hit-text">${esc(m.content || (m.media[0] && m.media[0].file_name) || typeLabel(m.message_type)).replace(re, '<mark>$1</mark>')}</span></button>`).join('')
          : `<div class="search-empty">No messages match "${esc(q)}".</div>`;
      } catch (err) { els.searchResults.hidden = false; els.searchResults.innerHTML = `<div class="search-empty">${esc(err.message)}</div>`; }
    }, 300);
  }

  // ---- media & files
  function openMediaSheet() {
    const tabs = [['image', 'Photos'], ['document', 'Files'], ['voice_note', 'Voice']];
    const sheet = openSheet({
      title: 'Media & files',
      html: `<div class="sheet-tabs" role="tablist">${tabs.map(([k, l], i) => `<button type="button" class="sheet-tab ${i === 0 ? 'is-active' : ''}" role="tab" data-kind="${k}">${l}</button>`).join('')}</div><div id="media-body"><div class="chat-list-empty">Loading…</div></div>`,
      onMount: (el) => {
        const load = async (kind) => {
          el.querySelectorAll('.sheet-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.kind === kind));
          const body = el.querySelector('#media-body'); body.innerHTML = '<div class="chat-list-empty">Loading…</div>';
          try {
            const { media } = await API.get(`/messaging/conversations/${S.activeId}/media?kind=${kind}`);
            if (!media.length) { body.innerHTML = `<div class="chat-list-empty"><p>Nothing shared here yet.</p></div>`; return; }
            if (kind === 'image') {
              body.innerHTML = `<div class="media-grid">${media.map((m) => `<button type="button" data-img="${m.message_id}:${m.id}" aria-label="Open photo"><img alt="" data-thumb="${m.message_id}:${m.id}" /></button>`).join('')}</div>`;
              body.querySelectorAll('img[data-thumb]').forEach(async (img) => { const [mid, id] = img.dataset.thumb.split(':'); try { img.src = await mediaUrl(mid, id, 'thumb'); } catch { /* blank tile */ } });
            } else {
              body.innerHTML = media.map((m) => `<button type="button" class="sheet-action" data-file="${m.message_id}:${m.id}"><span class="file-card-icon">${kind === 'voice_note' ? I.mic : I.file}</span><span>${esc(m.file_name || (kind === 'voice_note' ? 'Voice message' : 'File'))}<small>${fmtBytes(m.file_size)} · ${esc(fmtDay(m.message_created_at))}</small></span></button>`).join('');
            }
          } catch (err) { body.innerHTML = `<div class="chat-list-empty"><p>${esc(err.message)}</p></div>`; }
        };
        el.querySelectorAll('.sheet-tab').forEach((t) => t.addEventListener('click', () => load(t.dataset.kind)));
        el.addEventListener('click', (e) => {
          const img = e.target.closest('[data-img]'); const file = e.target.closest('[data-file]');
          if (img) { const [mid, id] = img.dataset.img.split(':'); closeSheet(); setTimeout(() => openLightboxById(mid, id), 0); }
          if (file) { const [mid, id] = file.dataset.file.split(':'); downloadMedia(mid, id); }
        });
        load('image');
      },
      actions: [],
    });
    return sheet;
  }
  async function openLightboxById(messageId, mediaId) {
    if (!S.msgs.find((m) => m.id === messageId)) S.msgs.push({ id: messageId, media: [], created_at: new Date(0).toISOString(), _ghost: true });
    openLightbox(messageId, mediaId);
  }

  // ================================================================ REALTIME + FALLBACK POLLING
  async function catchUp() {
    if (!S.activeId || S.hasNewer) return;
    const lastReal = [...S.msgs].reverse().find((m) => !m._status && !m._ghost);
    try {
      const qs = lastReal ? `?afterMessageId=${encodeURIComponent(lastReal.id)}&limit=100` : '?limit=40';
      const { messages } = await api.messages(S.activeId, qs);
      messages.forEach((m) => ingestIncoming(S.activeId, m, { silent: true }));
    } catch { /* next tick */ }
  }

  function ingestIncoming(conversationId, message, { silent = false } = {}) {
    if (conversationId !== S.activeId) return;
    // Our own send echoing back (same clientMessageId) or a repeat of something already shown.
    const pending = message.client_message_id && S.msgs.find((m) => m._status && m.client_message_id === message.client_message_id);
    if (pending) { swapPending(pending, message); return; }
    if (S.msgs.find((m) => m.id === message.id)) return;
    if (S.hasNewer) { if (!silent) { S.unseenBelow += 1; updateJump(); } return; }
    const wasNear = isNearBottom();
    S.msgs.push(message); appendBubble(message, !silent);
    if (message.sender_id !== me()) {
      if (wasNear && !document.hidden) markReadIfVisible();
      else { S.unseenBelow += 1; updateJump(); }
    }
  }

  function wireRealtime() {
    if (typeof Realtime === 'undefined') return;
    Realtime.on('message.new', ({ conversationId, message }) => {
      const active = conversationId === S.activeId;
      bumpConversation(conversationId, message, { fromMe: message.sender_id === me(), active: active && !document.hidden });
      if (active) ingestIncoming(conversationId, message);
    });
    Realtime.on('message.updated', ({ conversationId, message }) => { if (conversationId === S.activeId) applyServerMessage(message); });
    Realtime.on('message.deleted', ({ conversationId, message }) => {
      if (conversationId === S.activeId) applyServerMessage(message);
      const c = S.convs.get(conversationId); if (c && c.last_message_created_at === message.created_at) { c.last_message_preview = 'This message was deleted'; renderList(); }
    });
    Realtime.on('message.hidden', ({ conversationId, messageId }) => { if (conversationId === S.activeId) removeMessage(messageId); });
    Realtime.on('message.pinned', ({ conversationId, messageId, pinned }) => {
      if (conversationId !== S.activeId) return;
      const m = findMsg(messageId); if (m) { m.is_pinned = pinned; replaceBubble(messageId, m); }
      reloadPins();
    });
    Realtime.on('conversation.read', ({ conversationId, userId, readAt }) => {
      if (userId === me()) { const c = S.convs.get(conversationId); if (c) { c.unread_count = 0; renderList(); } return; }
      if (conversationId === S.activeId && S.detail) { S.detail.other_last_read_at = readAt; refreshTicks(); }
    });
    // The first 'connected' follows the initial load by moments; only a reconnect needs catching up.
    let firstConnect = true;
    Realtime.on('connected', () => { if (firstConnect) { firstConnect = false; return; } loadConversations(true); catchUp(); refreshDetail(); });
  }

  function startFallbackPolling() {
    // Fast polling only while the realtime stream is down; a slow safety net otherwise.
    const tick = (fast, slow, fn) => { let last = 0; return setInterval(() => { const live = typeof Realtime !== 'undefined' && Realtime.isConnected(); if (document.hidden) return; if (Date.now() - last >= (live ? slow : fast)) { last = Date.now(); fn(); } }, 1000); };
    pollTimers.push(tick(12000, 60000, () => loadConversations(true)));
    pollTimers.push(tick(5000, 30000, () => { catchUp(); }));
    pollTimers.push(setInterval(() => { if (S.activeId && !document.hidden) refreshDetail(); }, 60000)); // presence
    window.addEventListener('online', () => {
      loadConversations(true); catchUp();
      S.msgs.filter((m) => m._status === 'failed').forEach((m) => deliver(m)); // failed sends are idempotent: safe to retry
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { catchUp(); markReadIfVisible(); } });
  }

  let readTimer = null;
  function markReadIfVisible() {
    clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      if (!S.activeId || document.hidden || S.hasNewer || !isNearBottom()) return;
      const c = S.convs.get(S.activeId);
      const unread = (c && c.unread_count > 0) || S.unseenBelow > 0 || S.msgs.some((m) => m.sender_id !== me() && !m._status && new Date(m.created_at) > new Date((c && c.last_read_at) || 0));
      if (!unread && !(c && c.unread_count)) return;
      try { await api.read(S.activeId); if (c) { c.unread_count = 0; c.last_read_at = new Date().toISOString(); renderList(); } S.unseenBelow = 0; updateJump(); } catch { /* best effort */ }
    }, 200);
  }

  // ================================================================ KEYBOARD / VIEWPORT
  // Keeps the composer above the on-screen keyboard. Android's WebView resizes
  // natively (so 100dvh already tracks it); mobile browsers that only resize
  // the *visual* viewport are covered by reading visualViewport here.
  function syncViewport() {
    const vv = window.visualViewport;
    const h = vv ? Math.round(vv.height) : window.innerHeight;
    if (els.panel) {
      els.panel.style.setProperty('--chat-vh', `${h}px`);
      if (!isDesktop() && vv) els.panel.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : '';
    }
    if (isNearBottom()) scrollToBottom();
  }

  // ================================================================ WIRING
  function wireThreadShell() {
    els.back.addEventListener('click', () => closeConversation());
    els.peer.addEventListener('click', () => { if (S.detail && S.detail.other.role !== 'hirer') window.location.href = `worker-profile.html?id=${encodeURIComponent(S.detail.other.user_id)}`; });
    $('#chat-audio-call').addEventListener('click', () => startCall('audio'));
    $('#chat-video-call').addEventListener('click', () => startCall('video'));
    $('#chat-more').addEventListener('click', openChatMenu);
    $('#chat-search-close').addEventListener('click', () => closeSearch());
    els.searchInput.addEventListener('input', onSearchInput);
    els.searchResults.addEventListener('click', (e) => { const b = e.target.closest('[data-hit]'); if (b) { const id = b.dataset.hit; closeSearch(); jumpTo(id); } });
    els.jump.addEventListener('click', jumpLatest);
    els.form.addEventListener('submit', (e) => { if (S.recorder && S.recorder.state === 'preview') { e.preventDefault(); sendRecording(); return; } submitComposer(e); });
    els.messages.addEventListener('scroll', onScroll, { passive: true });
    // If the reader is at the bottom and the message area changes size (the pinned
    // strip appears, the keyboard opens, the composer grows to several lines), stay
    // at the bottom instead of leaving the newest message half hidden. Someone who
    // scrolled up to read history is never moved.
    S.stick = true;
    if (typeof ResizeObserver !== 'undefined') {
      if (S.resizeObserver) S.resizeObserver.disconnect();
      S.resizeObserver = new ResizeObserver(() => { if (S.stick && !S.hasNewer && !S.sheet && els.messages) scrollToBottom(); });
      S.resizeObserver.observe(els.messages);
    }
    // Images finish loading after the first layout; if the reader is at the bottom, keep them there.
    els.messages.addEventListener('load', () => { if (S.stick && !S.hasNewer && !S.sheet) scrollToBottom(); }, true);
    wireLongPress();

    els.messages.addEventListener('click', (e) => {
      const retry = e.target.closest('[data-retry]'); if (retry) { retrySend(retry.dataset.retry); return; }
      const discard = e.target.closest('[data-discard]'); if (discard) { discardPending(discard.dataset.discard); return; }
      const go = e.target.closest('[data-goto]'); if (go) { jumpTo(go.dataset.goto); return; }
      const bubble = e.target.closest('[data-message-id]');
      const menu = e.target.closest('[data-bubble-menu]'); if (menu && bubble) { const m = findMsg(bubble.dataset.messageId); if (m) openMessageActions(bubble, m); return; }
      const img = e.target.closest('[data-open-image]'); if (img && bubble && !bubble.dataset.messageId.startsWith('tmp-')) { openLightbox(bubble.dataset.messageId, img.dataset.openImage); return; }
      if (img && bubble) { const m = findMsg(bubble.dataset.messageId); const media = m && m.media.find((x) => x.id === img.dataset.openImage); if (media && media._localUrl) { /* still uploading: nothing to open yet */ } return; }
      const vt = e.target.closest('[data-voice-toggle]'); if (vt && bubble) { toggleVoice(bubble.dataset.messageId, vt.dataset.voiceToggle); return; }
      const seek = e.target.closest('[data-voice-seek]'); if (seek && bubble) { seekVoice(seek.dataset.voiceSeek, e, seek); return; }
      const dl = e.target.closest('[data-download]'); if (dl && bubble) downloadMedia(bubble.dataset.messageId, dl.dataset.download);
    });

    $('#file-camera').addEventListener('change', (e) => { stageFiles(e.target.files, 'image'); e.target.value = ''; });
    $('#file-photos').addEventListener('change', (e) => { stageFiles(e.target.files, 'image'); e.target.value = ''; });
    $('#file-docs').addEventListener('change', (e) => { stageFiles(e.target.files, 'document'); e.target.value = ''; });

    renderComposer();
  }

  async function startCall(type) {
    const id = S.activeId;
    try {
      const { call } = await API.post(`/messaging/conversations/${id}/calls`, { callType: type });
      window.location.href = `call-room.html?type=call&id=${call.id}`;
    } catch (err) { toast('error', err.message); }
  }

  function wireList() {
    els.list.addEventListener('click', (e) => { const item = e.target.closest('.conversation-item'); if (item) openConversation(item.dataset.conversationId); });
    els.list.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const item = e.target.closest('.conversation-item'); if (item) { e.preventDefault(); openConversation(item.dataset.conversationId); } } });
    els.filterInput.addEventListener('input', () => { S.filter = els.filterInput.value; renderList(); });
  }

  // ================================================================ INIT
  async function init(user) {
    S.user = user;
    els.panel = document.getElementById('thread-panel');
    els.listPane = document.getElementById('conversation-list');
    els.listPane.innerHTML = `<div class="chat-list-head"><input type="search" id="chat-filter" placeholder="Search conversations" aria-label="Search conversations" autocomplete="off" /></div><div class="chat-list-items" id="conversation-items" aria-label="Conversations"><div class="skeleton" style="height:60px;margin:12px;"></div><div class="skeleton" style="height:60px;margin:12px;"></div></div>`;
    els.list = document.getElementById('conversation-items');
    els.filterInput = document.getElementById('chat-filter');
    els.panel.innerHTML = placeholderHtml();
    wireList(); wireRealtime(); startFallbackPolling();

    if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
    window.addEventListener('resize', syncViewport);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (S.lightbox) closeLightbox(); else if (S.sheet) closeSheet(); else if (els.search && !els.search.hidden) closeSearch(); else if (S.reply || S.edit) cancelContext();
    });
    window.addEventListener('beforeunload', () => { stopAudio(); pollTimers.forEach(clearInterval); });

    if (typeof PullToRefresh !== 'undefined') {
      PullToRefresh.init({ enabled: () => !S.activeId, onRefresh: () => loadConversations(false) });
    }

    await loadConversations();
    const wanted = new URLSearchParams(location.search).get('conversation');
    if (wanted) {
      if (!S.convs.has(wanted)) await loadConversations(true);
      openConversation(wanted);
    }
  }

  return { init, openConversation };
})();

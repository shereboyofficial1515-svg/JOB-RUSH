/**
 * JOB RUSH — app home screen (pages/dashboard.html).
 * One loader for every role: a worker sees the job-seeking side, a hirer
 * the hiring side, and a dual-role ('both') account sees both. Every
 * number and row comes from the endpoints the dashboard has always used
 * (/applications/me, /interviews/upcoming, /wallet, /profiles/worker/me,
 * /jobs/mine, /contracts); nothing is estimated or filled in. A request
 * that fails shows a dash or an error, never a made-up zero.
 */
const AppHome = (function () {
  const icon = (name) => (typeof Icons !== 'undefined' && Icons[name]) || '';

  const APPLICATION_STATUS = {
    applied: ['Applied', ''], invited: ['Invited', 'warn'], shortlisted: ['Shortlisted', 'warn'],
    accepted: ['Accepted', 'on'], hired: ['Hired', 'on'], declined: ['Declined', 'off'],
    rejected: ['Not selected', 'off'], withdrawn: ['Withdrawn', 'off'],
  };
  const JOB_STATUS = {
    draft: ['Draft', ''], open: ['Open', 'on'], closed: ['Closed', 'off'], filled: ['Filled', 'on'],
    cancelled: ['Cancelled', 'off'], expired: ['Expired', 'off'],
  };
  const INTERVIEW_STATUS = {
    pending: ['Awaiting reply', 'warn'], accepted: ['Confirmed', 'on'], scheduled: ['Confirmed', 'on'],
    reschedule_requested: ['Reschedule requested', 'warn'],
  };
  const INTERVIEW_TYPE = { video: 'Video', audio: 'Audio', text: 'Chat', in_person: 'In-person' };

  function shortDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function dateTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function pill(map, status) {
    const [label, tone] = map[status] || [String(status || '').replace(/_/g, ' '), ''];
    return `<span class="status-pill${tone ? ` status-pill--${tone}` : ''}">${esc(label)}</span>`;
  }

  function statCard(label, value, href) {
    return `<a class="card stat-card" href="${href}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></a>`;
  }

  function row({ href, iconName, title, desc, trailing }) {
    return `<a class="list-row" href="${href}">
      <span class="list-row-icon">${icon(iconName)}</span>
      <span class="list-row-text"><span class="list-row-title">${title}</span>${desc ? `<span class="list-row-desc">${desc}</span>` : ''}</span>
      <span class="list-row-trailing">${trailing || ''}</span>
      <span class="list-row-chevron">${icon('chevronRight')}</span>
    </a>`;
  }

  // rows === null means the request failed: say so, never show it as empty.
  function panel({ id, title, href, linkLabel, rows, empty, failed }) {
    let body;
    if (rows === null) {
      body = `<div class="home-empty home-empty--error" role="status"><p>${failed}</p><button type="button" class="btn btn-secondary btn-sm" data-home-retry>Try again</button></div>`;
    } else if (rows.length) {
      body = `<div class="list-group">${rows.join('')}</div>`;
    } else {
      body = `<div class="home-empty"><p>${empty.text}</p>${empty.action ? `<a class="btn btn-secondary btn-sm" href="${empty.action.href}">${empty.action.label}</a>` : ''}</div>`;
    }
    return `<section class="home-panel" aria-labelledby="${id}-title">
      <div class="home-panel-head">
        <h2 class="home-panel-title" id="${id}-title">${title}</h2>
        ${rows && rows.length ? `<a class="home-panel-link" href="${href}">${linkLabel}</a>` : ''}
      </div>
      ${body}
    </section>`;
  }

  function applicationsPanel(applications) {
    return panel({
      id: 'panel-applications', title: 'Your applications', href: 'applications.html', linkLabel: 'See all',
      rows: applications && applications.slice(0, 4).map((a) => row({
        href: a.job_id ? `job-detail.html?id=${encodeURIComponent(a.job_id)}` : 'applications.html',
        iconName: 'briefcase',
        title: esc(a.job_title || 'Job'),
        desc: [a.hirer_display_name && esc(a.hirer_display_name), a.created_at && `Applied ${shortDate(a.created_at)}`].filter(Boolean).join(' · '),
        trailing: pill(APPLICATION_STATUS, a.status),
      })),
      empty: { text: "You haven't applied for any jobs yet.", action: { href: 'jobs.html', label: 'Find work' } },
      failed: "We couldn't load your applications.",
    });
  }

  function jobsPanel(jobs) {
    return panel({
      id: 'panel-jobs', title: 'Your job posts', href: 'my-jobs.html', linkLabel: 'Manage',
      rows: jobs && jobs.slice(0, 4).map((j) => row({
        href: `applicants.html?jobId=${encodeURIComponent(j.id)}`,
        iconName: 'document',
        title: esc(j.title),
        desc: j.created_at ? `Posted ${shortDate(j.created_at)} · View applicants` : 'View applicants',
        trailing: pill(JOB_STATUS, j.status),
      })),
      empty: { text: "You haven't posted a job yet.", action: { href: 'my-jobs.html?new=1', label: 'Post a job' } },
      failed: "We couldn't load your job posts.",
    });
  }

  function interviewsPanel(interviews) {
    return panel({
      id: 'panel-interviews', title: 'Upcoming interviews', href: 'interviews.html', linkLabel: 'See all',
      rows: interviews && interviews.slice(0, 3).map((i) => row({
        href: 'interviews.html',
        iconName: 'calendar',
        title: `${INTERVIEW_TYPE[i.interview_type] || 'Interview'} interview`,
        desc: dateTime(i.scheduled_start_at),
        trailing: pill(INTERVIEW_STATUS, i.status),
      })),
      empty: { text: 'No interviews scheduled.' },
      failed: "We couldn't load your interviews.",
    });
  }

  /** A professional's verification and profile-completeness notices, straight from their profile. */
  function workerNotices(profile) {
    if (!profile) return '';
    const notices = [];
    const v = profile.verification_status;
    if (v === 'submitted' || v === 'under_review') {
      notices.push({ tone: 'info', iconName: 'clock', title: 'Verification under review', text: "We'll let you know once it's checked.", cta: 'View' });
    } else if (v === 'not_submitted' || v === 'rejected' || v === 'resubmission_required') {
      const fresh = v === 'not_submitted';
      notices.push({
        tone: 'warn', iconName: 'verified',
        title: fresh ? 'Get verified' : 'Verification needs attention',
        text: fresh ? 'Hirers trust verified professionals more.' : 'Check your details and submit again.',
        cta: fresh ? 'Start' : 'Review',
      });
    }
    const pct = Number(profile.profile_completion_percent);
    if (Number.isFinite(pct) && pct < 100) {
      notices.push({ tone: 'info', iconName: 'user', title: `Your profile is ${pct}% complete`, text: 'Complete profiles rank higher in search.', cta: 'Complete', progress: Math.max(0, Math.min(100, pct)) });
    }
    return notices.map((n) => `<a class="home-notice home-notice--${n.tone}" href="profile-settings.html?tab=profile">
      <span class="home-notice-icon">${icon(n.iconName)}</span>
      <span class="home-notice-text">
        <strong>${n.title}</strong><span>${n.text}</span>
        ${n.progress != null ? `<span class="home-progress" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n.progress}"><span style="width:${n.progress}%"></span></span>` : ''}
      </span>
      <span class="home-notice-cta">${n.cta}</span>
    </a>`).join('');
  }

  /**
   * "Needs your attention": things the user has to act on, worked out only
   * from data this screen already loads. Applications awaiting review and
   * milestones awaiting funding/approval are NOT here: /jobs/mine and
   * /contracts don't return those counts, and fetching every job's
   * applications or every contract's milestones on each home load would be
   * one request per item.
   */
  function attentionItems(user, { jobs, interviews, contracts }) {
    const items = [];
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const today = new Date().toDateString();
    if (interviews) {
      const invites = interviews.filter((i) => i.status === 'pending' && i.worker_user_id === user.id);
      if (invites.length) items.push({ iconName: 'calendar', title: `${plural(invites.length, 'interview invitation', 'interview invitations')} awaiting your reply`, href: 'interviews.html' });
      const reschedules = interviews.filter((i) => i.status === 'reschedule_requested' && i.hirer_user_id === user.id);
      if (reschedules.length) items.push({ iconName: 'clock', title: `${plural(reschedules.length, 'candidate has', 'candidates have')} asked to reschedule`, href: 'interviews.html' });
      const todays = interviews.filter((i) => ['accepted', 'scheduled'].includes(i.status) && new Date(i.scheduled_start_at).toDateString() === today);
      todays.forEach((i) => items.push({
        iconName: 'calendar',
        title: `${INTERVIEW_TYPE[i.interview_type] || ''} interview today at ${new Date(i.scheduled_start_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`.trim(),
        href: 'interviews.html',
      }));
    }
    if (jobs) {
      const drafts = jobs.filter((j) => j.status === 'draft');
      if (drafts.length) items.push({ iconName: 'document', title: `${plural(drafts.length, 'draft job', 'draft jobs')} not published yet`, desc: 'Professionals can only apply once a job is open.', href: 'my-jobs.html' });
    }
    if (contracts) {
      const disputed = contracts.filter((c) => c.status === 'disputed');
      if (disputed.length) items.push({ iconName: 'shield', title: `${plural(disputed.length, 'contract is', 'contracts are')} in dispute`, href: 'contracts.html' });
    }
    return items;
  }

  function attentionHtml(items) {
    if (!items.length) return '';
    return `<section class="home-attention" aria-labelledby="home-attention-title">
      <h2 class="home-panel-title" id="home-attention-title">Needs your attention</h2>
      <div class="list-group">${items.map((it) => row({ href: it.href, iconName: it.iconName, title: esc(it.title), desc: it.desc ? esc(it.desc) : '', trailing: '' })).join('')}</div>
    </section>`;
  }

  function quickActions(isWorker, isHirer) {
    const tiles = [];
    if (isHirer) tiles.push({ label: 'Post a job', href: 'my-jobs.html?new=1', iconName: 'plus', primary: true });
    if (isWorker) tiles.push({ label: 'Find work', href: 'jobs.html', iconName: 'search', primary: !isHirer });
    if (isHirer) tiles.push({ label: 'Find talent', href: 'search.html', iconName: 'users' });
    if (isWorker && !isHirer) tiles.push({ label: 'My portfolio', href: 'portfolio.html', iconName: 'portfolio' });
    if (isHirer && !isWorker) tiles.push({ label: 'Applicants', href: 'applicants.html', iconName: 'document' });
    tiles.push({ label: 'Messages', href: 'messages.html', iconName: 'message', badge: true });
    return tiles.map((t) => `<a class="home-action${t.primary ? ' home-action--primary' : ''}" href="${t.href}" data-label="${t.label}">
      <span class="home-action-icon">${icon(t.iconName)}${t.badge ? '<span class="home-action-badge" data-unread-messages hidden></span>' : ''}</span>
      <span class="home-action-label">${t.label}</span>
    </a>`).join('');
  }

  function setUnreadMessages(count) {
    const badge = document.querySelector('[data-unread-messages]');
    if (!badge) return;
    const n = Math.max(0, Number(count) || 0);
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = n === 0;
    const link = badge.closest('a');
    link.setAttribute('aria-label', n ? `${link.dataset.label}, ${n} unread` : link.dataset.label);
  }

  // The count comes from SidebarNav's existing unread poll (one request
  // for the whole page), not a second request of our own.
  document.addEventListener('jr:nav-unread', (e) => { if (e.detail.name === 'messages') setUnreadMessages(e.detail.count); });

  function skeletons(panelCount) {
    const stat = '<div class="card stat-card"><div class="skeleton" style="height:14px;width:60%;"></div><div class="skeleton" style="height:24px;width:40%;margin-top:10px;"></div></div>';
    const line = '<div class="list-row is-static"><div class="skeleton" style="height:16px;width:70%;"></div></div>';
    const section = `<section class="home-panel"><div class="skeleton" style="height:18px;width:40%;margin-bottom:12px;"></div><div class="list-group">${line.repeat(3)}</div></section>`;
    return { stats: stat.repeat(4), panels: section.repeat(panelCount) };
  }

  /**
   * @param {{ role: string, fullName: string }} user
   * @param {{ strict?: boolean }} opts strict: a failed request fails the
   *   whole load (pull-to-refresh keeps the current numbers) instead of
   *   falling back to an empty list.
   * @returns {Promise<boolean>} whether everything loaded
   */
  async function load(user, { strict = false } = {}) {
    const soft = (promise, fallback) => (strict ? promise : promise.catch(() => fallback));
    const isWorker = user.role === 'worker' || user.role === 'both';
    const isHirer = user.role === 'hirer' || user.role === 'both';

    document.getElementById('welcome-heading').textContent = `Welcome back, ${user.fullName.split(' ')[0]}`;
    document.getElementById('welcome-sub').textContent = isWorker && isHirer
      ? 'Your work and your hiring, in one place.'
      : isHirer ? 'Here’s where your hiring stands.' : 'Here’s where your job search stands.';

    const actions = document.getElementById('home-actions');
    if (!actions.childElementCount) actions.innerHTML = quickActions(isWorker, isHirer);

    const statGrid = document.getElementById('stat-grid');
    const panels = document.getElementById('home-panels');
    if (!strict) {
      const s = skeletons(isWorker && isHirer ? 3 : 2);
      statGrid.innerHTML = s.stats;
      panels.innerHTML = s.panels;
    }

    try {
      // On first load a failed request becomes null (shown as "—" or a
      // "couldn't load" message); with strict (pull-to-refresh) it rejects.
      const none = Promise.resolve(undefined);
      const [applications, interviews, wallet, profile, jobs, contracts] = await Promise.all([
        isWorker ? soft(API.get('/applications/me'), null) : none,
        soft(API.get('/interviews/upcoming'), null),
        isWorker ? soft(API.get('/wallet'), null) : none,
        isWorker ? soft(API.get('/profiles/worker/me'), null) : none,
        isHirer ? soft(API.get('/jobs/mine'), null) : none,
        isHirer ? soft(API.get('/contracts'), null) : none,
      ]);
      const list = (result, key) => (result && Array.isArray(result[key]) ? result[key] : null);
      const count = (items, keep = () => true) => (items ? items.filter(keep).length : '—');
      const myApplications = list(applications, 'applications');
      const myInterviews = list(interviews, 'interviews');
      const myJobs = list(jobs, 'jobs');
      const myContracts = list(contracts, 'contracts');
      const p = profile ? profile.profile : null;

      const stats = [];
      if (isWorker) {
        stats.push(statCard('Applications', count(myApplications), 'applications.html'));
        const balance = wallet && wallet.wallet ? `₦${Number(wallet.wallet.available_balance).toLocaleString()}` : '—';
        stats.push(statCard('Wallet balance', balance, 'wallet.html'));
      }
      if (isHirer) {
        stats.push(statCard('Open jobs', count(myJobs, (j) => j.status === 'open'), 'my-jobs.html'));
        stats.push(statCard('Active contracts', count(myContracts, (c) => c.status === 'active'), 'contracts.html'));
      }
      stats.push(statCard('Upcoming interviews', count(myInterviews), 'interviews.html'));
      if (isWorker && !isHirer) {
        stats.push(statCard('Profile completion', p ? `${p.profile_completion_percent ?? 0}%` : '—', 'profile-settings.html?tab=profile'));
      }
      statGrid.innerHTML = stats.join('');
      if (typeof Animate !== 'undefined') Animate.stagger(statGrid, { stepMs: 30 });

      if (isWorker) {
        const badges = document.getElementById('topbar-badges');
        badges.innerHTML = '';
        if (p?.verification_status === 'approved') badges.innerHTML += '<span class="badge badge-verified badge-enter">Verified</span>';
        if (p?.is_pro) badges.innerHTML += '<span class="badge badge-pro badge-enter">PRO</span>';
        document.getElementById('home-notices').innerHTML = workerNotices(p);
      }

      document.getElementById('home-attention').innerHTML = attentionHtml(attentionItems(user, { jobs: myJobs, interviews: myInterviews, contracts: myContracts }));

      const html = [];
      if (isHirer) html.push(jobsPanel(myJobs));
      if (isWorker) html.push(applicationsPanel(myApplications));
      html.push(interviewsPanel(myInterviews));
      panels.innerHTML = html.join('');
      panels.querySelectorAll('[data-home-retry]').forEach((btn) => btn.addEventListener('click', () => load(user)));
      const anyFailed = [isWorker && myApplications, myInterviews, isHirer && myJobs].some((x) => x === null);
      return !anyFailed;
    } catch {
      if (!strict) {
        statGrid.innerHTML = '';
        panels.innerHTML = '<div class="home-empty home-empty--error"><p>We couldn’t load your home screen. Check your connection and try again.</p><button type="button" class="btn btn-secondary btn-sm" data-home-retry>Try again</button></div>';
        panels.querySelector('[data-home-retry]').addEventListener('click', () => load(user));
      }
      return false;
    }
  }

  return { load, setUnreadMessages };
})();

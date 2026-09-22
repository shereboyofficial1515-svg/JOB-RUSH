/**
 * JOB RUSH — Post-registration onboarding + referral introduction.
 * Two short modals shown exactly once, right after a brand-new
 * account's first real dashboard visit: "how Job Rush works" (a few
 * steps), then "the referral program" — never both at once, never
 * repeated on later visits. State lives in user_settings
 * (onboarding_status / referral_intro_seen), the same settings row
 * every other preference already uses — not a new table.
 *
 * Called once from dashboard.html's init, since dashboard.html is the
 * one page every signup path (password+OTP+login, or OAuth) always
 * lands on first.
 */
const Onboarding = (function () {
  const WELCOME_STEPS = [
    {
      title: 'Welcome to Job Rush',
      body: `<img src="${ASSETS.heroProfessionals}" alt="Nigerian professionals at work" loading="lazy" style="width:100%; max-height:160px; object-fit:cover; object-position:center 30%; border-radius: var(--radius-md, 8px); margin-bottom: var(--space-3);" />
             <p>Job Rush connects people looking for work with people looking for skilled professionals — right here in Nigeria.</p>
             <p class="text-secondary">This will only take a few seconds.</p>`,
    },
    {
      title: 'Your Dashboard',
      body: `<p>Your dashboard is your main control center. From here you can manage your profile, jobs, messages, notifications, and everything else you do on Job Rush.</p>`,
    },
    {
      title: 'Build Your Profile',
      body: `<p>Complete your professional profile so people can understand your skills, experience, services, and work.</p>`,
    },
    {
      title: 'Post Your Work',
      body: `<p>Showcase what you do through your portfolio, services, or job posts — whichever fits how you use Job Rush.</p>`,
    },
    {
      title: 'Find Work / Find Talent',
      body: `<p>Use search and discovery to find opportunities if you're looking for work, or find the right professional if you're hiring.</p>`,
    },
    {
      title: 'Message &amp; Call',
      body: `<p>Talk directly with other users through messaging, and audio or video calls, right inside Job Rush.</p>`,
    },
    {
      title: "You're Ready",
      body: `<p>Start exploring Job Rush and build your professional presence.</p>`,
    },
  ];

  function renderProgressDots(stepIndex, total) {
    return `<div class="onboarding-dots">${Array.from({ length: total })
      .map((_, i) => `<span class="onboarding-dot${i === stepIndex ? ' is-active' : ''}"></span>`)
      .join('')}</div>`;
  }

  function showWelcomeModal(onDone) {
    let stepIndex = 0;

    function renderStep(modalEl) {
      const step = WELCOME_STEPS[stepIndex];
      const isFirst = stepIndex === 0;
      const isLast = stepIndex === WELCOME_STEPS.length - 1;

      modalEl.querySelector('#modal-title').textContent = step.title;
      const body = modalEl.querySelector('.modal-body');
      body.innerHTML = `
        <div class="onboarding-step">${step.body}</div>
        ${renderProgressDots(stepIndex, WELCOME_STEPS.length)}
        <div class="onboarding-actions">
          ${isFirst ? `<button type="button" class="btn btn-ghost" data-action="onboarding-skip">Skip</button>` : `<button type="button" class="btn btn-ghost" data-action="onboarding-back">Back</button>`}
          ${isLast ? `<button type="button" class="btn btn-primary" data-action="onboarding-finish">Get Started</button>` : `<button type="button" class="btn btn-primary" data-action="onboarding-next">Next</button>`}
        </div>
      `;

      body.querySelector('[data-action="onboarding-next"]')?.addEventListener('click', () => {
        stepIndex = Math.min(stepIndex + 1, WELCOME_STEPS.length - 1);
        renderStep(modalEl);
      });
      body.querySelector('[data-action="onboarding-back"]')?.addEventListener('click', () => {
        stepIndex = Math.max(stepIndex - 1, 0);
        renderStep(modalEl);
      });
      body.querySelector('[data-action="onboarding-skip"]')?.addEventListener('click', () => {
        Modal.close();
      });
      body.querySelector('[data-action="onboarding-finish"]')?.addEventListener('click', () => {
        Modal.close();
      });
    }

    let finished = false;
    Modal.open({
      title: WELCOME_STEPS[0].title,
      bodyHtml: '<div class="onboarding-step"></div>',
      onMount: (modalEl) => {
        modalEl.classList.add('onboarding-modal');
        renderStep(modalEl);
      },
      onClose: () => {
        if (finished) return;
        finished = true;
        const completed = stepIndex === WELCOME_STEPS.length - 1;
        onDone(completed ? 'completed' : 'skipped');
      },
    });
  }

  function showReferralModal({ referralLink, onDone }) {
    let finished = false;
    Modal.open({
      title: 'Earn ₦15,000 Through Referrals',
      bodyHtml: `
        <div>
          <p>Invite people to join Job Rush using your unique referral link. When <strong>12 people you referred</strong> complete the required Job Rush activity and share their experience with a rating, you become eligible for a <strong>₦15,000</strong> referral reward.</p>

          <ol class="referral-steps">
            <li>Generate your referral link (already done — it's in your dashboard).</li>
            <li>Share your link with people you know.</li>
            <li>They create their Job Rush account through your link.</li>
            <li>Their account is permanently linked to your referral.</li>
            <li>They complete a real Job Rush activity (post a job, publish a portfolio item or service, or complete their profile).</li>
            <li>They share their experience with a rating.</li>
            <li>Their referral becomes <strong>qualified</strong>.</li>
            <li>Once you reach 12 qualified referrals...</li>
            <li>...your ₦15,000 reward becomes eligible for admin review.</li>
            <li>After review, an approved reward is paid into your Job Rush wallet.</li>
          </ol>

          <p class="text-secondary text-sm"><strong>Important:</strong> registration alone does not count as a qualified referral — the referred person has to actually use Job Rush and share their experience first.</p>

          <div class="onboarding-actions onboarding-actions-referral">
            <button type="button" class="btn btn-ghost" data-action="close-modal">Maybe Later</button>
            <a href="documentation.html#referral-program" class="btn btn-secondary" data-action="referral-guide">View Referral Guide</a>
            <a href="referral.html" class="btn btn-primary" data-action="referral-start">Start Referring</a>
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.classList.add('onboarding-modal', 'referral-intro-modal');
        // "View Referral Guide" and "Start Referring" are real links
        // that navigate the page away immediately — that unload never
        // runs Modal's own close()/onClose, so this state would
        // otherwise never get marked "seen" for anyone who takes
        // either of those two actions instead of dismissing normally.
        modalEl.querySelector('[data-action="referral-guide"]')?.addEventListener('click', markSeenOnce);
        modalEl.querySelector('[data-action="referral-start"]')?.addEventListener('click', markSeenOnce);
      },
      onClose: markSeenOnce,
    });

    function markSeenOnce() {
      if (finished) return;
      finished = true;
      onDone();
    }
  }

  /**
   * The only entry point. Reads the user's onboarding state from
   * /api/settings (already fetched app-wide by other pages, but this
   * is the one place that actually acts on it) and shows whichever
   * modal, if any, hasn't been seen yet — welcome first, referral
   * intro second, never both at once.
   */
  async function maybeShow() {
    if (typeof API === 'undefined' || typeof Modal === 'undefined') return;
    let settings;
    try {
      ({ settings } = await API.get('/settings'));
    } catch {
      return; // not logged in, or offline — nothing to show
    }

    const runReferralStep = () => {
      if (settings.referral_intro_seen) return;
      API.get('/referrals/me')
        .then(({ referralLink }) => {
          showReferralModal({
            referralLink,
            onDone: () => API.patch('/settings', { referralIntroSeen: true }).catch(() => {}),
          });
        })
        .catch(() => {});
    };

    if (settings.onboarding_status === 'not_started') {
      showWelcomeModal((finalStatus) => {
        API.patch('/settings', { onboardingStatus: finalStatus }).catch(() => {});
        runReferralStep();
      });
    } else {
      runReferralStep();
    }
  }

  return { maybeShow };
})();

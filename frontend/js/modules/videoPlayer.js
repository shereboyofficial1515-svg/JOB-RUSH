/**
 * JOB RUSH — Custom video player.
 * Work-sample videos never use the browser's native <video controls>
 * chrome (spec requirement) — this renders our own play/pause, seek
 * bar, time, volume/mute, and fullscreen controls over a bare <video>
 * element, plus loading and error states for a slow network or a
 * broken/unsupported source.
 */
const VideoPlayer = (function () {
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function iconSvg(name) {
    const icons = {
      play: '<path d="M8 5v14l11-7z"/>',
      pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
      volume: '<path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 8.5a4 4 0 010 7" fill="none" stroke="currentColor" stroke-width="2"/>',
      muted: '<path d="M3 10v4h4l5 5V5L7 10H3z"/><line x1="16" y1="9" x2="21" y2="15" stroke="currentColor" stroke-width="2"/><line x1="21" y1="9" x2="16" y2="15" stroke="currentColor" stroke-width="2"/>',
      fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      exitFullscreen: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">${icons[name]}</svg>`;
  }

  /**
   * @param {HTMLElement} container
   * @param {{ url: string, poster?: string }} opts
   */
  function mount(container, { url, poster } = {}) {
    container.classList.add('video-player');
    container.innerHTML = `
      <video class="video-player-el" ${poster ? `poster="${poster}"` : ''} playsinline preload="metadata">
        <source src="${url}" />
      </video>
      <div class="video-player-overlay" data-role="loading">
        <div class="video-player-spinner"></div>
      </div>
      <div class="video-player-overlay video-player-error" data-role="error" hidden>
        <p>This video couldn't be played.</p>
      </div>
      <button class="video-player-big-play" data-role="big-play" aria-label="Play video">
        ${iconSvg('play')}
      </button>
      <div class="video-player-controls" data-role="controls">
        <button class="video-player-btn" data-role="play-toggle" aria-label="Play">${iconSvg('play')}</button>
        <span class="video-player-time" data-role="time">0:00 / 0:00</span>
        <input type="range" class="video-player-seek" data-role="seek" min="0" max="100" value="0" step="0.1" aria-label="Seek" />
        <button class="video-player-btn" data-role="mute-toggle" aria-label="Mute">${iconSvg('volume')}</button>
        <input type="range" class="video-player-volume" data-role="volume" min="0" max="1" value="1" step="0.05" aria-label="Volume" />
        <button class="video-player-btn" data-role="fullscreen-toggle" aria-label="Fullscreen">${iconSvg('fullscreen')}</button>
      </div>
    `;

    const video = container.querySelector('.video-player-el');
    const loadingOverlay = container.querySelector('[data-role="loading"]');
    const errorOverlay = container.querySelector('[data-role="error"]');
    const bigPlay = container.querySelector('[data-role="big-play"]');
    const controls = container.querySelector('[data-role="controls"]');
    const playToggle = container.querySelector('[data-role="play-toggle"]');
    const muteToggle = container.querySelector('[data-role="mute-toggle"]');
    const fullscreenToggle = container.querySelector('[data-role="fullscreen-toggle"]');
    const seek = container.querySelector('[data-role="seek"]');
    const volume = container.querySelector('[data-role="volume"]');
    const timeLabel = container.querySelector('[data-role="time"]');

    let seeking = false;

    function setLoading(isLoading) {
      loadingOverlay.hidden = !isLoading;
    }

    function setError() {
      setLoading(false);
      errorOverlay.hidden = false;
      controls.hidden = true;
      bigPlay.hidden = true;
    }

    function updatePlayIcon() {
      const icon = video.paused ? 'play' : 'pause';
      playToggle.innerHTML = iconSvg(icon);
      playToggle.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
      bigPlay.hidden = !video.paused;
    }

    function togglePlay() {
      if (video.paused) video.play().catch(() => setError());
      else video.pause();
    }

    playToggle.addEventListener('click', togglePlay);
    bigPlay.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    video.addEventListener('play', updatePlayIcon);
    video.addEventListener('pause', updatePlayIcon);

    video.addEventListener('waiting', () => setLoading(true));
    video.addEventListener('canplay', () => setLoading(false));
    video.addEventListener('loadeddata', () => setLoading(false));
    video.addEventListener('error', setError);

    video.addEventListener('loadedmetadata', () => {
      seek.max = String(video.duration || 0);
      timeLabel.textContent = `${formatTime(0)} / ${formatTime(video.duration)}`;
    });

    video.addEventListener('timeupdate', () => {
      if (seeking) return;
      seek.value = String(video.currentTime);
      timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    });

    seek.addEventListener('input', () => {
      seeking = true;
      timeLabel.textContent = `${formatTime(Number(seek.value))} / ${formatTime(video.duration)}`;
    });
    seek.addEventListener('change', () => {
      video.currentTime = Number(seek.value);
      seeking = false;
    });

    muteToggle.addEventListener('click', () => {
      video.muted = !video.muted;
      muteToggle.innerHTML = iconSvg(video.muted ? 'muted' : 'volume');
      if (!video.muted && video.volume === 0) {
        video.volume = 1;
        volume.value = '1';
      }
    });

    volume.addEventListener('input', () => {
      video.volume = Number(volume.value);
      video.muted = video.volume === 0;
      muteToggle.innerHTML = iconSvg(video.muted ? 'muted' : 'volume');
    });

    fullscreenToggle.addEventListener('click', () => {
      if (document.fullscreenElement === container) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen?.();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const isFullscreen = document.fullscreenElement === container;
      fullscreenToggle.innerHTML = iconSvg(isFullscreen ? 'exitFullscreen' : 'fullscreen');
      fullscreenToggle.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Fullscreen');
    });

    video.load();
    return {
      destroy() {
        container.innerHTML = '';
      },
    };
  }

  return { mount, formatTime };
})();

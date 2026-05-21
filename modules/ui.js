import { state }                                   from './config.js';
import { $ }                                       from './utils.js';

/* ── Global mute ─────────────────────────────────────────────────────── */
const MUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
</svg>`;
const UNMUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
</svg>`;

export function updateMuteBtnUI() {
  const icon = state.globalMuted ? MUTE_SVG : UNMUTE_SVG;
  const tip  = state.globalMuted ? 'Unmute' : 'Mute';
  const gb = $('globalMuteBtn'), rb = $('reelsMuteBtn'), sb = $('sbMuteBtn');
  if (gb) { gb.innerHTML = icon; gb.title = tip; gb.classList.toggle('is-unmuted', !state.globalMuted); }
  if (rb) { rb.innerHTML = icon; rb.title = tip; rb.classList.toggle('is-unmuted', !state.globalMuted); }
  if (sb) {
    sb.innerHTML = icon + `<span>${state.globalMuted ? 'Unmute' : 'Mute'}</span>`;
    sb.classList.toggle('is-unmuted', !state.globalMuted);
  }
}

export function toggleGlobalMute() {
  state.globalMuted = !state.globalMuted;
  document.querySelectorAll('video').forEach(v => { if (!v.paused) v.muted = state.globalMuted; });
  updateMuteBtnUI();
}
window.toggleGlobalMute = toggleGlobalMute;

// Sync all feed per-video mute icons on mutestatechange
document.addEventListener('mutestatechange', updateMuteBtnUI);

/* ── View switching ──────────────────────────────────────────────────── */
export async function switchView(v) {
  state.view = v;
  document.querySelectorAll('video').forEach(x => x.pause());
  document.querySelectorAll('.view').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.nav-btn[data-v]').forEach(x => x.classList.remove('on'));
  document.getElementById(`${v}View`)?.classList.add('on');
  document.querySelector(`.nav-btn[data-v="${v}"]`)?.classList.add('on');

  const isReels = v === 'reels';
  $('appHdr').style.display      = isReels ? 'none' : 'flex';
  $('reelsMuteBtn').style.display = isReels ? 'flex' : 'none';
  updateMuteBtnUI();
  window.scrollTo({ top: 0 });

  if (v === 'home') {
    state.visibleN = 8;
    const { renderFeed } = await import('./feed.js');
    renderFeed();
  }
  if (v === 'reels') {
    const { renderReels } = await import('./reels.js');
    renderReels();
  }
  if (v === 'following') {
    state.visibleN = 8;
    const { renderFollowing } = await import('./feed.js');
    renderFollowing();
  }
  if (v === 'profile') {
    const { renderProfile } = await import('./profile.js');
    renderProfile();
  }
}

/* ── Open media post in reels view ───────────────────────────────────── */
export async function openMediaInReels(postId) {
  const post = state.allPosts.find(p => p.id === postId);
  if (!post) return;
  const inReels = (post.isPublic || post.userId === state.me?.uid) &&
    post.mediaUrl && (post.mediaType?.startsWith('image') || post.mediaType?.startsWith('video'));
  if (inReels) {
    const feedVid = document.querySelector(`.post-media[data-id="${postId}"] video`);
    state.pendingReelTime = feedVid ? feedVid.currentTime : 0;
    state.pendingReelId   = postId;
    switchView('reels');
  } else {
    const { openZoom } = await import('./utils.js');
    openZoom(post.mediaUrl, post.mediaType?.startsWith('video') ? 'video' : 'image');
  }
}

/* ── Nav buttons ─────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-btn[data-v]').forEach(b =>
  b.addEventListener('click', () => switchView(b.dataset.v))
);

/* ── Header / sidebar tabs ───────────────────────────────────────────── */
document.querySelectorAll('.hdr-tab').forEach(b => b.addEventListener('click', async () => {
  document.querySelectorAll('.hdr-tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.sb-tab').forEach(x => x.classList.toggle('on', x.dataset.stab === b.dataset.tab));
  b.classList.add('on');
  state.tab = b.dataset.tab;
  state.visibleN = 8;
  const { renderFeed } = await import('./feed.js');
  renderFeed();
}));

document.querySelectorAll('.sb-tab[data-stab]').forEach(b => b.addEventListener('click', async () => {
  document.querySelectorAll('.sb-tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.hdr-tab').forEach(x => x.classList.toggle('on', x.dataset.tab === b.dataset.stab));
  b.classList.add('on');
  state.tab = b.dataset.stab;
  state.visibleN = 8;
  const { renderFeed } = await import('./feed.js');
  renderFeed();
}));

document.querySelectorAll('.sb-panel-tab[data-stab]').forEach(b => b.addEventListener('click', async () => {
  document.querySelectorAll('.sb-panel-tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.hdr-tab').forEach(x => x.classList.toggle('on', x.dataset.tab === b.dataset.stab));
  b.classList.add('on');
  state.tab = b.dataset.stab;
  state.visibleN = 8;
  const { renderFeed } = await import('./feed.js');
  renderFeed();
}));

/* ── Search ──────────────────────────────────────────────────────────── */
async function _doSearch(val) {
  state.search = val;
  clearTimeout(window._sT);
  window._sT = setTimeout(async () => {
    state.visibleN = 8;
    const { renderFeed, renderFollowing } = await import('./feed.js');
    state.view === 'home' ? renderFeed() : state.view === 'following' && renderFollowing();
  }, 300);
}

const searchInput = $('searchInput');
if (searchInput) searchInput.oninput = e => _doSearch(e.target.value);

const sbPanelInput  = $('sbPanelInput');
const sbSearchPanel = $('sbSearchPanel');
const sbSearchToggle = $('sbSearchToggle');

if (sbSearchToggle && sbSearchPanel) {
  sbSearchToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = sbSearchPanel.classList.toggle('open');
    sbSearchToggle.classList.toggle('on', isOpen);
    if (isOpen && sbPanelInput) setTimeout(() => sbPanelInput.focus(), 60);
  });
  document.addEventListener('click', e => {
    if (!sbSearchPanel.contains(e.target) && e.target !== sbSearchToggle) {
      sbSearchPanel.classList.remove('open');
      sbSearchToggle.classList.remove('on');
    }
  });
}

if (sbPanelInput) {
  sbPanelInput.oninput = e => {
    const hi = $('searchInput');
    if (hi) hi.value = e.target.value;
    _doSearch(e.target.value);
  };
}

/* ── Init mute UI ────────────────────────────────────────────────────── */
updateMuteBtnUI();

/**
 * MRtube v3 — main entry point.
 * All heavy logic lives in ./modules/; this file only bootstraps the app.
 */

import { state }             from './modules/config.js';
import { $ }                 from './modules/utils.js';
import { updateMuteBtnUI }   from './modules/ui.js';
import {
  setRenderCallbacks,
  listenPosts
} from './modules/auth.js';
import { renderFeed, renderFollowing, patchCounts } from './modules/feed.js';
import { renderReels }       from './modules/reels.js';
import { renderProfile }     from './modules/profile.js';
import {
  renderUserProfileModal
} from './modules/profile.js';

/* ── Splash ──────────────────────────────────────────────────────────── */
setTimeout(() => {
  $('splash').classList.add('out');
  setTimeout(() => $('splash').style.display = 'none', 400);
}, 400);

/* ── Wire auth → render callbacks ────────────────────────────────────── */
setRenderCallbacks({
  renderFeed,
  renderFollowing,
  renderReels,
  renderProfile,
  renderUserProfileModal,
  patchCounts,
});

/* ── Lazy-import remaining modules so they self-register event listeners ─ */
import('./modules/upload.js');

/* ── Global mute button ──────────────────────────────────────────────── */
$('globalMuteBtn')?.addEventListener('click', () => window.toggleGlobalMute?.());
$('reelsMuteBtn')?.addEventListener('click',  () => window.toggleGlobalMute?.());
$('sbMuteBtn')?.addEventListener('click',     () => window.toggleGlobalMute?.());

updateMuteBtnUI();

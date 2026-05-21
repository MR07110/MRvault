import { db }                                       from './config.js';
import { state }                                    from './config.js';
import { doc, updateDoc, increment }               from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── In-memory caches ─────────────────────────────────────────────────── */
export const userCache    = new Map();  // uid → { fullName, avatar }
export const cmtCountCache = new Map(); // postId → count

/* ── Persistent viewed-posts tracking ────────────────────────────────── */
export function loadViewedPostsFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem('mrtube_viewed') || '{}');
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    for (const [key, time] of Object.entries(stored)) {
      if (now - time < THIRTY_DAYS) {
        state.viewedPostsByUser ? state.viewedPostsByUser.set(key, time) : null;
        _viewedMap.set(key, time);
      } else {
        cleaned++;
      }
    }
    if (cleaned > 0) _persistViewed();
    console.log(`Loaded ${_viewedMap.size} viewed posts (removed ${cleaned} old entries)`);
  } catch(e) {}
}

// Internal map (mirrored from state for convenience)
const _viewedMap = new Map();

function _persistViewed() {
  try {
    const obj = {};
    for (const [k,v] of _viewedMap.entries()) obj[k] = v;
    localStorage.setItem('mrtube_viewed', JSON.stringify(obj));
  } catch(e) {}
}

export async function trackView(postId, userId) {
  if (!userId || !postId) return false;
  const key = `${userId}_${postId}`;
  if (_viewedMap.has(key)) return false;

  _viewedMap.set(key, Date.now());
  _persistViewed();

  try {
    await updateDoc(doc(db, 'posts', postId), { views: increment(1) });

    // Update feed stats span
    const statsEl = document.querySelector(`.post[data-id="${postId}"] .post-stats span:first-child`);
    if (statsEl) {
      const cur = parseInt(statsEl.textContent) || 0;
      statsEl.textContent = `${cur + 1} views`;
    }
    // Update reel view counter
    const reelViewEl = document.querySelector(`.reel[data-id="${postId}"] .rvc-count`);
    if (reelViewEl) {
      const cur = parseInt(reelViewEl.textContent) || 0;
      reelViewEl.textContent = `${cur + 1}`;
    }
  } catch(e) {}

  return true;
}

export function setupViewObserver() {
  if (state.viewObserver) state.viewObserver.disconnect();

  state.viewObserver = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && state.me) {
        const post = entry.target.closest('.post');
        const reel = entry.target.closest('.reel');
        const element = post || reel;
        if (element && element.dataset.id) {
          await trackView(element.dataset.id, state.me.uid);
        }
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.post, .reel').forEach(el => {
    if (el && el.dataset && el.dataset.id) state.viewObserver.observe(el);
  });
}

// Bootstrap on import
loadViewedPostsFromStorage();
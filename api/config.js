import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createClient }    from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ── Env varlarni serverdan olish (top-level await) ──────────────────── */
let _cfg;
try {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`/api/config → ${res.status}`);
  _cfg = await res.json();
} catch (err) {
  console.error('Konfiguratsiya yuklanmadi:', err);
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;
                height:100dvh;flex-direction:column;gap:12px;
                font-family:sans-serif;color:#f04060;background:#050508">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div style="font-size:14px">Config failed to load. Check Vercel env vars.</div>
    </div>`;
  throw err;
}

const fbApp = initializeApp(_cfg.firebase);

export const auth = getAuth(fbApp);
export const db   = getFirestore(fbApp);
export const sb   = createClient(_cfg.supabase.url, _cfg.supabase.anonKey);

export const MAX_FILE  = 50 * 1024 * 1024;
export const CAP_LIMIT = 100;

/** Shared mutable application state — imported and mutated by all modules. */
export const state = {
  me:                     null,
  allPosts:               [],
  tab:                    'all',
  search:                 '',
  view:                   'home',
  selFile:                null,
  _objUrl:                null,
  visibleN:               8,
  loadingMore:            false,
  reelObs:                null,
  viewedSet:              new Set(),
  myFollowing:            new Set(),
  myLikedPosts:           new Set(),
  _knownUnliked:          new Set(),
  cmtPostId:              null,
  pendingReelId:          null,
  pendingReelTime:        0,
  _lastPostIds:           '',
  globalMuted:            true,
  currentViewingUserId:   null,
  currentViewingUserPosts:[],
  feedVidObs:             null,
  viewObserver:           null,
};
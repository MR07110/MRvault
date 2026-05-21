import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         signOut, onAuthStateChanged, updateProfile as fbUpdateProfile }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot,
         deleteDoc, doc, updateDoc, getDoc, setDoc, serverTimestamp, getDocs,
         where, arrayUnion, arrayRemove, increment }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ─── Firebase & Supabase ─── */
const fbApp = initializeApp({
  apiKey:            "AIzaSyBhzWWFFgrOH84J2RIW5o7l_8192iPtbOg",
  authDomain:        "code-vibe-df610.firebaseapp.com",
  projectId:         "code-vibe-df610",
  storageBucket:     "code-vibe-df610.firebasestorage.app",
  messagingSenderId: "747762490655",
  appId:             "1:747762490655:web:125516814620784cf3a42a"
});

const auth = getAuth(fbApp);
const db   = getFirestore(fbApp);
const sb   = createClient(
  "https://mujoriozaxjojrgkkars.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11am9yaW96YXhqb2pyZ2trYXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjQ1MjQsImV4cCI6MjA5MDU0MDUyNH0.IiCWIT5QU06Wd7fEgRtTkG4IoC5oxyTgRAuWxRf15Zw"
);

/* ─── State ─── */
let me = null, allPosts = [], tab = 'all', search = '', view = 'home';
let selFile = null, visibleN = 8, loadingMore = false;
let reelObs = null, viewedSet = new Set();
let myFollowing = new Set();
let myLikedPosts = new Set();
let _knownUnliked = new Set();
let cmtPostId = null;
let pendingReelId = null;
let pendingReelTime = 0;
let _lastPostIds = '';
let globalMuted = true; // Global sound state — shared across all views

// ── Caches ──────────────────────────────────────────────────────────────
const userCache = new Map();   // uid → {fullName, avatar}
const cmtCountCache = new Map(); // postId → count (updated when comments loaded)

// User profile modal uchun state
let currentViewingUserId = null;
let currentViewingUserPosts = [];

// Views tracking - bir foydalanuvchi bir postni faqat 1 marta ko'radi
let viewedPostsByUser = new Map();
let viewObserver = null;

const MAX_FILE  = 50 * 1024 * 1024;
const CAP_LIMIT = 100;

/* ─── Utils ─── */
const $ = id => document.getElementById(id);
const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
const fmt = ts => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('en', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).format(d);
};
const fmtSz = b => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';
const initL  = n => (n && n[0] ? n[0].toUpperCase() : 'U');
const uToEmail = u => `${u.toLowerCase().replace(/[^a-z0-9]/g,'')}@mrtube.uz`;
const clr = n => {
  const c = ['#4f8ef7','#3ecf8e','#e84057','#f5a623','#9b59b6','#1abc9c'];
  return c[Math.abs((n||'').length) % c.length];
};
const defAvi = n => {
  const l = initL(n), c = clr(n);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='${encodeURIComponent(c)}' rx='50'/%3E%3Ctext x='50' y='68' text-anchor='middle' fill='white' font-size='44' font-weight='600' font-family='DM Sans,sans-serif'%3E${l}%3C/text%3E%3C/svg%3E`;
};

function showConfirm(msg, onOk, title = 'Are you sure?') {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent   = msg;
  $('confirmOverlay').classList.add('show');
  const ok     = $('confirmOkBtn');
  const cancel = $('confirmCancelBtn');
  const close  = () => $('confirmOverlay').classList.remove('show');
  ok.onclick     = () => { close(); onOk(); };
  cancel.onclick = close;
}

/* ─── Toast with types: 'success' | 'error' | 'info' | default ─── */
function toast(msg, type = '', dur = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (type ? ` toast-${type}` : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.classList.remove('show'); }, dur);
}

/* ─── Skeleton cards while feed is loading ─── */
function buildSkeletons(n = 3) {
  return Array.from({ length: n }, (_, i) => `
    <div class="skeleton-post" style="animation-delay:${i * 80}ms">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="skel skel-avi"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:7px">
          <div class="skel skel-line" style="width:42%"></div>
          <div class="skel skel-line" style="width:26%;height:9px;opacity:.6"></div>
        </div>
      </div>
      <div class="skel skel-media"></div>
      <div style="padding:12px 0;display:flex;flex-direction:column;gap:7px">
        <div class="skel skel-line" style="width:88%"></div>
        <div class="skel skel-line" style="width:65%"></div>
      </div>
      <div class="skel skel-actions"></div>
    </div>`).join('');
}

setTimeout(() => {
  $('splash').classList.add('out');
  setTimeout(() => $('splash').style.display = 'none', 400);
}, 400);

function showHeartBurst(x, y, container) {
  const el = document.createElement('div');
  el.className = 'heart-burst';
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#f04060" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/* ─── Views tracking (takrorlanmas - bir foydalanuvchi bir postni faqat 1 marta ko'radi) ─── */

// Sahifa yuklanganda oldin ko'rilganlarni yuklash
function loadViewedPostsFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem('mrtube_viewed') || '{}');
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    for (const [key, time] of Object.entries(stored)) {
      if (now - time < THIRTY_DAYS) {
        viewedPostsByUser.set(key, time);
      } else {
        cleaned++;
      }
    }
    // Eski yozuvlar o'chirilgan bo'lsa storage ni yangilash
    if (cleaned > 0) {
      const toStore = {};
      for (const [k, v] of viewedPostsByUser.entries()) toStore[k] = v;
      localStorage.setItem('mrtube_viewed', JSON.stringify(toStore));
    }
    console.log(`Loaded ${viewedPostsByUser.size} viewed posts (removed ${cleaned} old entries)`);
  } catch(e) {}
}

async function trackView(postId, userId) {
  if (!userId || !postId) return false;
  const key = `${userId}_${postId}`;
  if (viewedPostsByUser.has(key)) return false;

  viewedPostsByUser.set(key, Date.now());

  try {
    const toStore = {};
    for (const [k, v] of viewedPostsByUser.entries()) toStore[k] = v;
    localStorage.setItem('mrtube_viewed', JSON.stringify(toStore));
  } catch(e) {}

  // increment() — read shart emas, atomic, race condition yo'q
  try {
    await updateDoc(doc(db, 'posts', postId), { views: increment(1) });
    // Feed post stats
    const statsEl = document.querySelector(`.post[data-id="${postId}"] .post-stats span:first-child`);
    if (statsEl) {
      const cur = parseInt(statsEl.textContent) || 0;
      statsEl.textContent = `${cur + 1} views`;
    }
    // Reel view counter (eye icon)
    const reelViewEl = document.querySelector(`.reel[data-id="${postId}"] .rvc-count`);
    if (reelViewEl) {
      const cur = parseInt(reelViewEl.textContent) || 0;
      reelViewEl.textContent = `${cur + 1}`;
    }
  } catch(e) {}

  return true;
}

function setupViewObserver() {
  if (viewObserver) viewObserver.disconnect();
  
  viewObserver = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && me) {
        const post = entry.target.closest('.post');
        const reel = entry.target.closest('.reel');
        const element = post || reel;
        
        if (element && element.dataset.id) {
          await trackView(element.dataset.id, me.uid);
        }
      }
    });
  }, { threshold: 0.5 });
  
  document.querySelectorAll('.post, .reel').forEach(el => {
    if (el && el.dataset && el.dataset.id) {
      viewObserver.observe(el);
    }
  });
}

// Boshlang'ich yuklash
loadViewedPostsFromStorage();

/* ═══════════════════════ AUTH ═══════════════════════ */
let isLogin = true;

$('authSwitchBtn').onclick = () => {
  isLogin = !isLogin;
  $('authTitle').textContent      = isLogin ? 'Sign in to your account' : 'Create an account';
  $('authBtn').textContent        = isLogin ? 'Sign in' : 'Sign up';
  $('authSwitchText').textContent = isLogin ? 'No account? ' : 'Have an account? ';
  $('authSwitchBtn').textContent  = isLogin ? 'Sign up' : 'Sign in';
  $('nameRow').style.display      = isLogin ? 'none' : 'block';
  $('confirmRow').style.display   = isLogin ? 'none' : 'block';
  $('authErr').textContent = '';
};

$('authBtn').onclick = async () => {
  const u = $('aUsername').value.trim(), p = $('aPassword').value, e = $('authErr');
  if (!u || u.length < 3) { e.textContent = 'Username must be at least 3 characters'; return; }
  if (!p || p.length < 6) { e.textContent = 'Password must be at least 6 characters'; return; }
  e.textContent = '';
  try {
    if (isLogin) {
      await signInWithEmailAndPassword(auth, uToEmail(u), p);
    } else {
      const fn = $('aFullname').value.trim(), c = $('aConfirm').value;
      if (!fn) { e.textContent = 'Enter your name'; return; }
      if (p !== c) { e.textContent = 'Passwords do not match'; return; }
      const cr = await createUserWithEmailAndPassword(auth, uToEmail(u), p);
      await fbUpdateProfile(cr.user, { displayName: fn });
      await setDoc(doc(db,'users',cr.user.uid), {
        uid: cr.user.uid, username: u, fullName: fn,
        email: uToEmail(u), bio: '', avatar: defAvi(fn),
        followers: [], following: [], createdAt: serverTimestamp()
      });
      toast('Account created!', 'success');
    }
  } catch(err) { e.textContent = err.message; }
};

['aUsername','aPassword','aConfirm'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') $('authBtn').click(); });
});

onAuthStateChanged(auth, async user => {
  $('authStateLoader')?.remove(); // remove initial loader if present
  if (user) {
    me = user;
    $('authWrap').classList.remove('show');
    $('app').classList.add('show');
    const ref = doc(db,'users',user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        username: user.email?.split('@')[0] || user.uid.slice(0,8),
        fullName: user.displayName || 'User',
        email: user.email,
        avatar: defAvi(user.displayName || 'U'),
        bio: '', followers: [], following: [],
        createdAt: serverTimestamp()
      });
    }
    await refreshMyFollowing();
    listenPosts();
  } else {
    me = null;
    $('app').classList.remove('show');
    $('authWrap').classList.add('show');
  }
});

async function refreshMyFollowing() {
  if (!me) return;
  const snap = await getDoc(doc(db,'users',me.uid));
  myFollowing = new Set(snap.data()?.following || []);
}

function listenPosts() {
  onSnapshot(
    query(collection(db,'posts'), orderBy('createdAt','desc')),
    snap => {
      const newPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const newIds = newPosts.map(p => p.id).join(',');
      const structural = newIds !== _lastPostIds;
      _lastPostIds = newIds;
      allPosts = newPosts;

      if (structural) {
        if (view === 'home')      renderFeed();
        if (view === 'following') renderFollowing();
        if (view === 'reels')     renderReels();
        if (view === 'profile')   renderProfile();
        if (currentViewingUserId && $('userProfileModal').classList.contains('show')) {
          renderUserProfileModal(currentViewingUserId);
        }
      } else {
        patchCounts(newPosts);
      }
    }
  );
}

function patchCounts(posts) {
  posts.forEach(p => {
    const lc = document.getElementById(`lc-${p.id}`);
    if (lc) lc.textContent = `${p.likes || 0} likes`;

    const rlc = document.querySelector(`.rlc-${p.id}`);
    if (rlc) rlc.textContent = `${p.likes || 0}`;

    const statsEl = document.querySelector(`.post[data-id="${p.id}"] .post-stats`);
    if (statsEl) {
      const spans = statsEl.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = `${p.views || 0} views`;
      if (spans[1]) spans[1].textContent = `${p.likes || 0} likes`;
      // comment soni o'zgarmasa qayta fetch qilmaymiz — snapshot'da keladi
    }
  });
}

function filtered() {
  let p = [...allPosts];
  if (tab === 'mine') p = p.filter(x => x.userId === me?.uid);
  else p = p.filter(x => x.isPublic === true || x.userId === me?.uid);
  if (search) {
    const q = search.toLowerCase();
    p = p.filter(x =>
      (x.text||'').toLowerCase().includes(q) ||
      (x.userFullName||'').toLowerCase().includes(q)
    );
  }
  return p;
}

function filteredFollowing() {
  let p = allPosts.filter(x => myFollowing.has(x.userId) && x.isPublic === true);
  if (search) {
    const q = search.toLowerCase();
    p = p.filter(x =>
      (x.text||'').toLowerCase().includes(q) ||
      (x.userFullName||'').toLowerCase().includes(q)
    );
  }
  return p;
}

function buildCaption(text, postId) {
  if (!text) return '';
  const escaped = esc(text);
  if (text.length <= CAP_LIMIT) return `<div class="post-caption">${escaped}</div>`;
  const short = esc(text.substring(0, CAP_LIMIT));
  return `<div class="post-caption cap-collapsed" data-postid="${postId}">
    <span class="cap-short">${short}<span class="cap-more">...more</span></span>
    <span class="cap-full">${escaped}<span class="cap-more" style="color:var(--blue)">less</span></span>
  </div>`;
}

async function renderFeedTo(feedEl, posts) {
  if (!me || !feedEl) return;
  if (!posts.length) {
    if (search) {
      feedEl.innerHTML = `<div class="empty-search">
        <div class="empty-search-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <div>No results for "<strong>${esc(search)}</strong>"</div>
        <div class="empty-search-hint">Try different keywords</div>
      </div>`;
    } else {
      feedEl.innerHTML = `<div class="empty">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        No posts yet
      </div>`;
    }
    return;
  }

  // ── 1. User docs — only fetch uncached ─────────────────────────────
  const uids = [...new Set(posts.map(p => p.userId))];
  const uncachedUids = uids.filter(u => !userCache.has(u));
  if (uncachedUids.length) {
    const docs = await Promise.all(uncachedUids.map(u => getDoc(doc(db,'users',u))));
    uncachedUids.forEach((u,i) => {
      const d = docs[i].data()||{};
      userCache.set(u, { fullName: d.fullName, avatar: d.avatar || defAvi(d.fullName) });
    });
  }
  const uMap = {};
  uids.forEach(u => { uMap[u] = userCache.get(u) || { fullName:'Anonymous', avatar: defAvi('U') }; });

  // ── 2. Like status — only fetch truly unknown posts ──────────────────
  const unknownPosts = posts.filter(p => !myLikedPosts.has(p.id) && !_knownUnliked.has(p.id));
  if (unknownPosts.length) {
    const lS = await Promise.all(unknownPosts.map(p => getDoc(doc(db,'posts',p.id,'likes',me.uid))));
    unknownPosts.forEach((p,i) => {
      if (lS[i].exists()) myLikedPosts.add(p.id);
      else _knownUnliked.add(p.id);
    });
  }
  const likedSet = new Set(posts.filter(p => myLikedPosts.has(p.id)).map(p => p.id));

  // ── 3. Comment counts — use cache (updated lazily when comments open) ─
  // Avoids N extra getDocs calls on every feed render
  const cMap = {};
  posts.forEach(p => { cMap[p.id] = cmtCountCache.get(p.id) ?? 0; });

  let html = '';
  for (const p of posts) {
    const u = uMap[p.userId] || {};
    const liked = likedSet.has(p.id);
    const canDel = me.uid === p.userId || me.email === 'admin@gmail.com';

    html += `<div class="post" data-id="${p.id}">
      <div class="post-head">
        <div class="avi user-avi-btn" data-uid="${p.userId}"><img src="${u.avatar}" onerror="this.style.display='none'"></div>
        <div class="post-meta user-avi-btn" data-uid="${p.userId}">
          <div class="post-name">${esc(u.fullName||'Anonymous')}</div>
          <div class="post-time">${fmt(p.createdAt)}</div>
        </div>
        ${canDel ? `<button class="del-btn" data-id="${p.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
          </svg></button>` : ''}
      </div>
      ${buildMedia(p)}
      ${buildCaption(p.text, p.id)}
      <div class="post-stats">
        <span>${p.views || 0} views</span>
        <span id="lc-${p.id}">${p.likes || 0} likes</span>
        <span id="cc-${p.id}">${cMap[p.id] || 0} comments</span>
      </div>
      <div class="post-actions">
        <button class="act-btn like-btn${liked?' liked':''}" data-id="${p.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="${liked?'#f04060':'none'}" stroke="${liked?'#f04060':'currentColor'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <button class="act-btn cmt-open-btn" data-id="${p.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        ${p.mediaUrl ? `<button class="act-btn share-btn" data-url="${esc(p.mediaUrl)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>` : ''}
      </div>
    </div>`;
  }

  feedEl.innerHTML = html;
  bindFeedEvents(feedEl);
  setTimeout(() => setupViewObserver(), 100);
}

async function renderFeed() {
  if (!me) return;
  const feedEl = $('feed');
  const posts = filtered().slice(0, visibleN);
  // Show skeletons instantly only when no content yet — avoids flicker on updates
  if (!feedEl.querySelector('.post')) feedEl.innerHTML = buildSkeletons(3);
  await renderFeedTo(feedEl, posts);
  if (visibleN < filtered().length) {
    feedEl.insertAdjacentHTML('beforeend', '<div class="spin-wrap"><div class="spinner"></div></div>');
  }
  setupScroll();
}

async function renderFollowing() {
  if (!me) return;
  const feedEl = $('followingFeed');
  const posts = filteredFollowing().slice(0, visibleN);
  if (!feedEl.querySelector('.post')) feedEl.innerHTML = buildSkeletons(2);
  await renderFeedTo(feedEl, posts);
  if (visibleN < filteredFollowing().length) {
    feedEl.insertAdjacentHTML('beforeend', '<div class="spin-wrap"><div class="spinner"></div></div>');
  }
}

function buildMedia(p) {
  if (!p.mediaUrl) return '';
  if (p.mediaType?.startsWith('image'))
    return `<div class="post-media" data-id="${p.id}" data-type="image" data-url="${esc(p.mediaUrl)}"><img src="${esc(p.mediaUrl)}" loading="lazy"></div>`;
  if (p.mediaType?.startsWith('video'))
    return `<div class="post-media" data-id="${p.id}" data-type="video" data-url="${esc(p.mediaUrl)}">
      <div class="vid-wrap">
        <video src="${esc(p.mediaUrl)}" preload="metadata" playsinline></video>
        <div class="vid-overlay" onclick="toggleVidPlay(this)"></div>
        <div class="vid-controls">
          <button class="vc-play" onclick="toggleVidPlay(this.closest('.vid-wrap'))">
            <svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            <svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <div class="vc-progress" onclick="seekVid(event, this)">
            <div class="vc-bar"><div class="vc-fill"></div></div>
          </div>
          <span class="vc-time">0:00</span>
          <button class="vc-mute" onclick="toggleMute(this.closest('.vid-wrap'))">
            <svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          </button>
          <button class="vc-fs" onclick="reqFullscreen(this.closest('.vid-wrap'))">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  return `<div class="file-card">
    <div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
    <div class="file-info"><div class="file-name">${esc(p.fileName||'File')}</div><div class="file-size">${p.fileSize ? fmtSz(p.fileSize) : ''}</div></div>
    <button class="file-dl" onclick="event.stopPropagation();dlFile('${esc(p.mediaUrl)}','${esc(p.fileName||'file')}')">Download</button>
  </div>`;
}

window.dlFile = async (url, name) => {
  toast('Downloading...', 'info', 8000);
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Network error');
    const blob = await res.blob();
    const burl = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = burl;
    a.download = name || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(burl); a.remove(); }, 1000);
    toast('Downloaded!', 'success');
  } catch (e) {
    // Fallback: open in new tab
    window.open(url, '_blank');
    toast('Opened in new tab', 'info');
  }
};

function initVidWrap(wrap) {
  const vid = wrap.querySelector('video');
  if (vid._inited) return;
  vid._inited = true;
  // Apply global mute state
  vid.muted = globalMuted;
  const volIc = wrap.querySelector('.ic-vol'), mutedIc = wrap.querySelector('.ic-muted');
  if (volIc)   volIc.style.display   = globalMuted ? 'none' : '';
  if (mutedIc) mutedIc.style.display = globalMuted ? '' : 'none';
  vid.addEventListener('loadedmetadata', () => {
    const ratio = vid.videoWidth / vid.videoHeight;
    wrap.style.aspectRatio = ratio.toFixed(4);
  });
  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    const pct = (vid.currentTime / vid.duration) * 100;
    const fill = wrap.querySelector('.vc-fill');
    const timeEl = wrap.querySelector('.vc-time');
    if (fill) fill.style.width = pct + '%';
    if (timeEl) timeEl.textContent = fmtVidTime(vid.currentTime);
  });
  vid.addEventListener('ended', () => setPlayState(wrap, false));
  vid.addEventListener('play', () => setPlayState(wrap, true));
  vid.addEventListener('pause', () => setPlayState(wrap, false));
}
function fmtVidTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}
function setPlayState(wrap, playing) {
  const ip = wrap.querySelector('.ic-play'), ipu = wrap.querySelector('.ic-pause');
  if (ip) ip.style.display = playing ? 'none' : '';
  if (ipu) ipu.style.display = playing ? '' : 'none';
}
window.toggleVidPlay = (el) => {
  const wrap = el.closest ? el.closest('.vid-wrap') : el;
  const vid = wrap.querySelector('video');
  if (!vid) return;
  if (vid.paused) {
    vid.muted = globalMuted; // Always respect global mute state when starting
    vid.play();
  } else {
    vid.pause();
  }
};
window.seekVid = (e, bar) => {
  const wrap = bar.closest('.vid-wrap');
  const vid = wrap.querySelector('video');
  if (!vid || !vid.duration) return;
  const rect = bar.getBoundingClientRect();
  vid.currentTime = ((e.clientX - rect.left) / rect.width) * vid.duration;
};
window.toggleMute = (wrap) => {
  const vid = wrap.querySelector('video');
  if (!vid) return;
  vid.muted = !vid.muted;
  globalMuted = vid.muted; // Keep global state in sync
  wrap.querySelector('.ic-vol').style.display = vid.muted ? 'none' : '';
  wrap.querySelector('.ic-muted').style.display = vid.muted ? '' : 'none';
  updateMuteBtnUI();
};
window.reqFullscreen = (wrap) => {
  const vid = wrap.querySelector('video');
  if (!vid) return;
  if (vid.requestFullscreen) vid.requestFullscreen();
  else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
};

function bindFeedEvents(feedEl) {
  feedEl.querySelectorAll('.vid-wrap').forEach(w => initVidWrap(w));
  feedEl.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', () => doLike(b.dataset.id, b)));
  feedEl.querySelectorAll('.del-btn') .forEach(b => b.addEventListener('click', () => doDelete(b.dataset.id)));
  feedEl.querySelectorAll('.cmt-open-btn').forEach(b => b.addEventListener('click', () => openCmtModal(b.dataset.id)));
  feedEl.querySelectorAll('.share-btn').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.url); toast('Link copied', 'info');
  }));
  feedEl.querySelectorAll('.post-media').forEach(m => m.addEventListener('click', e => {
    if (e.target.closest('.file-dl')) return;
    if (e.target.closest('.vid-controls') || e.target.closest('.vc-progress')) return;
    openMediaInReels(m.dataset.id);
  }));
  feedEl.querySelectorAll('.user-avi-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.uid !== me?.uid) {
      openUserProfileModal(b.dataset.uid);
    }
  }));
  feedEl.querySelectorAll('.cap-more').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cap = btn.closest('.post-caption');
      cap.classList.toggle('cap-collapsed');
      cap.classList.toggle('cap-expanded');
    });
  });
  setupFeedVideoObs(feedEl);
}

let feedVidObs = null;
function setupFeedVideoObs(feedEl) {
  if (feedVidObs) feedVidObs.disconnect();
  feedVidObs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const wrap = en.target;
      const vid = wrap.querySelector('video');
      if (!vid) return;
      if (en.isIntersecting && en.intersectionRatio >= 0.5) {
        vid.muted = globalMuted;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, { threshold: 0.5 });
  feedEl.querySelectorAll('.vid-wrap').forEach(w => feedVidObs.observe(w));
}

function openMediaInReels(postId) {
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  const inReels = (post.isPublic || post.userId === me?.uid) &&
    post.mediaUrl && (post.mediaType?.startsWith('image') || post.mediaType?.startsWith('video'));
  if (inReels) {
    // Hozirgi video time ni saqlab qo'yamiz
    const feedVid = document.querySelector(`.post-media[data-id="${postId}"] video`);
    pendingReelTime = feedVid ? feedVid.currentTime : 0;
    pendingReelId = postId;
    switchView('reels');
  } else {
    openZoom(post.mediaUrl, post.mediaType?.startsWith('video') ? 'video' : 'image');
  }
}

function setupScroll() {
  window.onscroll = () => {
    const maxN = view === 'following' ? filteredFollowing().length : filtered().length;
    if (loadingMore || visibleN >= maxN) return;
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 400) {
      loadingMore = true;
      setTimeout(() => {
        visibleN = Math.min(visibleN + 8, maxN);
        loadingMore = false;
        if (view === 'home') renderFeed();
        else if (view === 'following') renderFollowing();
      }, 300);
    }
  };
}

async function doLike(postId, btn) {
  if (!me) return;
  const wasLiked = myLikedPosts.has(postId);
  const post = allPosts.find(p => p.id === postId);
  const cur = post?.likes || 0;
  const svg = btn.querySelector('svg');
  const lc = document.getElementById(`lc-${postId}`);

  if (wasLiked) {
    myLikedPosts.delete(postId);
    btn.classList.remove('liked');
    svg?.setAttribute('fill','none'); svg?.setAttribute('stroke','currentColor');
    if (lc) lc.textContent = `${Math.max(0,cur-1)} likes`;
    if (post) post.likes = Math.max(0, cur-1);
  } else {
    myLikedPosts.add(postId);
    btn.classList.add('liked');
    svg?.setAttribute('fill','#f04060'); svg?.setAttribute('stroke','#f04060');
    if (lc) lc.textContent = `${cur+1} likes`;
    if (post) post.likes = cur + 1;
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 400);
  }

  const lRef = doc(db,'posts',postId,'likes',me.uid);
  const pRef = doc(db,'posts',postId);
  try {
    if (wasLiked) {
      await Promise.all([deleteDoc(lRef), updateDoc(pRef, { likes: increment(-1) })]);
    } else {
      await Promise.all([setDoc(lRef,{userId:me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{ likes: increment(1) })]);
    }
  } catch {}
}

async function doDelete(id) {
  showConfirm('This post will be permanently deleted.', async () => {
    await deleteDoc(doc(db,'posts',id));
    toast('Post deleted', 'success');
  }, 'Delete post?');
}

/* ═══════════════════════ COMMENTS MODAL ═══════════════════════ */
async function openCmtModal(postId) {
  cmtPostId = postId;
  // Show skeleton comment rows immediately — no spinner
  $('cmtModalList').innerHTML = `
    <div class="cmt-skel-row"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:75%;height:9px;opacity:.6"></div></div></div>
    <div class="cmt-skel-row" style="animation-delay:60ms"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:35%"></div><div class="skel skel-line" style="width:60%;height:9px;opacity:.6"></div></div></div>`;
  const inp = $('cmtModalInput');
  inp.value = '';
  $('cmtCharCount').textContent = '300';
  $('cmtCharCount').className = 'cmt-char-count';
  $('cmtModal').classList.add('show');

  // Show current user's avatar in input row
  if (me) {
    getDoc(doc(db,'users',me.uid)).then(s => {
      const av = s.data()?.avatar || defAvi(s.data()?.fullName || 'U');
      $('cmtMyAvi').innerHTML = `<img src="${av}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }).catch(() => {});
  }

  await loadCmtModal(postId);
}

async function loadCmtModal(postId) {
  const list = $('cmtModalList');
  const snap = await getDocs(query(collection(db,'posts',postId,'comments'), orderBy('createdAt','asc')));
  const cmts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Update cache
  cmtCountCache.set(postId, cmts.length);
  const ccSpanFeed = document.getElementById(`cc-${postId}`);
  if (ccSpanFeed) ccSpanFeed.textContent = `${cmts.length} comments`;

  if (!cmts.length) {
    list.innerHTML = `<div class="cmt-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:8px">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      No comments yet
    </div>`;
    return;
  }

  const uids = [...new Set(cmts.map(c => c.userId))];
  const uDs  = await Promise.all(uids.map(u => getDoc(doc(db,'users',u))));
  const aMap = {};
  uids.forEach((u,i) => { const d = uDs[i].data()||{}; aMap[u] = d.avatar || defAvi(d.fullName); });

  list.innerHTML = cmts.map(c => `<div class="cmt-row">
    <div class="cmt-avi user-avi-btn" data-uid="${c.userId}"><img src="${aMap[c.userId]}" onerror="this.style.display='none'"></div>
    <div class="cmt-body"><div class="cmt-name">${esc(c.userName)}</div><div class="cmt-text">${esc(c.text)}</div></div>
    ${(me.uid === c.userId || me.email === 'admin@gmail.com')
      ? `<button class="cmt-del" data-post="${postId}" data-cmt="${c.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
          </svg></button>`
      : ''}
  </div>`).join('');

  list.querySelectorAll('.cmt-del').forEach(b => b.addEventListener('click', async () => {
    await deleteDoc(doc(db,'posts',b.dataset.post,'comments',b.dataset.cmt));
    await loadCmtModal(b.dataset.post);
    toast('Comment deleted', 'success');
  }));
  list.querySelectorAll('.user-avi-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.uid !== me?.uid) { 
      $('cmtModal').classList.remove('show'); 
      openUserProfileModal(b.dataset.uid);
    }
  }));
  list.scrollTop = list.scrollHeight;
}

async function sendCmtModal() {
  const inp = $('cmtModalInput');
  const text = inp?.value.trim();
  if (!text || !cmtPostId) return;
  const uD = await getDoc(doc(db,'users',me.uid));
  const ud = uD.data() || {};
  await addDoc(collection(db,'posts',cmtPostId,'comments'), {
    userId: me.uid, userName: ud.fullName || me.displayName || 'User',
    text, createdAt: serverTimestamp()
  });
  inp.value = '';
  await loadCmtModal(cmtPostId);
  toast('Comment posted', 'success');
  
  const ccSpan = document.getElementById(`cc-${cmtPostId}`);
  if (ccSpan) {
    const current = parseInt(ccSpan.textContent) || 0;
    ccSpan.textContent = `${current + 1} comments`;
  }
  const rccSpan = document.querySelector(`.rcmt-${cmtPostId}`);
  if (rccSpan) {
    const current = parseInt(rccSpan.textContent) || 0;
    rccSpan.textContent = `${current + 1}`;
  }
}

$('cmtModalSend').onclick = sendCmtModal;
$('cmtModalInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendCmtModal(); } });
$('cmtModalInput').addEventListener('input', () => {
  const len = $('cmtModalInput').value.length;
  const cnt = $('cmtCharCount');
  cnt.textContent = 300 - len;
  cnt.className = 'cmt-char-count' + (len >= 270 ? (len >= 300 ? ' over' : ' warn') : '');
});
$('cmtModalClose').onclick = () => $('cmtModal').classList.remove('show');
$('cmtModal').addEventListener('click', e => { if (e.target === $('cmtModal')) $('cmtModal').classList.remove('show'); });

/* ═══════════════════════ ZOOM ═══════════════════════ */
function openZoom(url, type) {
  const im = $('zoomImg'), vd = $('zoomVideo');
  if (type === 'image') {
    im.style.display = 'block'; vd.style.display = 'none'; im.src = url;
  } else if (type === 'video') {
    im.style.display = 'none'; vd.style.display = 'block'; vd.src = url; vd.play().catch(() => {});
  } else { window.open(url,'_blank'); return; }
  $('zoomModal').classList.add('show');
}

$('zoomClose').onclick = () => { $('zoomVideo').pause(); $('zoomModal').classList.remove('show'); };
$('zoomModal').onclick = e => { if (e.target === $('zoomModal')) { $('zoomVideo').pause(); $('zoomModal').classList.remove('show'); } };

/* ═══════════════════════ USER PROFILE MODAL (BOSHQA FOYDALANUVCHI) ═══════════════════════ */
async function openUserProfileModal(uid) {
  if (!uid || uid === me?.uid) return;
  
  currentViewingUserId = uid;
  $('userProfileModal').classList.add('show');
  $('upBody').innerHTML = '<div class="spin-wrap" style="padding-top:80px"><div class="spinner"></div></div>';
  
  await renderUserProfileModal(uid);
}

async function renderUserProfileModal(uid) {
  const uSnap = await getDoc(doc(db,'users',uid));
  const ud = uSnap.data() || {};
  
  // Avatar URL ni tekshirish
  let av = ud.avatar;
  if (!av || av === '' || av === 'undefined') {
    av = defAvi(ud.fullName || 'U');
  }
  
  // Faqat ommaviy postlarni olish
  const userPublicPosts = allPosts.filter(p => p.userId === uid && p.isPublic === true);
  currentViewingUserPosts = userPublicPosts;
  
  const totalLikes = userPublicPosts.reduce((s,p) => s + (p.likes||0), 0);
  const followersCount = (ud.followers||[]).length;
  const followingCount = (ud.following||[]).length;
  const isF = myFollowing.has(uid);
  
  // Profile grid uchun HTML
  const gridHTML = userPublicPosts.length === 0
    ? '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text3);font-size:13px">No public posts</div>'
    : userPublicPosts.map(p => {
        let c = '';
        if (p.mediaUrl && p.mediaType?.startsWith('image')) {
          c = `<img src="${esc(p.mediaUrl)}" loading="lazy" onerror="this.style.display='none'">`;
        } else if (p.mediaUrl && p.mediaType?.startsWith('video')) {
          c = `<video src="${esc(p.mediaUrl)}" preload="metadata" muted></video>`;
        } else {
          c = `<div class="up-grid-cell-txt">${esc((p.text||p.fileName||'').substring(0,40))}</div>`;
        }
        const isVid = p.mediaType?.startsWith('video');
        return `<div class="up-grid-cell" data-id="${p.id}" data-uid="${uid}">${c}
          ${isVid ? `<div class="grid-play-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3z"/></svg></div>` : ''}
          <div class="up-grid-cell-overlay">
            <div class="grid-stat">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${p.likes||0}
            </div>
            <div class="grid-stat">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ${p.views||0}
            </div>
          </div>
        </div>`;
      }).join('');
  
  $('upBody').innerHTML = `
    <div class="up-cover"><div class="up-avi-wrap"><div class="up-avi"><img src="${av}" onerror="this.src='${defAvi(ud.fullName || 'U')}'" style="width:100%;height:100%;object-fit:cover"></div></div></div>
    <div class="up-info">
      <div class="up-name">${esc(ud.fullName||'Anonymous')}</div>
      ${ud.bio ? `<div class="up-bio">${esc(ud.bio)}</div>` : ''}
      <div class="up-stats">
        <div class="up-stat"><div class="up-stat-val">${userPublicPosts.length}</div><div class="up-stat-lbl">posts</div></div>
        <div class="up-stat"><div class="up-stat-val">${totalLikes}</div><div class="up-stat-lbl">likes</div></div>
        <div class="up-stat"><div class="up-stat-val">${followersCount}</div><div class="up-stat-lbl">followers</div></div>
        <div class="up-stat"><div class="up-stat-val">${followingCount}</div><div class="up-stat-lbl">following</div></div>
      </div>
      <button class="up-follow-btn ${isF?'is-following':'not-following'}" id="upFollowBtn" data-uid="${uid}">
        ${isF ? 'Following' : 'Follow'}
      </button>
      <div class="up-posts-tab">
        <span class="up-posts-tab-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Posts
        </span>
      </div>
      <div class="up-grid" id="upGrid">${gridHTML}</div>
    </div>`;
  
  // Follow tugmasi event
  const followBtn = $('upFollowBtn');
  if (followBtn) {
    followBtn.onclick = async () => {
      const btn = followBtn;
      const currently = myFollowing.has(uid);
      if (currently) {
        myFollowing.delete(uid);
        btn.className = 'up-follow-btn not-following';
        btn.textContent = 'Follow';
        unfollow(uid).catch(() => {});
      } else {
        myFollowing.add(uid);
        btn.className = 'up-follow-btn is-following';
        btn.textContent = 'Following';
        follow(uid).catch(() => {});
      }
      refreshReelFollowButtons();
      // Followers sonini yangilash
      const followersSpan = $('upBody').querySelector('.up-stat:nth-child(3) .up-stat-val');
      if (followersSpan) {
        const current = parseInt(followersSpan.textContent) || 0;
        followersSpan.textContent = currently ? current - 1 : current + 1;
      }
    };
  }
  
  // Profil ichidagi postlarga click event
  document.querySelectorAll('.up-grid-cell[data-id]').forEach(cell => {
    cell.addEventListener('click', () => openDetail(cell.dataset.id));
  });
}

// Faqat bitta foydalanuvchining postlarini reelsda ko'rsatish
function openUserReelsWithFilter(userId, startPostId) {
  if (!userId) return;
  
  const userReels = allPosts.filter(p => 
    p.userId === userId && 
    p.isPublic === true &&
    p.mediaUrl && 
    (p.mediaType?.startsWith('image') || p.mediaType?.startsWith('video'))
  );
  
  if (userReels.length === 0) {
    toast('No public reels from this user', 'info');
    return;
  }
  
  switchView('reels');
  
  setTimeout(() => {
    const reelsWrap = $('reelsWrap');
    if (!reelsWrap) return;
    renderFilteredReels(userReels, startPostId);
  }, 100);
}

async function renderFilteredReels(filteredReels, startPostId) {
  if (!filteredReels.length) return;
  
  const lS = await Promise.all(filteredReels.map(p => getDoc(doc(db,'posts',p.id,'likes',me.uid))));
  filteredReels.forEach((p,i) => { if (lS[i].exists()) myLikedPosts.add(p.id); });
  const likedSet = new Set(filteredReels.filter((_,i) => lS[i].exists()).map(p => p.id));
  
  const uids = [...new Set(filteredReels.map(p => p.userId))];
  const uDs = await Promise.all(uids.map(u => getDoc(doc(db,'users',u))));
  const uMap = {};
  uids.forEach((u,i) => { const d = uDs[i].data()||{}; uMap[u] = { fullName: d.fullName, avatar: d.avatar||defAvi(d.fullName) }; });
  
  const cC = await Promise.all(filteredReels.map(p => getDocs(collection(db,'posts',p.id,'comments'))));
  const cMap = {}; filteredReels.forEach((p,i) => cMap[p.id] = cC[i].size);
  
  let html = '';
  for (let idx = 0; idx < filteredReels.length; idx++) {
    const p = filteredReels[idx];
    const u = uMap[p.userId] || {};
    const liked = likedSet.has(p.id);
    const isF = myFollowing.has(p.userId);
    const isMine = me.uid === p.userId;

    const eager = idx < 3;
    const med = p.mediaType?.startsWith('video')
      ? `<video src="${esc(p.mediaUrl)}" loop playsinline preload="${eager ? 'auto' : 'none'}" muted></video>`
      : `<img src="${esc(p.mediaUrl)}" loading="${eager ? 'eager' : 'lazy'}">`;

    const capText = p.text || '';
    const capPreview = capText.length > 80 ? capText.substring(0,80) : capText;
    const hasMore = capText.length > 80;
    
    html += `<div class="reel" data-id="${p.id}" data-uid="${p.userId}" data-idx="${idx}">
      ${med}
      <div class="reel-grad"></div>
      <div class="reel-progress"><div class="reel-progress-track"><div class="reel-progress-fill" id="rp-${p.id}"></div></div></div>
      <div class="reel-pause-icon" id="rpause-${p.id}">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
          <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      </div>
      <div class="reel-info">
        <div class="reel-user-row">
          <div class="reel-avi${!isMine?' reel-avi-link':''}" ${!isMine?`data-uid="${p.userId}"`:''}><img src="${u.avatar}" onerror="this.style.display='none'"></div>
          <span class="reel-uname${!isMine?' reel-uname-link':''}" ${!isMine?`data-uid="${p.userId}"`:''}>${esc(u.fullName||'Anonymous')}</span>
          ${!isMine ? `<button class="reel-follow${isF?' following':''}" data-uid="${p.userId}">${isF?'Following':'Follow'}</button>` : ''}
        </div>
        ${capText ? `<div class="reel-cap" data-full="${esc(capText)}" data-postid="${p.id}" data-uid="${p.userId}">${esc(capPreview)}${hasMore?'<span class="reel-cap-more">...more</span>':''}</div>` : ''}
      </div>
      <div class="reel-side">
        <button class="reel-act${liked?' liked':''}" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="${liked?'#f04060':'none'}" stroke="${liked?'#f04060':'rgba(255,255,255,0.9)'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="rlc-${p.id}">${p.likes||0}</span>
        </button>
        <button class="reel-act reel-cmt-btn" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="rcmt-${p.id}">${cMap[p.id]||0}</span>
        </button>
        <button class="reel-act reel-share" data-url="${esc(p.mediaUrl)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button class="reel-act reel-dl" data-url="${esc(p.mediaUrl)}" data-name="${esc(p.fileName||'media')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <div class="reel-act" style="cursor:default;pointer-events:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="rvc-count" style="color:rgba(255,255,255,0.75)">${p.views||0}</span>
        </div>
      </div>
    </div>`;
  }
  
  $('reelsWrap').innerHTML = html;
  bindReelEvents(filteredReels, uMap);
  setTimeout(() => setupViewObserver(), 100);
  
  if (startPostId) {
    setTimeout(() => {
      const el = document.querySelector(`.reel[data-id="${startPostId}"]`);
      if (el) el.scrollIntoView({ behavior: 'instant' });
    }, 150);
  }
}

$('upBack').onclick = () => {
  currentViewingUserId = null;
  currentViewingUserPosts = [];
  $('userProfileModal').classList.remove('show');
};
$('userProfileModal').addEventListener('click', e => {
  if (e.target === $('userProfileModal')) {
    currentViewingUserId = null;
    currentViewingUserPosts = [];
    $('userProfileModal').classList.remove('show');
  }
});

/* ═══════════════════════ REELS ═══════════════════════ */
async function renderReels() {
  if (!me) return;
  let reels = allPosts.filter(p => p.mediaUrl && (p.mediaType?.startsWith('image') || p.mediaType?.startsWith('video')));
  reels = reels.filter(p => p.isPublic === true || p.userId === me.uid);

  if (!reels.length) {
    $('reelsWrap').innerHTML = `<div class="empty" style="color:#fff;padding-top:50vh;text-align:center">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" style="margin:0 auto 12px;display:block">
        <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4V8z"/>
      </svg>
      No reels yet
    </div>`;
    return;
  }

  const lS = await Promise.all(reels.map(p => getDoc(doc(db,'posts',p.id,'likes',me.uid))));
  reels.forEach((p,i) => { if (lS[i].exists()) myLikedPosts.add(p.id); });
  const likedSet = new Set(reels.filter((_,i) => lS[i].exists()).map(p => p.id));
  const uids = [...new Set(reels.map(p => p.userId))];
  const uncachedReelUids = uids.filter(u => !userCache.has(u));
  if (uncachedReelUids.length) {
    const uDs = await Promise.all(uncachedReelUids.map(u => getDoc(doc(db,'users',u))));
    uncachedReelUids.forEach((u,i) => { const d = uDs[i].data()||{}; userCache.set(u, { fullName: d.fullName, avatar: d.avatar||defAvi(d.fullName) }); });
  }
  const uMap = {};
  uids.forEach(u => { uMap[u] = userCache.get(u) || { fullName:'Anonymous', avatar: defAvi('U') }; });
  const cC = await Promise.all(reels.map(p => getDocs(collection(db,'posts',p.id,'comments'))));
  const cMap = {}; reels.forEach((p,i) => cMap[p.id] = cC[i].size);

  let html = '';
  for (let idx = 0; idx < reels.length; idx++) {
    const p = reels[idx];
    const u = uMap[p.userId] || {};
    const liked = likedSet.has(p.id);
    const isF   = myFollowing.has(p.userId);
    const isMine = me.uid === p.userId;

    // First 3 reels: preload aggressively so content shows instantly
    const eager = idx < 3;
    const med = p.mediaType?.startsWith('video')
      ? `<video src="${esc(p.mediaUrl)}" loop playsinline preload="${eager ? 'auto' : 'none'}" muted></video>`
      : `<img src="${esc(p.mediaUrl)}" loading="${eager ? 'eager' : 'lazy'}">`;

    const capText = p.text || '';
    const capPreview = capText.length > 80 ? capText.substring(0,80) : capText;
    const hasMore = capText.length > 80;

    html += `<div class="reel" data-id="${p.id}" data-uid="${p.userId}" data-idx="${idx}">
      ${med}
      <div class="reel-grad"></div>
      <div class="reel-progress"><div class="reel-progress-track"><div class="reel-progress-fill" id="rp-${p.id}"></div></div></div>
      <div class="reel-pause-icon" id="rpause-${p.id}">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
          <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      </div>
      <div class="reel-info">
        <div class="reel-user-row">
          <div class="reel-avi${!isMine?' reel-avi-link':''}" ${!isMine?`data-uid="${p.userId}"`:''}><img src="${u.avatar}" onerror="this.style.display='none'"></div>
          <span class="reel-uname${!isMine?' reel-uname-link':''}" ${!isMine?`data-uid="${p.userId}"`:''}>${esc(u.fullName||'Anonymous')}</span>
          ${!isMine ? `<button class="reel-follow${isF?' following':''}" data-uid="${p.userId}">${isF?'Following':'Follow'}</button>` : ''}
        </div>
        ${capText ? `<div class="reel-cap" data-full="${esc(capText)}" data-postid="${p.id}" data-uid="${p.userId}">${esc(capPreview)}${hasMore?'<span class="reel-cap-more">...more</span>':''}</div>` : ''}
      </div>
      <div class="reel-side">
        <button class="reel-act${liked?' liked':''}" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="${liked?'#f04060':'none'}" stroke="${liked?'#f04060':'rgba(255,255,255,0.9)'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="rlc-${p.id}">${p.likes||0}</span>
        </button>
        <button class="reel-act reel-cmt-btn" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="rcmt-${p.id}">${cMap[p.id]||0}</span>
        </button>
        <button class="reel-act reel-share" data-url="${esc(p.mediaUrl)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button class="reel-act reel-dl" data-url="${esc(p.mediaUrl)}" data-name="${esc(p.fileName||'media')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <div class="reel-act" style="cursor:default;pointer-events:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="rvc-count" style="color:rgba(255,255,255,0.75)">${p.views||0}</span>
        </div>
      </div>
    </div>`;
  }

  $('reelsWrap').innerHTML = html;
  bindReelEvents(reels, uMap);
  setTimeout(() => setupViewObserver(), 100);

  if (pendingReelId) {
    const _pid = pendingReelId, _pt = pendingReelTime;
    pendingReelId = null; pendingReelTime = 0;
    requestAnimationFrame(() => {
      const el = document.querySelector(`.reel[data-id="${_pid}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'instant' });
        if (_pt > 0) {
          const vid = el.querySelector('video');
          if (vid) {
            const applyTime = () => { vid.currentTime = _pt; };
            if (vid.readyState >= 1) applyTime();
            else vid.addEventListener('loadedmetadata', applyTime, { once: true });
          }
        }
      }
    });
  }
}

function bindReelEvents(reels, uMap) {
  // Progress bar drag/seek
  document.querySelectorAll('.reel-progress').forEach(bar => {
    const reel = bar.closest('.reel');
    const getVid = () => reel?.querySelector('video');
    const seek = (clientX) => {
      const vid = getVid(); if (!vid || !vid.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      vid.currentTime = pct * vid.duration;
      const fill = bar.querySelector('.reel-progress-fill');
      if (fill) fill.style.width = (pct * 100) + '%';
    };
    // Mouse
    bar.addEventListener('mousedown', e => {
      e.stopPropagation(); seek(e.clientX);
      const onMove = ev => seek(ev.clientX);
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    // Touch
    bar.addEventListener('touchstart', e => {
      e.stopPropagation(); seek(e.touches[0].clientX);
      const onMove = ev => { ev.preventDefault(); seek(ev.touches[0].clientX); };
      const onEnd = () => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }, { passive: true });
  });

  document.querySelectorAll('.reel-act[data-id]:not(.reel-cmt-btn)').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); doReelLike(b.dataset.id, b); });
  });
  document.querySelectorAll('.reel-cmt-btn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); openCmtModal(b.dataset.id);
  }));
  document.querySelectorAll('.reel-share').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); navigator.clipboard?.writeText(b.dataset.url); toast('Link copied', 'info');
  }));
  document.querySelectorAll('.reel-dl').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); dlFile(b.dataset.url, b.dataset.name);
  }));
  document.querySelectorAll('.reel-follow').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const uid = b.dataset.uid;
    if (myFollowing.has(uid)) {
      myFollowing.delete(uid);
      b.className = 'reel-follow';
      b.textContent = 'Follow';
      unfollow(uid).catch(()=>{});
    } else {
      myFollowing.add(uid);
      b.className = 'reel-follow following';
      b.textContent = 'Following';
      follow(uid).catch(()=>{});
    }
    refreshReelFollowButtons();
  }));
  document.querySelectorAll('.reel-avi-link[data-uid]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); 
    if (b.dataset.uid !== me?.uid) {
      openUserProfileModal(b.dataset.uid);
    }
  }));
  document.querySelectorAll('.reel-uname-link[data-uid]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.dataset.uid !== me?.uid) {
      openUserProfileModal(b.dataset.uid);
    }
  }));

  document.querySelectorAll('.reel-cap').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      const ft = c.dataset.full || '';
      if (!ft || ft.length <= 80) return;
      const reelEl = c.closest('.reel');
      const uid = reelEl.dataset.uid;
      const u = (uMap && uMap[uid]) || { fullName:'Anonymous', avatar: defAvi('U') };
      openReelCapSheet(reelEl.dataset.id, uid, u, ft);
    });
  });

  document.querySelectorAll('.reel').forEach(reel => {
    const vid = reel.querySelector('video');
    let tapT = null;

    reel.addEventListener('click', e => {
      if (e.target.closest('.reel-side') || e.target.closest('.reel-follow') ||
          e.target.closest('.reel-cap')  || e.target.closest('.reel-avi-link') ||
          e.target.closest('.reel-uname-link')) return;

      if (tapT) {
        clearTimeout(tapT); tapT = null;
        const rect = reel.getBoundingClientRect();
        showHeartBurst(e.clientX - rect.left, e.clientY - rect.top, reel);
        if (!myLikedPosts.has(reel.dataset.id)) {
          const likeBtn = reel.querySelector('.reel-act[data-id]');
          if (likeBtn) doReelLike(reel.dataset.id, likeBtn);
        }
      } else {
        tapT = setTimeout(() => {
          tapT = null;
          if (!vid) return;
          const pi = document.getElementById(`rpause-${reel.dataset.id}`);
          if (vid.paused) {
            vid.play().catch(() => {});
            pi?.classList.remove('show');
          } else {
            vid.pause();
            pi?.classList.add('show');
            setTimeout(() => pi?.classList.remove('show'), 900);
          }
        }, 220);
      }
    });
  });

  if (reelObs) reelObs.disconnect();
  reelObs = new IntersectionObserver(entries => {
    entries.forEach(async en => {
      const vid = en.target.querySelector('video');
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        if (!viewedSet.has(en.target.dataset.id) && me) {
          viewedSet.add(en.target.dataset.id);
          await trackView(en.target.dataset.id, me.uid);
        }
        if (vid) {
          vid.muted = globalMuted;
          vid.play().catch(() => { vid.muted = true; globalMuted = true; updateMuteBtnUI(); vid.play().catch(() => {}); });
          // Progress bar
          const reelId = en.target.dataset.id;
          vid.ontimeupdate = () => {
            const fill = document.getElementById(`rp-${reelId}`);
            if (fill && vid.duration) fill.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
          };
          vid.onended = () => {
            const fill = document.getElementById(`rp-${reelId}`);
            if (fill) fill.style.width = '0%';
          };
        }
        // ── Proactively preload next reel so it's instant on scroll ─────
        const nextReel = en.target.nextElementSibling;
        if (nextReel) {
          const nv = nextReel.querySelector('video');
          if (nv && nv.preload === 'none') { nv.preload = 'auto'; nv.load(); }
          const ni = nextReel.querySelector('img[loading="lazy"]');
          if (ni) ni.loading = 'eager';
        }
      } else {
        if (vid) {
          vid.pause();
          // Don't force mute — globalMuted remembers user preference
          vid.ontimeupdate = null;
          const fill = document.getElementById(`rp-${en.target.dataset.id}`);
          if (fill) fill.style.width = '0%';
        }
      }
    });
  }, { root: $('reelsWrap'), threshold: 0.6 });

  document.querySelectorAll('.reel').forEach(r => reelObs.observe(r));
}

function openReelCapSheet(postId, uid, u, fullText) {
  const isF = myFollowing.has(uid), isMine = uid === me?.uid;
  $('rcapUserRow').innerHTML = `
    <div class="rcap-avi"><img src="${u.avatar}" onerror="this.style.display='none'"></div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">${esc(u.fullName||'Anonymous')}</div></div>
    ${!isMine ? `<button class="rcap-follow ${isF?'following':''}" id="rcapFollowBtn" data-uid="${uid}">${isF?'Following':'Follow'}</button>` : ''}
  `;
  $('rcapText').textContent = fullText;
  $('reelCapSheet').classList.add('show');

  const fb = $('rcapFollowBtn');
  if (fb) fb.onclick = async () => {
    const uid2 = fb.dataset.uid;
    if (myFollowing.has(uid2)) {
      myFollowing.delete(uid2);
      fb.className = 'rcap-follow';
      fb.textContent = 'Follow';
      unfollow(uid2).catch(()=>{});
    } else {
      myFollowing.add(uid2);
      fb.className = 'rcap-follow following';
      fb.textContent = 'Following';
      follow(uid2).catch(()=>{});
    }
    refreshReelFollowButtons();
  };
}

$('reelCapSheet').addEventListener('click', e => {
  if (e.target === $('reelCapSheet')) $('reelCapSheet').classList.remove('show');
});

async function doReelLike(postId, btn) {
  if (!me) return;
  const wasLiked = myLikedPosts.has(postId);
  const post = allPosts.find(p => p.id === postId);
  const cur = post?.likes || 0;
  const svg = btn.querySelector('svg');
  const sp  = document.querySelector(`.rlc-${postId}`);

  if (wasLiked) {
    myLikedPosts.delete(postId);
    btn.classList.remove('liked');
    svg?.setAttribute('fill','none'); svg?.setAttribute('stroke','rgba(255,255,255,0.9)');
    if (sp) sp.textContent = `${Math.max(0, cur-1)}`;
    if (post) post.likes = Math.max(0, cur-1);
  } else {
    myLikedPosts.add(postId);
    btn.classList.add('liked');
    svg?.setAttribute('fill','#f04060'); svg?.setAttribute('stroke','#f04060');
    if (sp) sp.textContent = `${cur + 1}`;
    if (post) post.likes = cur + 1;
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 400);
  }

  const lRef = doc(db,'posts',postId,'likes',me.uid);
  const pRef = doc(db,'posts',postId);
  try {
    if (wasLiked) {
      await Promise.all([deleteDoc(lRef), updateDoc(pRef,{likes:Math.max(0,cur-1)})]);
    } else {
      await Promise.all([setDoc(lRef,{userId:me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{likes:cur+1})]);
    }
  } catch {}
}

function refreshReelFollowButtons() {
  document.querySelectorAll('.reel-follow[data-uid]').forEach(btn => {
    const uid = btn.dataset.uid;
    const isF = myFollowing.has(uid);
    btn.className = 'reel-follow' + (isF ? ' following' : '');
    btn.textContent = isF ? 'Following' : 'Follow';
  });
}

/* ═══════════════════════ FOLLOW / UNFOLLOW ═══════════════════════ */
async function follow(uid) {
  // arrayUnion - atomic, race condition yo'q, read shart emas
  await Promise.all([
    updateDoc(doc(db,'users',me.uid), { following: arrayUnion(uid) }),
    updateDoc(doc(db,'users',uid),    { followers: arrayUnion(me.uid) })
  ]);
  toast('Now following', 'success');
}

async function unfollow(uid) {
  // arrayRemove - atomic, race condition yo'q
  await Promise.all([
    updateDoc(doc(db,'users',me.uid), { following: arrayRemove(uid) }),
    updateDoc(doc(db,'users',uid),    { followers: arrayRemove(me.uid) })
  ]);
  toast('Unfollowed', 'info');
}

/* ═══════════════════════ MY PROFILE ═══════════════════════ */
async function renderProfile() {
  if (!me) return;
  const snap = await getDoc(doc(db,'users',me.uid));
  const ud = snap.data() || {};
  const fn = ud.fullName || me.displayName || 'User';
  const av = ud.avatar   || defAvi(fn);

  $('profileAvi').innerHTML = `<img src="${av}" onerror="this.style.display='none'">
    <div class="avi-edit-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>`;

  $('profileName').textContent = fn;
  $('profileBio').textContent  = ud.bio || '';

  const myP = allPosts.filter(p => p.userId === me.uid);
  $('statPosts').textContent     = myP.length;
  $('statLikes').textContent     = myP.reduce((s,p) => s+(p.likes||0), 0);
  $('statFollowers').textContent = (ud.followers||[]).length;
  $('statFollowing').textContent = (ud.following||[]).length;

  $('profileAvi').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async e => {
      const f = e.target.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      if (f.size > 5*1024*1024) { toast('Avatar must be under 5 MB', 'error'); return; }
      const path = `avatars/${me.uid}/${Date.now()}`;
      const {data, error} = await sb.storage.from('videos').upload(path, f, {upsert:true, contentType: f.type});
      if (error) { toast('Error: '+error.message, 'error'); return; }
      const {data:{publicUrl}} = sb.storage.from('videos').getPublicUrl(data.path);
      await updateDoc(doc(db,'users',me.uid), {avatar: publicUrl});
      renderProfile(); toast('Avatar updated', 'success');
    };
    inp.click();
  };

  renderProfileGrid(myP);
}

function renderProfileGrid(posts) {
  if (!posts.length) {
    $('profileGrid').innerHTML = `<div class="empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="opacity:.3;margin:0 auto 10px;display:block">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 9 4-4 4 4 4-4 4 4"/>
      </svg>
      No posts yet
    </div>`;
    return;
  }
  $('profileGrid').innerHTML = posts.map(p => {
    let c = '';
    if (p.mediaUrl && p.mediaType?.startsWith('image')) c = `<img src="${esc(p.mediaUrl)}" loading="lazy">`;
    else if (p.mediaUrl && p.mediaType?.startsWith('video')) c = `<video src="${esc(p.mediaUrl)}" preload="metadata" muted></video>`;
    else c = `<div class="grid-cell-txt">${esc((p.text||p.fileName||'').substring(0,60))}</div>`;
    const isVid = p.mediaType?.startsWith('video');
    return `<div class="grid-cell" data-id="${p.id}">${c}
      ${isVid ? `<div class="grid-play-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3z"/></svg></div>` : ''}
      <div class="grid-cell-overlay">
        <div class="grid-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${p.likes||0}
        </div>
        <div class="grid-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          ${p.views||0}
        </div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.grid-cell').forEach(c => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

async function openDetail(id) {
  const p = allPosts.find(x => x.id === id); if (!p) return;

  $('detailContent').innerHTML = `
    <div class="dm-handle"></div>
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--bg3);flex-shrink:0"></div>
      <div style="flex:1"><div style="height:12px;width:120px;background:var(--bg3);border-radius:4px;margin-bottom:6px"></div><div style="height:10px;width:80px;background:var(--bg3);border-radius:4px"></div></div>
    </div>
    <div style="width:100%;aspect-ratio:1;background:var(--bg3)"></div>
    <div style="height:60px"></div>`;
  $('detailModal').classList.add('show');

  const [lS, cS, uS] = await Promise.all([
    getDoc(doc(db,'posts',id,'likes',me.uid)),
    getDocs(query(collection(db,'posts',id,'comments'), orderBy('createdAt','asc'))),
    getDoc(doc(db,'users',p.userId))
  ]);
  const isLiked = lS.exists();
  const cmtCount = cS.docs.length;
  const ud = uS.data() || {};
  const av = ud.avatar || defAvi(ud.fullName);
  const isOwn = p.userId === me?.uid;
  if (isLiked) myLikedPosts.add(id);

  let mediaHtml = '';
  if (p.mediaUrl && p.mediaType?.startsWith('image')) {
    mediaHtml = `<div class="dm-media"><img src="${esc(p.mediaUrl)}" loading="lazy"></div>`;
  } else if (p.mediaUrl && p.mediaType?.startsWith('video')) {
    mediaHtml = `<div class="dm-media"><div class="vid-wrap"><video src="${esc(p.mediaUrl)}" preload="metadata" playsinline></video><div class="vid-overlay" onclick="toggleVidPlay(this)"></div><div class="vid-controls"><button class="vc-play" onclick="toggleVidPlay(this.closest(\'.vid-wrap\'))"><svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg><svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><div class="vc-progress" onclick="seekVid(event,this)"><div class="vc-bar"><div class="vc-fill"></div></div></div><span class="vc-time">0:00</span><button class="vc-mute" onclick="toggleMute(this.closest(\'.vid-wrap\'))"><svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button><button class="vc-fs" onclick="reqFullscreen(this.closest(\'.vid-wrap\'))"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div></div></div>`;
  }

  const likeColor = isLiked ? '#f04060' : 'currentColor';
  const likeFill  = isLiked ? '#f04060' : 'none';

  $('detailContent').innerHTML = `
    <div class="dm-handle"></div>
    <div class="dm-head">
      <div class="dm-avi${isOwn?'':' dm-avi-link'}" ${isOwn?'':('data-uid="'+p.userId+'"')}><img src="${av}" onerror="this.style.display='none'"></div>
      <div class="dm-meta">
        <div class="dm-name${isOwn?'':' dm-name-link'}" ${isOwn?'':('data-uid="'+p.userId+'"')}>${esc(ud.fullName||'Anonymous')}</div>
        <div class="dm-time">${fmt(p.createdAt)}</div>
      </div>
      <button class="dm-close" id="dmClose"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    ${mediaHtml}
    ${p.text ? `<div class="dm-caption">${esc(p.text)}</div>` : ''}
    <div class="dm-stats">
      <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${p.views||0}</span>
      <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="${likeFill}" stroke="${likeColor}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span id="dmLikeCount">${p.likes||0}</span></span>
      <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ${cmtCount}</span>
    </div>
    <div class="dm-actions">
      <button class="dm-act${isLiked?' liked':''}" id="dmLikeBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${likeFill}" stroke="${likeColor}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="dm-act-count" id="dmLikeCount2">${p.likes||0}</span>
      </button>
      <button class="dm-act" id="dmCmtBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="dm-act-count">${cmtCount}</span>
      </button>
      ${p.mediaUrl ? `<button class="dm-act" id="dmShareBtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>` : ''}
    </div>`;

  const vw = $('detailContent').querySelector('.vid-wrap');
  if (vw) initVidWrap(vw);

  const closeDetail = () => {
    const vid = $('detailContent').querySelector('video');
    if (vid) vid.pause();
    $('detailModal').classList.remove('show');
  };

  $('dmClose').onclick = closeDetail;
  $('detailModal').onclick = e => { if (e.target === $('detailModal')) closeDetail(); };

  $('dmLikeBtn').onclick = async () => {
    await doLikeGen(id, $('dmLikeBtn'));
    const s = await getDoc(doc(db,'posts',id));
    const n = s.data()?.likes||0;
    $('dmLikeCount').textContent = n;
    $('dmLikeCount2').textContent = n;
  };
  $('dmCmtBtn').onclick = () => { closeDetail(); openCmtModal(id); };
  $('dmShareBtn')?.addEventListener('click', () => { navigator.clipboard?.writeText(p.mediaUrl); toast('Link copied','info'); });
  $('detailContent').querySelectorAll('.dm-avi-link,.dm-name-link').forEach(el => {
    el.addEventListener('click', () => { closeDetail(); openUserProfileModal(el.dataset.uid); });
  });
}


async function doLikeGen(id, btn) {
  const wasLiked = myLikedPosts.has(id);
  const lRef = doc(db,'posts',id,'likes',me.uid);
  const pRef = doc(db,'posts',id);
  const pS = await getDoc(pRef);
  const cur = pS.data()?.likes || 0;
  const svg = btn.querySelector('svg');
  if (wasLiked) {
    myLikedPosts.delete(id);
    await Promise.all([deleteDoc(lRef), updateDoc(pRef,{likes:Math.max(0,cur-1)})]);
    btn.classList.remove('liked'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor');
  } else {
    myLikedPosts.add(id);
    await Promise.all([setDoc(lRef,{userId:me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{likes:cur+1})]);
    btn.classList.add('liked'); svg.setAttribute('fill','#f04060'); svg.setAttribute('stroke','#f04060');
  }
}

/* ═══════════════════════ UPLOAD ═══════════════════════ */
$('createBtn').onclick = () => { $('uploadOverlay').classList.add('show'); resetUpload(); };
$('uploadDrop').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { if (e.target.files[0]) pickFile(e.target.files[0]); };

$('uploadDrop').addEventListener('dragover', e => {
  e.preventDefault(); $('uploadDrop').style.borderColor = 'rgba(91,142,245,0.6)';
});
$('uploadDrop').addEventListener('dragleave', () => $('uploadDrop').style.borderColor = '');
$('uploadDrop').addEventListener('drop', e => {
  e.preventDefault(); $('uploadDrop').style.borderColor = '';
  const f = e.dataTransfer.files[0]; if (f) pickFile(f);
});

window.addEventListener('paste', e => {
  for (const item of (e.clipboardData?.items||[])) {
    if (item.kind === 'file') { const f = item.getAsFile(); if (f) { pickFile(f); $('uploadOverlay').classList.add('show'); break; } }
  }
});

$('pubToggle').onchange = e => {
  const row   = $('pubToggle').closest('.visibility-row');
  const label = row.querySelector('.visibility-label');
  const desc  = $('visDesc');
  if (e.target.checked) {
    label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Public`;
    desc.textContent = 'All logged-in users can see this';
    row.classList.add('is-public');
  } else {
    label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Private`;
    desc.textContent = 'Only you can see this';
    row.classList.remove('is-public');
  }
};

function pickFile(f) {
  if (f.size > MAX_FILE) { $('sizeWarn').textContent = `File is ${fmtSz(f.size)} — limit 50 MB`; toast('File exceeds 50 MB', 'error'); return; }
  $('sizeWarn').textContent = ''; selFile = f; $('uploadBtn').disabled = false;
  $('previewArea').style.display = 'block';
  if (f.type.startsWith('image'))
    $('previewArea').innerHTML = `<div class="preview-wrap"><img src="${URL.createObjectURL(f)}"><button class="preview-clear" onclick="clearFile()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>`;
  else if (f.type.startsWith('video'))
    $('previewArea').innerHTML = `<div class="preview-wrap"><video src="${URL.createObjectURL(f)}" controls style="max-height:150px;width:100%;border-radius:10px"></video><button class="preview-clear" onclick="clearFile()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>`;
  else
    $('previewArea').innerHTML = `<div class="preview-file">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div><div style="font-size:13px;font-weight:500">${esc(f.name)}</div><div style="font-size:11px;color:var(--text3)">${fmtSz(f.size)}</div></div>
      <button style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;display:flex;align-items:center" onclick="clearFile()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
}

window.clearFile = () => { selFile = null; $('previewArea').style.display='none'; $('uploadBtn').disabled=true; $('fileInput').value=''; };

function resetUpload() {
  selFile = null; $('fileInput').value = ''; $('previewArea').style.display = 'none';
  $('captionInput').value = ''; $('pubToggle').checked = false;
  const row = $('pubToggle').closest('.visibility-row');
  row.classList.remove('is-public');
  row.querySelector('.visibility-label').innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Private`;
  $('visDesc').textContent = 'Only you can see this';
  $('uploadBtn').disabled = true; $('sizeWarn').textContent = '';
}

$('uploadBtn').onclick = async () => {
  if (!selFile || !me) return;
  $('uploadBtn').disabled = true; $('uploadBtn').textContent = 'Uploading...';
  try {
    const path = `posts/${me.uid}/${Date.now()}_${selFile.name}`;
    const {data, error} = await sb.storage.from('videos').upload(path, selFile);
    if (error) throw error;
    const {data:{publicUrl}} = sb.storage.from('videos').getPublicUrl(data.path);
    const uD = await getDoc(doc(db,'users',me.uid)); const ud = uD.data() || {};
    await addDoc(collection(db,'posts'), {
      text: $('captionInput').value.trim() || null,
      mediaUrl: publicUrl, mediaType: selFile.type, fileName: selFile.name, fileSize: selFile.size,
      isPublic: $('pubToggle').checked,
      userId: me.uid, userFullName: ud.fullName || me.displayName || 'User',
      createdAt: serverTimestamp(), views: 0, likes: 0
    });
    toast('Posted!', 'success'); $('uploadOverlay').classList.remove('show'); resetUpload();
  } catch(err) { toast('Error: '+err.message, 'error'); }
  finally { $('uploadBtn').disabled = false; $('uploadBtn').textContent = 'Post'; }
};

$('cancelUpload').onclick = () => { $('uploadOverlay').classList.remove('show'); resetUpload(); };
$('uploadOverlay').onclick = e => { if (e.target === $('uploadOverlay')) { $('uploadOverlay').classList.remove('show'); resetUpload(); } };

/* ─── Profile Edit ─── */
$('editProfileBtn').onclick = async () => {
  const d = (await getDoc(doc(db,'users',me.uid))).data() || {};
  $('editName').value = d.fullName || ''; $('editBioInput').value = d.bio || '';
  $('profileEditOverlay').classList.add('show');
};

$('saveProfileBtn').onclick = async () => {
  const fn = $('editName').value.trim(); if (!fn) { toast('Enter your name', 'error'); return; }
  await updateDoc(doc(db,'users',me.uid), { fullName: fn, bio: $('editBioInput').value.trim() });
  await fbUpdateProfile(me, { displayName: fn });
  $('profileEditOverlay').classList.remove('show'); toast('Profile updated', 'success'); renderProfile();
};

$('cancelEditBtn').onclick = () => $('profileEditOverlay').classList.remove('show');
$('logoutBtn').onclick = () => {
  showConfirm('You will need to sign in again.', () => signOut(auth), 'Sign out?');
};
$('profileEditOverlay').onclick = e => { if (e.target === $('profileEditOverlay')) $('profileEditOverlay').classList.remove('show'); };

/* ═══════════════════════ VIEW SWITCHING ═══════════════════════ */
/* ═══════════════════════ GLOBAL MUTE CONTROL ═══════════════════════ */
const MUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
</svg>`;
const UNMUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
</svg>`;

function updateMuteBtnUI() {
  const icon = globalMuted ? MUTE_SVG : UNMUTE_SVG;
  const tip  = globalMuted ? 'Unmute' : 'Mute';
  const gb = $('globalMuteBtn'), rb = $('reelsMuteBtn');
  if (gb) { gb.innerHTML = icon; gb.title = tip; gb.classList.toggle('is-unmuted', !globalMuted); }
  if (rb) { rb.innerHTML = icon; rb.title = tip; rb.classList.toggle('is-unmuted', !globalMuted); }
}

function toggleGlobalMute() {
  globalMuted = !globalMuted;
  // Apply to all currently playing videos immediately
  document.querySelectorAll('video').forEach(v => {
    if (!v.paused) v.muted = globalMuted;
  });
  updateMuteBtnUI();
}
window.toggleGlobalMute = toggleGlobalMute;

function switchView(v) {
  view = v;
  // Only PAUSE videos on view switch — do NOT force mute (globalMuted controls sound)
  document.querySelectorAll('video').forEach(x => x.pause());
  document.querySelectorAll('.view').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.nav-btn[data-v]').forEach(x => x.classList.remove('on'));
  document.getElementById(`${v}View`)?.classList.add('on');
  document.querySelector(`.nav-btn[data-v="${v}"]`)?.classList.add('on');
  const isReels = v === 'reels';
  $('appHdr').style.display = isReels ? 'none' : 'flex';
  $('reelsMuteBtn').style.display = isReels ? 'flex' : 'none';
  updateMuteBtnUI();
  window.scrollTo({ top: 0 });
  if (v === 'home')      { visibleN = 8; renderFeed(); }
  if (v === 'reels')     renderReels();
  if (v === 'following') { visibleN = 8; renderFollowing(); }
  if (v === 'profile')   renderProfile();
}

document.querySelectorAll('.nav-btn[data-v]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.v)));

document.querySelectorAll('.hdr-tab').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.hdr-tab').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); tab = b.dataset.tab; visibleN = 8; renderFeed();
}));

$('searchInput').oninput = e => {
  search = e.target.value;
  clearTimeout(window._sT);
  window._sT = setTimeout(() => {
    visibleN = 8;
    view === 'home' ? renderFeed() : view === 'following' && renderFollowing();
  }, 300);
};

// detailBack hidden — close handled by dmClose and backdrop click

updateMuteBtnUI();
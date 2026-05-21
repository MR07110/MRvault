import { db, state, CAP_LIMIT }                    from './config.js';
import { $, esc, fmt, fmtSz, defAvi,
         initVidWrap, showConfirm, buildSkeletons,
         dlFile, openZoom }                        from './utils.js';
import { toast }                                   from './toast.js';
import { userCache, cmtCountCache, setupViewObserver } from './cache.js';
import {
  collection, query, orderBy, doc, getDoc,
  getDocs, deleteDoc, setDoc, updateDoc,
  serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── Lazy cross-module refs (avoids circular-at-init issues) ─────────── */
const _lazy = {
  openCmtModal:        () => import('./comments.js').then(m => m.openCmtModal),
  openUserProfileModal:() => import('./profile.js').then(m => m.openUserProfileModal),
  switchView:          () => import('./ui.js').then(m => m.switchView),
};

/* ── Helpers ─────────────────────────────────────────────────────────── */
export function filtered() {
  let p = [...state.allPosts];
  if (state.tab === 'mine') p = p.filter(x => x.userId === state.me?.uid);
  else p = p.filter(x => x.isPublic === true || x.userId === state.me?.uid);
  if (state.search) {
    const q = state.search.toLowerCase();
    p = p.filter(x =>
      (x.text||'').toLowerCase().includes(q) ||
      (x.userFullName||'').toLowerCase().includes(q)
    );
  }
  return p;
}

export function filteredFollowing() {
  let p = state.allPosts.filter(x => state.myFollowing.has(x.userId) && x.isPublic === true);
  if (state.search) {
    const q = state.search.toLowerCase();
    p = p.filter(x =>
      (x.text||'').toLowerCase().includes(q) ||
      (x.userFullName||'').toLowerCase().includes(q)
    );
  }
  return p;
}

export function buildCaption(text, postId) {
  if (!text) return '';
  const escaped = esc(text);
  if (text.length <= CAP_LIMIT) return `<div class="post-caption">${escaped}</div>`;
  const short = esc(text.substring(0, CAP_LIMIT));
  return `<div class="post-caption cap-collapsed" data-postid="${postId}">
    <span class="cap-short">${short}<span class="cap-more">...more</span></span>
    <span class="cap-full">${escaped}<span class="cap-more" style="color:var(--blue)">less</span></span>
  </div>`;
}

export function buildMedia(p) {
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

/* ── Feed rendering ──────────────────────────────────────────────────── */
export async function renderFeedTo(feedEl, posts) {
  if (!state.me || !feedEl) return;
  if (!posts.length) {
    feedEl.innerHTML = state.search
      ? `<div class="empty-search">
          <div class="empty-search-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
          <div>No results for "<strong>${esc(state.search)}</strong>"</div>
          <div class="empty-search-hint">Try different keywords</div>
        </div>`
      : `<div class="empty">
          <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
          No posts yet
        </div>`;
    return;
  }

  // Fetch uncached user docs
  const uids = [...new Set(posts.map(p => p.userId))];
  const uncachedUids = uids.filter(u => !userCache.has(u));
  if (uncachedUids.length) {
    const docs = await Promise.all(uncachedUids.map(u => getDoc(doc(db,'users',u))));
    uncachedUids.forEach((u,i) => {
      const d = docs[i].data() || {};
      userCache.set(u, { fullName: d.fullName, avatar: d.avatar || defAvi(d.fullName) });
    });
  }
  const uMap = {};
  uids.forEach(u => { uMap[u] = userCache.get(u) || { fullName:'Anonymous', avatar: defAvi('U') }; });

  // Fetch unknown like statuses
  const unknownPosts = posts.filter(p => !state.myLikedPosts.has(p.id) && !state._knownUnliked.has(p.id));
  if (unknownPosts.length) {
    const lS = await Promise.all(unknownPosts.map(p => getDoc(doc(db,'posts',p.id,'likes',state.me.uid))));
    unknownPosts.forEach((p,i) => {
      if (lS[i].exists()) state.myLikedPosts.add(p.id);
      else state._knownUnliked.add(p.id);
    });
  }
  const likedSet = new Set(posts.filter(p => state.myLikedPosts.has(p.id)).map(p => p.id));

  const cMap = {};
  posts.forEach(p => { cMap[p.id] = cmtCountCache.get(p.id) ?? 0; });

  let html = '';
  for (const p of posts) {
    const u      = uMap[p.userId] || {};
    const liked  = likedSet.has(p.id);
    const canDel = state.me.uid === p.userId || state.me.email === 'admin@gmail.com';

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

export async function renderFeed() {
  if (!state.me) return;
  const feedEl = $('feed');
  const posts  = filtered().slice(0, state.visibleN);
  if (!feedEl.querySelector('.post')) feedEl.innerHTML = buildSkeletons(3);
  await renderFeedTo(feedEl, posts);
  if (state.visibleN < filtered().length) {
    feedEl.insertAdjacentHTML('beforeend', '<div class="spin-wrap"><div class="spinner"></div></div>');
  }
  setupScroll();
}

export async function renderFollowing() {
  if (!state.me) return;
  const feedEl = $('followingFeed');
  const posts  = filteredFollowing().slice(0, state.visibleN);
  if (!feedEl.querySelector('.post')) feedEl.innerHTML = buildSkeletons(2);
  await renderFeedTo(feedEl, posts);
  if (state.visibleN < filteredFollowing().length) {
    feedEl.insertAdjacentHTML('beforeend', '<div class="spin-wrap"><div class="spinner"></div></div>');
  }
}

export function patchCounts(posts) {
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
    }
  });
}

/* ── Feed event binding ──────────────────────────────────────────────── */
export function bindFeedEvents(feedEl) {
  feedEl.querySelectorAll('.vid-wrap').forEach(w => initVidWrap(w));
  feedEl.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', () => doLike(b.dataset.id, b)));
  feedEl.querySelectorAll('.del-btn') .forEach(b => b.addEventListener('click', () => doDelete(b.dataset.id)));
  feedEl.querySelectorAll('.cmt-open-btn').forEach(b => b.addEventListener('click', async () => {
    const { openCmtModal } = await import('./comments.js');
    openCmtModal(b.dataset.id);
  }));
  feedEl.querySelectorAll('.share-btn').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.url); toast('Link copied', 'info');
  }));
  feedEl.querySelectorAll('.post-media').forEach(m => m.addEventListener('click', async e => {
    if (e.target.closest('.file-dl')) return;
    if (e.target.closest('.vid-controls') || e.target.closest('.vc-progress')) return;
    const { openMediaInReels } = await import('./ui.js');
    openMediaInReels(m.dataset.id);
  }));
  feedEl.querySelectorAll('.user-avi-btn').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.uid !== state.me?.uid) {
      const { openUserProfileModal } = await import('./profile.js');
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

export function setupFeedVideoObs(feedEl) {
  if (state.feedVidObs) state.feedVidObs.disconnect();
  state.feedVidObs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const wrap = en.target;
      const vid  = wrap.querySelector('video');
      if (!vid) return;
      if (en.isIntersecting && en.intersectionRatio >= 0.5) {
        vid.muted = state.globalMuted;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, { threshold: 0.5 });
  feedEl.querySelectorAll('.vid-wrap').forEach(w => state.feedVidObs.observe(w));
}

export function setupScroll() {
  window.onscroll = () => {
    const maxN = state.view === 'following' ? filteredFollowing().length : filtered().length;
    if (state.loadingMore || state.visibleN >= maxN) return;
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 400) {
      state.loadingMore = true;
      setTimeout(() => {
        state.visibleN  = Math.min(state.visibleN + 8, maxN);
        state.loadingMore = false;
        if (state.view === 'home')      renderFeed();
        else if (state.view === 'following') renderFollowing();
      }, 300);
    }
  };
}

/* ── Like ────────────────────────────────────────────────────────────── */
export async function doLike(postId, btn) {
  if (!state.me) return;
  const wasLiked = state.myLikedPosts.has(postId);
  const post = state.allPosts.find(p => p.id === postId);
  const cur  = post?.likes || 0;
  const svg  = btn.querySelector('svg');
  const lc   = document.getElementById(`lc-${postId}`);

  if (wasLiked) {
    state.myLikedPosts.delete(postId);
    btn.classList.remove('liked');
    svg?.setAttribute('fill','none'); svg?.setAttribute('stroke','currentColor');
    if (lc) lc.textContent = `${Math.max(0,cur-1)} likes`;
    if (post) post.likes = Math.max(0, cur-1);
  } else {
    state.myLikedPosts.add(postId);
    btn.classList.add('liked');
    svg?.setAttribute('fill','#f04060'); svg?.setAttribute('stroke','#f04060');
    if (lc) lc.textContent = `${cur+1} likes`;
    if (post) post.likes = cur + 1;
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 400);
  }

  const lRef = doc(db,'posts',postId,'likes',state.me.uid);
  const pRef = doc(db,'posts',postId);
  try {
    if (wasLiked) {
      await Promise.all([deleteDoc(lRef), updateDoc(pRef, { likes: increment(-1) })]);
    } else {
      await Promise.all([setDoc(lRef,{userId:state.me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{ likes: increment(1) })]);
    }
  } catch {}
}

/* ── Delete ──────────────────────────────────────────────────────────── */
export async function doDelete(id) {
  showConfirm('This post will be permanently deleted.', async () => {
    await deleteDoc(doc(db,'posts',id));
    toast('Post deleted', 'success');
  }, 'Delete post?');
}
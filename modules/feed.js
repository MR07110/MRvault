import { db, state, CAP_LIMIT }                    from './config.js';
import { $, esc, fmt, fmtSz, defAvi,
         initVidWrap, showConfirm, buildSkeletons,
         dlFile, openZoom }                        from './utils.js';
import { toast }                                   from './toast.js';
import { userCache, cmtCountCache, setupViewObserver } from './cache.js';
import { isAdmin }                                 from './auth.js';
import {
  collection, query, orderBy, doc, getDoc,
  getDocs, deleteDoc, setDoc, updateDoc,
  serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── Lazy cross-module refs ──────────────────────────────────────────── */
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
  return `<div class="post-caption cap-collapsible" data-postid="${postId}" data-expanded="false">
    <span class="cap-short">${short}<span class="cap-more cap-more-open"> ...ko'proq</span></span>
    <span class="cap-full" style="display:none">${escaped}<span class="cap-more cap-more-close" style="color:var(--blue)"> kamroq</span></span>
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
        <div class="vid-overlay"></div>
        <div class="vid-controls">
          <button class="vc-play">
            <svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            <svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <div class="vc-progress">
            <div class="vc-bar"><div class="vc-fill"></div></div>
          </div>
          <span class="vc-time">0:00</span>
          <button class="vc-mute">
            <svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          </button>
          <button class="vc-fs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  return `<div class="file-card">
    <div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
    <div class="file-info"><div class="file-name">${esc(p.fileName||'Fayl')}</div><div class="file-size">${p.fileSize ? fmtSz(p.fileSize) : ''}</div></div>
    <button class="file-dl" data-url="${esc(p.mediaUrl)}" data-name="${esc(p.fileName||'file')}">Yuklash</button>
  </div>`;
}

/* ── Feed rendering ──────────────────────────────────────────────────── */
export async function renderFeedTo(feedEl, posts) {
  if (!state.me || !feedEl) return;
  if (!posts.length) {
    feedEl.innerHTML = state.search
      ? `<div class="empty-search">
          <div class="empty-search-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
          <div>"<strong>${esc(state.search)}</strong>" bo'yicha natija topilmadi</div>
          <div class="empty-search-hint">Boshqa so'z bilan urinib ko'ring</div>
        </div>`
      : `<div class="empty">
          <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
          Hozircha post yo'q
        </div>`;
    return;
  }

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
  uids.forEach(u => { uMap[u] = userCache.get(u) || { fullName:'Anonim', avatar: defAvi('U') }; });

  /* FIX: Like state — bitta Map yordamida boshqarish */
  const unknownPosts = posts.filter(p => !state.myLikedPosts.has(p.id) && !state._knownUnliked.has(p.id));
  if (unknownPosts.length) {
    const lS = await Promise.all(unknownPosts.map(p => getDoc(doc(db,'posts',p.id,'likes',state.me.uid))));
    unknownPosts.forEach((p,i) => {
      if (lS[i].exists()) {
        state.myLikedPosts.add(p.id);
        state._knownUnliked.delete(p.id);  // FIX: ikki set sync
      } else {
        state._knownUnliked.add(p.id);
        state.myLikedPosts.delete(p.id);   // FIX
      }
    });
  }
  const likedSet = new Set(posts.filter(p => state.myLikedPosts.has(p.id)).map(p => p.id));

  const cMap = {};
  posts.forEach(p => { cMap[p.id] = cmtCountCache.get(p.id) ?? 0; });

  /* FIX: Scroll pozitsiyasini saqlash */
  const scrollY = window.scrollY;

  let html = '';
  for (const p of posts) {
    const u      = uMap[p.userId] || {};
    const liked  = likedSet.has(p.id);
    /* FIX: admin tekshiruvi UID bo'yicha */
    const canDel = state.me.uid === p.userId || isAdmin(state.me.uid);

    html += `<div class="post" data-id="${p.id}">
      <div class="post-head">
        <div class="avi user-avi-btn" data-uid="${p.userId}"><img src="${u.avatar}" onerror="this.style.display='none'"></div>
        <div class="post-meta user-avi-btn" data-uid="${p.userId}">
          <div class="post-name">${esc(u.fullName||'Anonim')}</div>
          <div class="post-time">${fmt(p.createdAt)}</div>
        </div>
        ${canDel ? `<button class="del-btn" data-id="${p.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        </button>` : ''}
      </div>
      ${buildCaption(p.text, p.id)}
      ${buildMedia(p)}
      <div class="post-actions">
        <button class="act-btn like-btn${liked?' liked':''}" data-id="${p.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${liked?'#f04060':'none'}" stroke="${liked?'#f04060':'currentColor'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="like-count" id="lc-${p.id}">${p.likes||0}</span>
        </button>
        <button class="act-btn cmt-btn" data-id="${p.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="cc-${p.id}">${cMap[p.id]||0} ta izoh</span>
        </button>
        ${p.mediaUrl ? `<button class="act-btn media-open-btn" data-id="${p.id}" data-url="${esc(p.mediaUrl)}" data-type="${esc(p.mediaType||'')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>` : ''}
      </div>
      <div class="post-stats">
        <span id="vc-${p.id}">${p.views||0} ta ko'rish</span>
      </div>
    </div>`;
  }

  if (posts.length >= state.visibleN && posts.length === state.visibleN) {
    html += `<button class="load-more-btn" id="loadMoreBtn">Ko'proq ko'rish</button>`;
  }

  feedEl.innerHTML = html;

  /* FIX: Scroll pozitsiyasini tiklash */
  window.scrollTo(0, scrollY);

  /* ── Event listeners (delegation) ─── */
  feedEl.querySelectorAll('.vid-wrap').forEach(initVidWrap);
  feedEl.querySelectorAll('.user-avi-btn').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.uid && b.dataset.uid !== state.me?.uid) {
      const { openUserProfileModal } = await import('./profile.js');
      openUserProfileModal(b.dataset.uid);
    }
  }));
  feedEl.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', () => doFeedLike(b.dataset.id, b)));
  feedEl.querySelectorAll('.cmt-btn').forEach(b => b.addEventListener('click', async () => {
    const fn = await _lazy.openCmtModal();
    fn(b.dataset.id);
  }));
  feedEl.querySelectorAll('.media-open-btn').forEach(b => b.addEventListener('click', async () => {
    const { openMediaInReels } = await import('./ui.js');
    openMediaInReels(b.dataset.id);
  }));
  feedEl.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', () => {
    const post = state.allPosts.find(p => p.id === b.dataset.id);
    const preview = post?.text?.slice(0,40) || post?.fileName || 'Bu post';
    showConfirm(`"${preview}" o'chirilsinmi?`, () => deletePost(b.dataset.id), 'Postni o\'chirish');
  }));
  feedEl.querySelectorAll('.file-dl').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    dlFile(b.dataset.url, b.dataset.name);
  }));

  /* FIX: Caption collapse/expand */
  feedEl.querySelectorAll('.cap-collapsible').forEach(cap => {
    cap.addEventListener('click', e => {
      const expanded = cap.dataset.expanded === 'true';
      cap.dataset.expanded = String(!expanded);
      cap.querySelector('.cap-short').style.display = expanded ? '' : 'none';
      cap.querySelector('.cap-full').style.display  = expanded ? 'none' : '';
    });
  });

  document.getElementById('loadMoreBtn')?.addEventListener('click', async () => {
    state.visibleN += 8;
    const { renderFeed } = await import('./feed.js');
    renderFeed();
  });

  setupViewObserver();
}

/* ── Like in feed ────────────────────────────────────────────────────── */
async function doFeedLike(postId, btn) {
  if (!state.me) return;
  const wasLiked = state.myLikedPosts.has(postId);
  const post     = state.allPosts.find(p => p.id === postId);
  const cur      = post?.likes || 0;
  const svg      = btn.querySelector('svg');
  const countEl  = btn.querySelector('.like-count');

  if (wasLiked) {
    state.myLikedPosts.delete(postId);
    state._knownUnliked.add(postId);   // FIX: sync
    btn.classList.remove('liked');
    svg?.setAttribute('fill','none'); svg?.setAttribute('stroke','currentColor');
    if (countEl) countEl.textContent = Math.max(0, cur - 1);
    if (post)    post.likes = Math.max(0, cur - 1);
  } else {
    state.myLikedPosts.add(postId);
    state._knownUnliked.delete(postId); // FIX: sync
    btn.classList.add('liked');
    svg?.setAttribute('fill','#f04060'); svg?.setAttribute('stroke','#f04060');
    if (countEl) countEl.textContent = cur + 1;
    if (post)    post.likes = cur + 1;
  }

  const lRef = doc(db,'posts',postId,'likes',state.me.uid);
  const pRef = doc(db,'posts',postId);
  try {
    if (wasLiked) {
      await Promise.all([deleteDoc(lRef), updateDoc(pRef, { likes: Math.max(0,cur-1) })]);
    } else {
      await Promise.all([setDoc(lRef,{userId:state.me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{likes:cur+1})]);
    }
  } catch(e) { console.error('Like xatosi:', e); }
}

/* ── Delete post ─────────────────────────────────────────────────────── */
async function deletePost(postId) {
  try {
    await deleteDoc(doc(db,'posts',postId));
    toast('Post o\'chirildi', 'success');
  } catch(e) {
    toast('O\'chirishda xato', 'error');
  }
}

/* ── patchCounts — faqat raqamlarni yangilash (to'liq render yo'q) ─── */
export function patchCounts(newPosts) {
  newPosts.forEach(p => {
    const lc = document.getElementById(`lc-${p.id}`);
    const vc = document.getElementById(`vc-${p.id}`);
    if (lc) lc.textContent = p.likes || 0;
    if (vc) vc.textContent = `${p.views||0} ta ko'rish`;
  });
}

/* ── renderFeed / renderFollowing ────────────────────────────────────── */
export async function renderFeed() {
  const feedEl = $('feed');
  if (!feedEl) return;
  if (!state.allPosts.length) feedEl.innerHTML = buildSkeletons(3);
  const posts = filtered().slice(0, state.visibleN);
  await renderFeedTo(feedEl, posts);
}

export async function renderFollowing() {
  const feedEl = $('followingFeed');
  if (!feedEl) return;
  if (!state.allPosts.length) feedEl.innerHTML = buildSkeletons(3);
  const posts = filteredFollowing().slice(0, state.visibleN);
  await renderFeedTo(feedEl, posts);
}
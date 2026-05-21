import { db, state }                                from './config.js';
import { $, esc, defAvi, dlFile, showHeartBurst }  from './utils.js';
import { toast }                                   from './toast.js';
import { userCache, setupViewObserver, trackView } from './cache.js';
import { follow, unfollow }                        from './auth.js';
import {
  collection, doc, getDoc, getDocs,
  deleteDoc, setDoc, updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── Main reels render ───────────────────────────────────────────────── */
export async function renderReels() {
  if (!state.me) return;
  let reels = state.allPosts.filter(p =>
    p.mediaUrl && (p.mediaType?.startsWith('image') || p.mediaType?.startsWith('video')) &&
    (p.isPublic === true || p.userId === state.me.uid)
  );

  if (!reels.length) {
    $('reelsWrap').innerHTML = `<div class="empty" style="color:#fff;padding-top:50vh;text-align:center">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" style="margin:0 auto 12px;display:block">
        <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4V8z"/>
      </svg>
      No reels yet
    </div>`;
    return;
  }

  const lS = await Promise.all(reels.map(p => getDoc(doc(db,'posts',p.id,'likes',state.me.uid))));
  reels.forEach((p,i) => { if (lS[i].exists()) state.myLikedPosts.add(p.id); });
  const likedSet = new Set(reels.filter((_,i) => lS[i].exists()).map(p => p.id));

  const uids = [...new Set(reels.map(p => p.userId))];
  const uncached = uids.filter(u => !userCache.has(u));
  if (uncached.length) {
    const uDs = await Promise.all(uncached.map(u => getDoc(doc(db,'users',u))));
    uncached.forEach((u,i) => { const d = uDs[i].data()||{}; userCache.set(u, { fullName: d.fullName, avatar: d.avatar||defAvi(d.fullName) }); });
  }
  const uMap = {};
  uids.forEach(u => { uMap[u] = userCache.get(u) || { fullName:'Anonymous', avatar: defAvi('U') }; });

  const cC = await Promise.all(reels.map(p => getDocs(collection(db,'posts',p.id,'comments'))));
  const cMap = {}; reels.forEach((p,i) => cMap[p.id] = cC[i].size);

  $('reelsWrap').innerHTML = _buildReelsHTML(reels, likedSet, uMap, cMap);
  bindReelEvents(reels, uMap);
  setTimeout(() => setupViewObserver(), 100);

  if (state.pendingReelId) {
    const _pid = state.pendingReelId, _pt = state.pendingReelTime;
    state.pendingReelId = null; state.pendingReelTime = 0;
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

/* ── Filtered reels for single-user view ─────────────────────────────── */
export function openUserReelsWithFilter(userId, startPostId) {
  if (!userId) return;
  const userReels = state.allPosts.filter(p =>
    p.userId === userId && p.isPublic === true &&
    p.mediaUrl && (p.mediaType?.startsWith('image') || p.mediaType?.startsWith('video'))
  );
  if (!userReels.length) { toast('No public reels from this user', 'info'); return; }
  import('./ui.js').then(({ switchView }) => {
    switchView('reels');
    setTimeout(() => renderFilteredReels(userReels, startPostId), 100);
  });
}

export async function renderFilteredReels(filteredReels, startPostId) {
  if (!filteredReels.length) return;

  const lS = await Promise.all(filteredReels.map(p => getDoc(doc(db,'posts',p.id,'likes',state.me.uid))));
  filteredReels.forEach((p,i) => { if (lS[i].exists()) state.myLikedPosts.add(p.id); });
  const likedSet = new Set(filteredReels.filter((_,i) => lS[i].exists()).map(p => p.id));

  const uids = [...new Set(filteredReels.map(p => p.userId))];
  const uDs  = await Promise.all(uids.map(u => getDoc(doc(db,'users',u))));
  const uMap = {};
  uids.forEach((u,i) => { const d = uDs[i].data()||{}; uMap[u] = { fullName: d.fullName, avatar: d.avatar||defAvi(d.fullName) }; });

  const cC = await Promise.all(filteredReels.map(p => getDocs(collection(db,'posts',p.id,'comments'))));
  const cMap = {}; filteredReels.forEach((p,i) => cMap[p.id] = cC[i].size);

  $('reelsWrap').innerHTML = _buildReelsHTML(filteredReels, likedSet, uMap, cMap);
  bindReelEvents(filteredReels, uMap);
  setTimeout(() => setupViewObserver(), 100);

  if (startPostId) {
    setTimeout(() => {
      const el = document.querySelector(`.reel[data-id="${startPostId}"]`);
      if (el) el.scrollIntoView({ behavior: 'instant' });
    }, 150);
  }
}

/* ── HTML builder (shared) ───────────────────────────────────────────── */
function _buildReelsHTML(reels, likedSet, uMap, cMap) {
  let html = '';
  for (let idx = 0; idx < reels.length; idx++) {
    const p      = reels[idx];
    const u      = uMap[p.userId] || {};
    const liked  = likedSet.has(p.id);
    const isF    = state.myFollowing.has(p.userId);
    const isMine = state.me.uid === p.userId;
    const eager  = idx < 3;

    const med = p.mediaType?.startsWith('video')
      ? `<video src="${esc(p.mediaUrl)}" loop playsinline preload="${eager ? 'auto' : 'none'}" muted></video>`
      : `<img src="${esc(p.mediaUrl)}" loading="${eager ? 'eager' : 'lazy'}">`;

    const capText    = p.text || '';
    const capPreview = capText.length > 80 ? capText.substring(0,80) : capText;
    const hasMore    = capText.length > 80;

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
  return html;
}

/* ── Event binding ───────────────────────────────────────────────────── */
export function bindReelEvents(reels, uMap) {
  // Progress bar seek
  document.querySelectorAll('.reel-progress').forEach(bar => {
    const reel   = bar.closest('.reel');
    const getVid = () => reel?.querySelector('video');
    const seek   = (clientX) => {
      const vid = getVid(); if (!vid || !vid.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      vid.currentTime = pct * vid.duration;
      const fill = bar.querySelector('.reel-progress-fill');
      if (fill) fill.style.width = (pct * 100) + '%';
    };
    bar.addEventListener('mousedown', e => {
      e.stopPropagation(); seek(e.clientX);
      const onMove = ev => seek(ev.clientX);
      const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    bar.addEventListener('touchstart', e => {
      e.stopPropagation(); seek(e.touches[0].clientX);
      const onMove = ev => { ev.preventDefault(); seek(ev.touches[0].clientX); };
      const onEnd  = () => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }, { passive: true });
  });

  document.querySelectorAll('.reel-act[data-id]:not(.reel-cmt-btn)').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); doReelLike(b.dataset.id, b); });
  });
  document.querySelectorAll('.reel-cmt-btn').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const { openCmtModal } = await import('./comments.js');
    openCmtModal(b.dataset.id);
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
    if (state.myFollowing.has(uid)) {
      state.myFollowing.delete(uid); b.className = 'reel-follow'; b.textContent = 'Follow';
      unfollow(uid).catch(() => {});
    } else {
      state.myFollowing.add(uid); b.className = 'reel-follow following'; b.textContent = 'Following';
      follow(uid).catch(() => {});
    }
    refreshReelFollowButtons();
  }));
  document.querySelectorAll('.reel-avi-link[data-uid], .reel-uname-link[data-uid]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (b.dataset.uid !== state.me?.uid) {
      const { openUserProfileModal } = await import('./profile.js');
      openUserProfileModal(b.dataset.uid);
    }
  }));
  document.querySelectorAll('.reel-cap').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      const ft = c.dataset.full || '';
      if (!ft || ft.length <= 80) return;
      const reelEl = c.closest('.reel');
      const uid    = reelEl.dataset.uid;
      const u      = (uMap && uMap[uid]) || { fullName:'Anonymous', avatar: defAvi('U') };
      openReelCapSheet(reelEl.dataset.id, uid, u, ft);
    });
  });
  document.querySelectorAll('.reel').forEach(reel => {
    const vid = reel.querySelector('video');
    let tapT  = null;
    reel.addEventListener('click', e => {
      if (e.target.closest('.reel-side') || e.target.closest('.reel-follow') ||
          e.target.closest('.reel-cap')  || e.target.closest('.reel-avi-link') ||
          e.target.closest('.reel-uname-link')) return;
      if (tapT) {
        clearTimeout(tapT); tapT = null;
        const rect = reel.getBoundingClientRect();
        showHeartBurst(e.clientX - rect.left, e.clientY - rect.top, reel);
        if (!state.myLikedPosts.has(reel.dataset.id)) {
          const likeBtn = reel.querySelector('.reel-act[data-id]');
          if (likeBtn) doReelLike(reel.dataset.id, likeBtn);
        }
      } else {
        tapT = setTimeout(() => {
          tapT = null;
          if (!vid) return;
          const pi = document.getElementById(`rpause-${reel.dataset.id}`);
          if (vid.paused) { vid.play().catch(() => {}); pi?.classList.remove('show'); }
          else { vid.pause(); pi?.classList.add('show'); setTimeout(() => pi?.classList.remove('show'), 900); }
        }, 220);
      }
    });
  });

  if (state.reelObs) state.reelObs.disconnect();
  state.reelObs = new IntersectionObserver(entries => {
    entries.forEach(async en => {
      const vid = en.target.querySelector('video');
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        if (!state.viewedSet.has(en.target.dataset.id) && state.me) {
          state.viewedSet.add(en.target.dataset.id);
          await trackView(en.target.dataset.id, state.me.uid);
        }
        if (vid) {
          vid.muted = state.globalMuted;
          vid.play().catch(() => { vid.muted = true; state.globalMuted = true; document.dispatchEvent(new CustomEvent('mutestatechange')); vid.play().catch(() => {}); });
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
          vid.ontimeupdate = null;
          const fill = document.getElementById(`rp-${en.target.dataset.id}`);
          if (fill) fill.style.width = '0%';
        }
      }
    });
  }, { root: $('reelsWrap'), threshold: 0.6 });
  document.querySelectorAll('.reel').forEach(r => state.reelObs.observe(r));
}

/* ── Reel like ───────────────────────────────────────────────────────── */
export async function doReelLike(postId, btn) {
  if (!state.me) return;
  const wasLiked = state.myLikedPosts.has(postId);
  const post     = state.allPosts.find(p => p.id === postId);
  const cur      = post?.likes || 0;
  const svg      = btn.querySelector('svg');
  const sp       = document.querySelector(`.rlc-${postId}`);

  if (wasLiked) {
    state.myLikedPosts.delete(postId);
    btn.classList.remove('liked');
    svg?.setAttribute('fill','none'); svg?.setAttribute('stroke','rgba(255,255,255,0.9)');
    if (sp) sp.textContent = `${Math.max(0, cur-1)}`;
    if (post) post.likes = Math.max(0, cur-1);
  } else {
    state.myLikedPosts.add(postId);
    btn.classList.add('liked');
    svg?.setAttribute('fill','#f04060'); svg?.setAttribute('stroke','#f04060');
    if (sp) sp.textContent = `${cur + 1}`;
    if (post) post.likes = cur + 1;
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 400);
  }

  const lRef = doc(db,'posts',postId,'likes',state.me.uid);
  const pRef = doc(db,'posts',postId);
  try {
    if (wasLiked) {
      await Promise.all([deleteDoc(lRef), updateDoc(pRef,{likes:Math.max(0,cur-1)})]);
    } else {
      await Promise.all([setDoc(lRef,{userId:state.me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{likes:cur+1})]);
    }
  } catch {}
}

export function refreshReelFollowButtons() {
  document.querySelectorAll('.reel-follow[data-uid]').forEach(btn => {
    const uid = btn.dataset.uid;
    const isF = state.myFollowing.has(uid);
    btn.className   = 'reel-follow' + (isF ? ' following' : '');
    btn.textContent = isF ? 'Following' : 'Follow';
  });
}

/* ── Caption sheet ───────────────────────────────────────────────────── */
export function openReelCapSheet(postId, uid, u, fullText) {
  const isF    = state.myFollowing.has(uid);
  const isMine = uid === state.me?.uid;
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
    if (state.myFollowing.has(uid2)) {
      state.myFollowing.delete(uid2); fb.className = 'rcap-follow'; fb.textContent = 'Follow';
      unfollow(uid2).catch(() => {});
    } else {
      state.myFollowing.add(uid2); fb.className = 'rcap-follow following'; fb.textContent = 'Following';
      follow(uid2).catch(() => {});
    }
    refreshReelFollowButtons();
  };
}

$('reelCapSheet').addEventListener('click', e => {
  if (e.target === $('reelCapSheet')) $('reelCapSheet').classList.remove('show');
});
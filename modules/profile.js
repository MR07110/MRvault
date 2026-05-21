import { db, sb, state }                 from './config.js';
import { $, esc, fmt, fmtSz, defAvi,
         initVidWrap }                   from './utils.js';
import { toast }                         from './toast.js';
import { userCache }                     from './cache.js';
import { follow, unfollow }              from './auth.js';
import { refreshReelFollowButtons }      from './reels.js';
import {
  collection, query, orderBy, doc, getDoc,
  getDocs, deleteDoc, setDoc, updateDoc,
  serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  updateProfile as fbUpdateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

/* ── My profile ──────────────────────────────────────────────────────── */
export async function renderProfile() {
  if (!state.me) return;
  const snap = await getDoc(doc(db,'users',state.me.uid));
  const ud   = snap.data() || {};
  const fn   = ud.fullName || state.me.displayName || 'User';
  const av   = ud.avatar   || defAvi(fn);

  $('profileAvi').innerHTML = `<img src="${av}" onerror="this.style.display='none'">
    <div class="avi-edit-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>`;

  $('profileName').textContent = fn;
  $('profileBio').textContent  = ud.bio || '';

  const myP = state.allPosts.filter(p => p.userId === state.me.uid);
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
      const path = `avatars/${state.me.uid}/${Date.now()}`;
      const {data, error} = await sb.storage.from('videos').upload(path, f, {upsert:true, contentType: f.type});
      if (error) { toast('Error: '+error.message, 'error'); return; }
      const {data:{publicUrl}} = sb.storage.from('videos').getPublicUrl(data.path);
      await updateDoc(doc(db,'users',state.me.uid), {avatar: publicUrl});
      userCache.delete(state.me.uid);
      renderProfile(); toast('Avatar updated', 'success');
    };
    inp.click();
  };

  renderProfileGrid(myP);
}

export function renderProfileGrid(posts) {
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

/* ── Post detail modal ───────────────────────────────────────────────── */
export async function openDetail(id) {
  const p = state.allPosts.find(x => x.id === id); if (!p) return;

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
    getDoc(doc(db,'posts',id,'likes',state.me.uid)),
    getDocs(query(collection(db,'posts',id,'comments'), orderBy('createdAt','asc'))),
    getDoc(doc(db,'users',p.userId))
  ]);
  const isLiked  = lS.exists();
  const cmtCount = cS.docs.length;
  const ud = uS.data() || {};
  const av = ud.avatar || defAvi(ud.fullName);
  const isOwn = p.userId === state.me?.uid;
  if (isLiked) state.myLikedPosts.add(id);

  let mediaHtml = '';
  if (p.mediaUrl && p.mediaType?.startsWith('image')) {
    mediaHtml = `<div class="dm-media"><img src="${esc(p.mediaUrl)}" loading="lazy"></div>`;
  } else if (p.mediaUrl && p.mediaType?.startsWith('video')) {
    mediaHtml = `<div class="dm-media"><div class="vid-wrap"><video src="${esc(p.mediaUrl)}" preload="metadata" playsinline></video><div class="vid-overlay"></div><div class="vid-controls"><button class="vc-play"><svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg><svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><div class="vc-progress"><div class="vc-bar"><div class="vc-fill"></div></div></div><span class="vc-time">0:00</span><button class="vc-mute"><svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button><button class="vc-fs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div></div></div>`;
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
    const n = s.data()?.likes || 0;
    $('dmLikeCount').textContent  = n;
    $('dmLikeCount2').textContent = n;
  };
  $('dmCmtBtn').onclick = () => { closeDetail(); import('./comments.js').then(({ openCmtModal }) => openCmtModal(id)); };
  $('dmShareBtn')?.addEventListener('click', () => { navigator.clipboard?.writeText(p.mediaUrl); toast('Link copied','info'); });
  $('detailContent').querySelectorAll('.dm-avi-link,.dm-name-link').forEach(el => {
    el.addEventListener('click', () => { closeDetail(); openUserProfileModal(el.dataset.uid); });
  });
}

export async function doLikeGen(id, btn) {
  const wasLiked = state.myLikedPosts.has(id);
  const lRef     = doc(db,'posts',id,'likes',state.me.uid);
  const pRef     = doc(db,'posts',id);
  const pS       = await getDoc(pRef);
  const cur      = pS.data()?.likes || 0;
  const svg      = btn.querySelector('svg');
  if (wasLiked) {
    state.myLikedPosts.delete(id);
    await Promise.all([deleteDoc(lRef), updateDoc(pRef,{likes:Math.max(0,cur-1)})]);
    btn.classList.remove('liked'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor');
  } else {
    state.myLikedPosts.add(id);
    await Promise.all([setDoc(lRef,{userId:state.me.uid,createdAt:serverTimestamp()}), updateDoc(pRef,{likes:cur+1})]);
    btn.classList.add('liked'); svg.setAttribute('fill','#f04060'); svg.setAttribute('stroke','#f04060');
  }
}

/* ── Other user's profile modal ──────────────────────────────────────── */
export async function openUserProfileModal(uid) {
  if (!uid || uid === state.me?.uid) return;
  state.currentViewingUserId = uid;
  $('userProfileModal').classList.add('show');
  $('upBody').innerHTML = '<div class="spin-wrap" style="padding-top:80px"><div class="spinner"></div></div>';
  await renderUserProfileModal(uid);
}

export async function renderUserProfileModal(uid) {
  const uSnap = await getDoc(doc(db,'users',uid));
  const ud    = uSnap.data() || {};
  let av      = ud.avatar;
  if (!av || av === '' || av === 'undefined') av = defAvi(ud.fullName || 'U');

  const userPublicPosts = state.allPosts.filter(p => p.userId === uid && p.isPublic === true);
  state.currentViewingUserPosts = userPublicPosts;

  const totalLikes     = userPublicPosts.reduce((s,p) => s + (p.likes||0), 0);
  const followersCount = (ud.followers||[]).length;
  const followingCount = (ud.following||[]).length;
  const isF            = state.myFollowing.has(uid);

  const gridHTML = userPublicPosts.length === 0
    ? '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text3);font-size:13px">No public posts</div>'
    : userPublicPosts.map(p => {
        let c = '';
        if (p.mediaUrl && p.mediaType?.startsWith('image'))
          c = `<img src="${esc(p.mediaUrl)}" loading="lazy" onerror="this.style.display='none'">`;
        else if (p.mediaUrl && p.mediaType?.startsWith('video'))
          c = `<video src="${esc(p.mediaUrl)}" preload="metadata" muted></video>`;
        else
          c = `<div class="up-grid-cell-txt">${esc((p.text||p.fileName||'').substring(0,40))}</div>`;
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

  const followBtn = $('upFollowBtn');
  if (followBtn) {
    followBtn.onclick = async () => {
      const currently = state.myFollowing.has(uid);
      if (currently) {
        state.myFollowing.delete(uid);
        followBtn.className   = 'up-follow-btn not-following';
        followBtn.textContent = 'Follow';
        unfollow(uid).catch(() => {});
      } else {
        state.myFollowing.add(uid);
        followBtn.className   = 'up-follow-btn is-following';
        followBtn.textContent = 'Following';
        follow(uid).catch(() => {});
      }
      refreshReelFollowButtons();
      const followersSpan = $('upBody').querySelector('.up-stat:nth-child(3) .up-stat-val');
      if (followersSpan) {
        const current = parseInt(followersSpan.textContent) || 0;
        followersSpan.textContent = currently ? current - 1 : current + 1;
      }
    };
  }

  document.querySelectorAll('.up-grid-cell[data-id]').forEach(cell => {
    cell.addEventListener('click', () => openDetail(cell.dataset.id));
  });
}

$('upBack').onclick = () => {
  state.currentViewingUserId    = null;
  state.currentViewingUserPosts = [];
  $('userProfileModal').classList.remove('show');
};
$('userProfileModal').addEventListener('click', e => {
  if (e.target === $('userProfileModal')) {
    state.currentViewingUserId    = null;
    state.currentViewingUserPosts = [];
    $('userProfileModal').classList.remove('show');
  }
});
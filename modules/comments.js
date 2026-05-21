import { db, state }                                from './config.js';
import { $, esc, defAvi }                          from './utils.js';
import { toast }                                   from './toast.js';
import { cmtCountCache }                           from './cache.js';
import {
  collection, query, orderBy, doc, getDoc,
  getDocs, addDoc, deleteDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── Open modal ──────────────────────────────────────────────────────── */
export async function openCmtModal(postId) {
  state.cmtPostId = postId;

  $('cmtModalList').innerHTML = `
    <div class="cmt-skel-row"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:75%;height:9px;opacity:.6"></div></div></div>
    <div class="cmt-skel-row" style="animation-delay:60ms"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:35%"></div><div class="skel skel-line" style="width:60%;height:9px;opacity:.6"></div></div></div>`;

  const inp = $('cmtModalInput');
  inp.value = '';
  $('cmtCharCount').textContent = '300';
  $('cmtCharCount').className   = 'cmt-char-count';
  $('cmtModal').classList.add('show');

  if (state.me) {
    getDoc(doc(db,'users',state.me.uid)).then(s => {
      const av = s.data()?.avatar || defAvi(s.data()?.fullName || 'U');
      $('cmtMyAvi').innerHTML = `<img src="${av}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }).catch(() => {});
  }

  await loadCmtModal(postId);
}

/* ── Load / refresh list ─────────────────────────────────────────────── */
export async function loadCmtModal(postId) {
  const list = $('cmtModalList');
  const snap = await getDocs(query(collection(db,'posts',postId,'comments'), orderBy('createdAt','asc')));
  const cmts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  cmtCountCache.set(postId, cmts.length);
  const ccSpanFeed = document.getElementById(`cc-${postId}`);
  if (ccSpanFeed) ccSpanFeed.textContent = `${cmts.length} ta izoh`;

  if (!cmts.length) {
    list.innerHTML = `<div class="cmt-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:8px">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Hozircha izoh yo'q
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
    ${(state.me.uid === c.userId || state.me.email === 'admin@gmail.com')
      ? `<button class="cmt-del" data-post="${postId}" data-cmt="${c.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
          </svg></button>`
      : ''}
  </div>`).join('');

  list.querySelectorAll('.cmt-del').forEach(b => b.addEventListener('click', async () => {
    await deleteDoc(doc(db,'posts',b.dataset.post,'comments',b.dataset.cmt));
    await loadCmtModal(b.dataset.post);
    toast('Izoh o\'chirildi', 'success');
  }));
  list.querySelectorAll('.user-avi-btn').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.uid !== state.me?.uid) {
      $('cmtModal').classList.remove('show');
      const { openUserProfileModal } = await import('./profile.js');
      openUserProfileModal(b.dataset.uid);
    }
  }));
  list.scrollTop = list.scrollHeight;
}

/* ── Send comment ────────────────────────────────────────────────────── */
export async function sendCmtModal() {
  const inp  = $('cmtModalInput');
  const text = inp?.value.trim();
  if (!text || !state.cmtPostId) return;
  if (text.length > 300) { toast('Izoh 300 belgidan oshmasin', 'error'); return; }
  const uD = await getDoc(doc(db,'users',state.me.uid));
  const ud = uD.data() || {};
  await addDoc(collection(db,'posts',state.cmtPostId,'comments'), {
    userId:   state.me.uid,
    userName: ud.fullName || state.me.displayName || 'User',
    text,
    createdAt: serverTimestamp()
  });
  inp.value = '';
  $('cmtCharCount').textContent = '300';
  $('cmtCharCount').className   = 'cmt-char-count';
  await loadCmtModal(state.cmtPostId);
  toast('Izoh qo\'shildi', 'success');

  const rccSpan = document.querySelector(`.rcmt-${state.cmtPostId}`);
  if (rccSpan) {
    const current = parseInt(rccSpan.textContent) || 0;
    rccSpan.textContent = `${current + 1}`;
  }
}

/* ── Modal event listeners ───────────────────────────────────────────── */
$('cmtModalSend').onclick = sendCmtModal;

/* FIX: Enter = yuborish, Shift+Enter = yangi qator */
$('cmtModalInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCmtModal();
  }
});

$('cmtModalInput').addEventListener('input', () => {
  const len = $('cmtModalInput').value.length;
  const cnt = $('cmtCharCount');
  cnt.textContent = 300 - len;
  cnt.className   = 'cmt-char-count' + (len >= 270 ? (len >= 300 ? ' over' : ' warn') : '');
});

$('cmtModalClose').onclick = () => $('cmtModal').classList.remove('show');
$('cmtModal').addEventListener('click', e => { if (e.target === $('cmtModal')) $('cmtModal').classList.remove('show'); });
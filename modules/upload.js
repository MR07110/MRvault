import { db, sb, state, MAX_FILE }                 from './config.js';
import { $, esc, fmtSz }                          from './utils.js';
import { toast }                                   from './toast.js';
import {
  collection, addDoc, doc, getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── FIX: Object URL ni tozalash helper ──────────────────────────────── */
function revokeObjUrl() {
  if (state._objUrl) {
    URL.revokeObjectURL(state._objUrl);
    state._objUrl = null;
  }
}

/* ── Reset & pick helpers ────────────────────────────────────────────── */
export function resetUpload() {
  revokeObjUrl(); // FIX: memory leak oldini olish
  state.selFile = null;
  $('fileInput').value = '';
  $('previewArea').style.display = 'none';
  $('previewArea').innerHTML = '';
  $('captionInput').value = '';
  $('pubToggle').checked = false;
  const row = $('pubToggle').closest('.visibility-row');
  row.classList.remove('is-public');
  row.querySelector('.visibility-label').innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Shaxsiy`;
  $('visDesc').textContent = 'Faqat siz ko\'rasiz';
  $('uploadBtn').disabled = true;
  $('uploadBtn').textContent = 'Post';
  $('sizeWarn').textContent = '';
}

export function pickFile(f) {
  if (f.size > MAX_FILE) {
    $('sizeWarn').textContent = `Fayl ${fmtSz(f.size)} — limit 50 MB`;
    toast('Fayl 50 MB dan katta', 'error');
    return;
  }
  $('sizeWarn').textContent = '';
  revokeObjUrl(); // FIX: avvalgi URL ni tozalash
  state.selFile = f;
  state._objUrl = URL.createObjectURL(f); // FIX: tracking uchun saqlash
  $('uploadBtn').disabled = false;
  $('previewArea').style.display = 'block';

  if (f.type.startsWith('image')) {
    $('previewArea').innerHTML = `<div class="preview-wrap"><img src="${state._objUrl}"><button class="preview-clear" data-action="clear-file">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>`;
  } else if (f.type.startsWith('video')) {
    $('previewArea').innerHTML = `<div class="preview-wrap"><video src="${state._objUrl}" controls style="max-height:150px;width:100%;border-radius:10px"></video><button class="preview-clear" data-action="clear-file">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>`;
  } else {
    $('previewArea').innerHTML = `<div class="preview-file">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div><div style="font-size:13px;font-weight:500">${esc(f.name)}</div><div style="font-size:11px;color:var(--text3)">${fmtSz(f.size)}</div></div>
      <button style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;display:flex;align-items:center" data-action="clear-file">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }
}

/* ── FIX: event delegation bilan preview clear ───────────────────────── */
$('previewArea').addEventListener('click', e => {
  if (e.target.closest('[data-action="clear-file"]')) clearFile();
});

function clearFile() {
  revokeObjUrl(); // FIX
  state.selFile = null;
  $('previewArea').style.display = 'none';
  $('previewArea').innerHTML = '';
  $('uploadBtn').disabled = true;
  $('fileInput').value = '';
}

/* ── Visibility toggle ───────────────────────────────────────────────── */
$('pubToggle').onchange = e => {
  const row   = $('pubToggle').closest('.visibility-row');
  const label = row.querySelector('.visibility-label');
  const desc  = $('visDesc');
  if (e.target.checked) {
    label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Ommaviy`;
    desc.textContent = 'Barcha foydalanuvchilar ko\'ra oladi';
    row.classList.add('is-public');
  } else {
    label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Shaxsiy`;
    desc.textContent = 'Faqat siz ko\'rasiz';
    row.classList.remove('is-public');
  }
};

/* ── Upload button — FIX: progress ko'rsatish ───────────────────────── */
$('uploadBtn').onclick = async () => {
  if (!state.selFile || !state.me) return;
  $('uploadBtn').disabled = true;
  $('uploadBtn').textContent = 'Yuklanmoqda... 0%';
  try {
    const path = `posts/${state.me.uid}/${Date.now()}_${state.selFile.name}`;
    const { data, error } = await sb.storage.from('videos').upload(path, state.selFile, {
      onUploadProgress: (p) => {
        const pct = Math.round((p.loaded / p.total) * 100);
        $('uploadBtn').textContent = `Yuklanmoqda... ${pct}%`;
      }
    });
    if (error) throw error;
    const { data: { publicUrl } } = sb.storage.from('videos').getPublicUrl(data.path);
    const uD = await getDoc(doc(db, 'users', state.me.uid));
    const ud = uD.data() || {};
    await addDoc(collection(db, 'posts'), {
      text:         $('captionInput').value.trim() || null,
      mediaUrl:     publicUrl,
      mediaType:    state.selFile.type,
      fileName:     state.selFile.name,
      fileSize:     state.selFile.size,
      isPublic:     $('pubToggle').checked,
      userId:       state.me.uid,
      userFullName: ud.fullName || state.me.displayName || 'User',
      createdAt:    serverTimestamp(),
      views: 0,
      likes: 0
    });
    revokeObjUrl(); // FIX: upload tugagach tozalash
    toast('Post qo\'shildi!', 'success');
    $('uploadOverlay').classList.remove('show');
    resetUpload();
  } catch (err) {
    toast('Xato: ' + err.message, 'error');
    $('uploadBtn').disabled  = false;
    $('uploadBtn').textContent = 'Post';
  }
};

/* ── Open overlay ────────────────────────────────────────────────────── */
$('createBtn').onclick = () => { $('uploadOverlay').classList.add('show'); resetUpload(); };
$('cancelUpload').onclick = () => { $('uploadOverlay').classList.remove('show'); resetUpload(); };
$('uploadOverlay').onclick = e => {
  if (e.target === $('uploadOverlay')) { $('uploadOverlay').classList.remove('show'); resetUpload(); }
};

/* ── File input / drop / paste ───────────────────────────────────────── */
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
  for (const item of (e.clipboardData?.items || [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) { pickFile(f); $('uploadOverlay').classList.add('show'); break; }
    }
  }
});
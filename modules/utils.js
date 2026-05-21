import { state }  from './config.js';
import { toast }  from './toast.js';

/* ── DOM / formatting helpers ─────────────────────────────────────────── */
export const $    = id => document.getElementById(id);
export const esc  = s  => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

/** FIX: Relative time — "3 soat oldin", "2 kun oldin" */
export const fmt  = ts => {
  if (!ts) return '';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)        return 'hozir';
  if (diff < 3600000)      return `${Math.floor(diff / 60000)} daq. oldin`;
  if (diff < 86400000)     return `${Math.floor(diff / 3600000)} soat oldin`;
  if (diff < 604800000)    return `${Math.floor(diff / 86400000)} kun oldin`;
  return new Intl.DateTimeFormat('uz', { day:'numeric', month:'short' }).format(d);
};

export const fmtSz  = b  => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';
export const initL  = n  => (n && n[0] ? n[0].toUpperCase() : 'U');
export const uToEmail = u => `${u.toLowerCase().replace(/[^a-z0-9_]/g,'').replace(/_/g,'')}@mrtube.uz`;
export const clr    = n  => {
  const c = ['#4f8ef7','#3ecf8e','#e84057','#f5a623','#9b59b6','#1abc9c'];
  return c[Math.abs((n||'').length) % c.length];
};
export const defAvi = n => {
  const l = initL(n), c = clr(n);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='${encodeURIComponent(c)}' rx='50'/%3E%3Ctext x='50' y='68' text-anchor='middle' fill='white' font-size='44' font-weight='600' font-family='DM Sans,sans-serif'%3E${l}%3E/text%3E%3C/svg%3E`;
};

/* ── Username validation ─────────────────────────────────────────────── */
/** FIX: Qat'iy username validation — faqat kichik harf, raqam, _ belgisi */
export function validateUsername(u) {
  if (!u || u.length < 3) return 'Username kamida 3 ta belgi bo\'lsin';
  if (u.length > 20)       return 'Username 20 belgidan oshmasin';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Faqat kichik harf, raqam va _ belgisi';
  return null;
}

/* ── Confirm dialog ───────────────────────────────────────────────────── */
export function showConfirm(msg, onOk, title = 'Tasdiqlaysizmi?') {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent   = msg;
  $('confirmOverlay').classList.add('show');
  const ok     = $('confirmOkBtn');
  const cancel = $('confirmCancelBtn');
  const close  = () => $('confirmOverlay').classList.remove('show');
  const newOk  = ok.cloneNode(true);
  ok.parentNode.replaceChild(newOk, ok);
  newOk.onclick     = () => { close(); onOk(); };
  cancel.onclick = close;
}

/* ── Skeleton cards ───────────────────────────────────────────────────── */
export function buildSkeletons(n = 3) {
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

/* ── Heart burst animation ────────────────────────────────────────────── */
export function showHeartBurst(x, y, container) {
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

/* ── Video helpers ────────────────────────────────────────────────────── */
export function fmtVidTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

export function setPlayState(wrap, playing) {
  const ip = wrap.querySelector('.ic-play'), ipu = wrap.querySelector('.ic-pause');
  if (ip)  ip.style.display  = playing ? 'none' : '';
  if (ipu) ipu.style.display = playing ? '' : 'none';
}

export function initVidWrap(wrap) {
  if (!wrap || wrap._init) return;
  wrap._init = true;
  const vid = wrap.querySelector('video');
  if (!vid) return;
  vid.muted = state.globalMuted;
  const volIc = wrap.querySelector('.ic-vol'), mutedIc = wrap.querySelector('.ic-muted');
  if (volIc)   volIc.style.display   = state.globalMuted ? 'none' : '';
  if (mutedIc) mutedIc.style.display = state.globalMuted ? '' : 'none';
  vid.addEventListener('loadedmetadata', () => {
    const ratio = vid.videoWidth / vid.videoHeight;
    wrap.style.aspectRatio = ratio.toFixed(4);
  });
  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    const pct  = (vid.currentTime / vid.duration) * 100;
    const fill = wrap.querySelector('.vc-fill');
    const timeEl = wrap.querySelector('.vc-time');
    if (fill)   fill.style.width = pct + '%';
    if (timeEl) timeEl.textContent = fmtVidTime(vid.currentTime);
  });
  vid.addEventListener('ended', () => setPlayState(wrap, false));
  vid.addEventListener('play',  () => setPlayState(wrap, true));
  vid.addEventListener('pause', () => setPlayState(wrap, false));
}

/* ── FIX: event delegation orqali video tugmalari ────────────────────── */
export function toggleVidPlay(el) {
  const wrap = el.closest ? el.closest('.vid-wrap') : el;
  const vid  = wrap?.querySelector('video');
  if (!vid) return;
  if (vid.paused) {
    vid.muted = state.globalMuted;
    vid.play().catch(() => {});
  } else {
    vid.pause();
  }
}

export function seekVid(e, bar) {
  const wrap = bar.closest('.vid-wrap');
  const vid  = wrap?.querySelector('video');
  if (!vid || !vid.duration) return;
  const rect = bar.getBoundingClientRect();
  vid.currentTime = ((e.clientX - rect.left) / rect.width) * vid.duration;
}

export function toggleMute(wrap) {
  const vid = wrap?.querySelector('video');
  if (!vid) return;
  vid.muted = !vid.muted;
  state.globalMuted = vid.muted;
  const volIc   = wrap.querySelector('.ic-vol');
  const mutedIc = wrap.querySelector('.ic-muted');
  if (volIc)   volIc.style.display   = vid.muted ? 'none' : '';
  if (mutedIc) mutedIc.style.display = vid.muted ? '' : 'none';
  document.dispatchEvent(new CustomEvent('mutestatechange'));
}

export function reqFullscreen(wrap) {
  const vid = wrap?.querySelector('video');
  if (!vid) return;
  if (vid.requestFullscreen)            vid.requestFullscreen();
  else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
}

/* ── FIX: Event delegation — global onclick handler ─────────────────── */
document.addEventListener('click', e => {
  const wrap = e.target.closest('.vid-wrap');
  if (!wrap) return;
  if (e.target.closest('.vc-play') || e.target.closest('.vid-overlay')) {
    toggleVidPlay(wrap);
  } else if (e.target.closest('.vc-mute')) {
    toggleMute(wrap);
  } else if (e.target.closest('.vc-fs')) {
    reqFullscreen(wrap);
  }
});

document.addEventListener('click', e => {
  const bar = e.target.closest('.vc-progress');
  if (bar) seekVid(e, bar);
});

/* ── File download ────────────────────────────────────────────────────── */
export async function dlFile(url, name) {
  toast('Yuklanmoqda...', 'info', 8000);
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Tarmoq xatosi');
    const blob = await res.blob();
    const burl = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = burl;
    a.download = name || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(burl); a.remove(); }, 1000);
    toast('Yuklandi!', 'success');
  } catch {
    window.open(url, '_blank');
    toast('Yangi tabda ochildi', 'info');
  }
}

/* ── Zoom modal ───────────────────────────────────────────────────────── */
export function openZoom(url, type) {
  const im = $('zoomImg'), vd = $('zoomVideo');
  if (type === 'image') {
    im.style.display = 'block'; vd.style.display = 'none'; im.src = url;
  } else if (type === 'video') {
    im.style.display = 'none'; vd.style.display = 'block'; vd.src = url; vd.play().catch(() => {});
  } else { window.open(url,'_blank'); return; }
  $('zoomModal').classList.add('show');
}

$('zoomClose').onclick = () => { $('zoomVideo').pause(); $('zoomModal').classList.remove('show'); };
$('zoomModal').onclick = e => {
  if (e.target === $('zoomModal')) { $('zoomVideo').pause(); $('zoomModal').classList.remove('show'); }
};

/* ── FIX: Keyboard navigation — Escape tugmasi bilan overlay yopish ─── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.overlay.show, #zoomModal.show, #detailModal.show, #userProfileModal.show')
    .forEach(el => {
      const vid = el.querySelector('video');
      if (vid) vid.pause();
      el.classList.remove('show');
    });
  if (state) {
    state.currentViewingUserId    = null;
    state.currentViewingUserPosts = [];
  }
});

/* ── FIX: Offline/online holat xabarlari ─────────────────────────────── */
window.addEventListener('offline', () => toast('Internet aloqasi yo\'q', 'error', 5000));
window.addEventListener('online',  () => toast('Aloqa tiklandi', 'success'));
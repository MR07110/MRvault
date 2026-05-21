import { state }  from './config.js';
import { toast }  from './toast.js';

/* ── DOM / formatting helpers ─────────────────────────────────────────── */
export const $    = id => document.getElementById(id);
export const esc  = s  => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
export const fmt  = ts => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('en', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).format(d);
};
export const fmtSz  = b  => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';
export const initL  = n  => (n && n[0] ? n[0].toUpperCase() : 'U');
export const uToEmail = u => `${u.toLowerCase().replace(/[^a-z0-9]/g,'')}@mrtube.uz`;
export const clr    = n  => {
  const c = ['#4f8ef7','#3ecf8e','#e84057','#f5a623','#9b59b6','#1abc9c'];
  return c[Math.abs((n||'').length) % c.length];
};
export const defAvi = n => {
  const l = initL(n), c = clr(n);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='${encodeURIComponent(c)}' rx='50'/%3E%3Ctext x='50' y='68' text-anchor='middle' fill='white' font-size='44' font-weight='600' font-family='DM Sans,sans-serif'%3E${l}%3C/text%3E%3C/svg%3E`;
};

/* ── Confirm dialog ───────────────────────────────────────────────────── */
export function showConfirm(msg, onOk, title = 'Are you sure?') {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent   = msg;
  $('confirmOverlay').classList.add('show');
  const ok     = $('confirmOkBtn');
  const cancel = $('confirmCancelBtn');
  const close  = () => $('confirmOverlay').classList.remove('show');
  ok.onclick     = () => { close(); onOk(); };
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
  const vid = wrap.querySelector('video');
  if (vid._inited) return;
  vid._inited = true;
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

export function toggleVidPlay(el) {
  const wrap = el.closest ? el.closest('.vid-wrap') : el;
  const vid  = wrap.querySelector('video');
  if (!vid) return;
  if (vid.paused) {
    vid.muted = state.globalMuted;
    vid.play();
  } else {
    vid.pause();
  }
}
window.toggleVidPlay = toggleVidPlay;

export function seekVid(e, bar) {
  const wrap = bar.closest('.vid-wrap');
  const vid  = wrap.querySelector('video');
  if (!vid || !vid.duration) return;
  const rect = bar.getBoundingClientRect();
  vid.currentTime = ((e.clientX - rect.left) / rect.width) * vid.duration;
}
window.seekVid = seekVid;

export function toggleMute(wrap) {
  const vid = wrap.querySelector('video');
  if (!vid) return;
  vid.muted = !vid.muted;
  state.globalMuted = vid.muted;
  wrap.querySelector('.ic-vol').style.display   = vid.muted ? 'none' : '';
  wrap.querySelector('.ic-muted').style.display = vid.muted ? '' : 'none';
  // Notify ui to refresh mute buttons
  document.dispatchEvent(new CustomEvent('mutestatechange'));
}
window.toggleMute = toggleMute;

export function reqFullscreen(wrap) {
  const vid = wrap.querySelector('video');
  if (!vid) return;
  if (vid.requestFullscreen)        vid.requestFullscreen();
  else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
}
window.reqFullscreen = reqFullscreen;

/* ── File download ────────────────────────────────────────────────────── */
export async function dlFile(url, name) {
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
  } catch {
    window.open(url, '_blank');
    toast('Opened in new tab', 'info');
  }
}
window.dlFile = dlFile;

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
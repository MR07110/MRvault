import { ADMIN_EMAIL } from './config.js';

// Global mute state
let globalMuted = true;

export function getMuteState() { return globalMuted; }
export function setMuteState(state) { globalMuted = state; updateAllMuteButtons(); }

export function toggleGlobalMute() {
    globalMuted = !globalMuted;
    // Apply to all videos
    document.querySelectorAll('video').forEach(v => {
        if (!v.paused) v.muted = globalMuted;
    });
    updateAllMuteButtons();
}

export function updateAllMuteButtons() {
    const MUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
    const UNMUTE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
    
    const icon = globalMuted ? MUTE_SVG : UNMUTE_SVG;
    const tip = globalMuted ? 'Unmute' : 'Mute';
    
    const gb = document.getElementById('globalMuteBtn');
    const rb = document.getElementById('reelsMuteBtn');
    const sb = document.getElementById('sbMuteBtn');
    
    if (gb) { gb.innerHTML = icon; gb.title = tip; gb.classList.toggle('is-unmuted', !globalMuted); }
    if (rb) { rb.innerHTML = icon; rb.title = tip; rb.classList.toggle('is-unmuted', !globalMuted); }
    if (sb) { sb.innerHTML = icon + `<span>${tip}</span>`; sb.classList.toggle('is-unmuted', !globalMuted); }
}

export function initMuteSystem() {
    updateAllMuteButtons();
    window.toggleGlobalMute = toggleGlobalMute;
}

// Escape HTML
export const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// Format date
export const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

// Format file size
export const formatFileSize = (bytes) => {
    if (!bytes) return '';
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
};

// Default avatar
export const getDefaultAvatar = (name) => {
    const letter = (name && name[0]) ? name[0].toUpperCase() : 'U';
    const colors = ['#4f8ef7', '#3ecf8e', '#e84057', '#f5a623', '#9b59b6', '#1abc9c'];
    const color = colors[Math.abs((name || '').length) % colors.length];
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='${encodeURIComponent(color)}' rx='50'/%3E%3Ctext x='50' y='68' text-anchor='middle' fill='white' font-size='44' font-weight='600' font-family='DM Sans,sans-serif'%3E${letter}%3C/text%3E%3C/svg%3E`;
};

// Debounce
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if admin
export const isAdmin = (user) => user?.email === ADMIN_EMAIL;

// Show heart burst animation
export function showHeartBurst(x, y, container) {
    const el = document.createElement('div');
    el.className = 'heart-burst';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#f04060" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 900);
}
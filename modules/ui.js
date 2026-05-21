// Toast notifications
let toastTimeout = null;

export function showToast(message, type = 'info', duration = 2200) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = 'show';
    if (type) toast.classList.add(`toast-${type}`);
    
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.remove('toast-success', 'toast-error', 'toast-info');
    }, duration);
}

// Confirm modal
export function showConfirm(message, onConfirm, title = 'Are you sure?') {
    const overlay = document.getElementById('confirmOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMsg');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    
    titleEl.textContent = title;
    msgEl.textContent = message;
    overlay.classList.add('show');
    
    const close = () => overlay.classList.remove('show');
    const handleOk = () => { close(); if (onConfirm) onConfirm(); };
    const handleCancel = () => close();
    
    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
    
    // Cleanup old listeners
    const cleanup = () => {
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
    };
}

// Loading skeletons
export function showSkeletons(container, count = 3) {
    if (!container) return;
    const skeletons = Array.from({ length: count }, (_, i) => `
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
    container.innerHTML = skeletons;
}

// Hide splash screen
export function hideSplash() {
    const splash = document.getElementById('splash');
    if (splash) {
        splash.classList.add('out');
        setTimeout(() => splash.style.display = 'none', 400);
    }
}

// View switching
export function switchView(viewName, appState) {
    if (!appState) return;
    
    appState.currentView = viewName;
    
    // Pause all videos
    document.querySelectorAll('video').forEach(v => v.pause());
    
    // Update view visibility
    document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
    document.getElementById(`${viewName}View`)?.classList.add('on');
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn[data-v]').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.v === viewName);
    });
    
    // Update header visibility
    const isReels = viewName === 'reels';
    const header = document.getElementById('appHdr');
    const reelsMute = document.getElementById('reelsMuteBtn');
    if (header) header.style.display = isReels ? 'none' : 'flex';
    if (reelsMute) reelsMute.style.display = isReels ? 'flex' : 'none';
    
    window.scrollTo({ top: 0 });
}

export function initUI() {
    hideSplash();
    // Setup global click handlers for modals
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('show');
        });
    });
}
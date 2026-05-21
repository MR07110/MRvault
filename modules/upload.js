import { db, supabase, MAX_FILE_SIZE } from './config.js';
import { doc, getDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { showToast } from './ui.js';
import { formatFileSize } from './utils.js';

let currentUser = null;
let selectedFile = null;

export function setUploadUser(user) {
    currentUser = user;
}

export function initUpload() {
    const createBtn = document.getElementById('createBtn');
    const overlay = document.getElementById('uploadOverlay');
    const uploadDrop = document.getElementById('uploadDrop');
    const fileInput = document.getElementById('fileInput');
    const captionInput = document.getElementById('captionInput');
    const pubToggle = document.getElementById('pubToggle');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelUpload');
    const sizeWarn = document.getElementById('sizeWarn');
    const previewArea = document.getElementById('previewArea');
    const visDesc = document.getElementById('visDesc');
    
    if (!createBtn) return;
    
    createBtn.onclick = () => {
        resetUpload();
        overlay.classList.add('show');
    };
    
    if (uploadDrop) {
        uploadDrop.onclick = () => fileInput?.click();
    }
    
    if (fileInput) {
        fileInput.onchange = (e) => {
            if (e.target.files[0]) selectFile(e.target.files[0]);
        };
    }
    
    // Drag and drop
    if (uploadDrop) {
        uploadDrop.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDrop.style.borderColor = 'rgba(91,142,245,0.6)';
        });
        uploadDrop.addEventListener('dragleave', () => {
            uploadDrop.style.borderColor = '';
        });
        uploadDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDrop.style.borderColor = '';
            const file = e.dataTransfer.files[0];
            if (file) selectFile(file);
        });
    }
    
    // Paste from clipboard
    window.addEventListener('paste', (e) => {
        for (const item of (e.clipboardData?.items || [])) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    selectFile(file);
                    overlay.classList.add('show');
                }
                break;
            }
        }
    });
    
    // Toggle public/private
    if (pubToggle) {
        pubToggle.onchange = (e) => {
            const row = pubToggle.closest('.visibility-row');
            const label = row?.querySelector('.visibility-label');
            if (e.target.checked) {
                if (label) label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Public`;
                if (visDesc) visDesc.textContent = 'All logged-in users can see this';
                row?.classList.add('is-public');
            } else {
                if (label) label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Private`;
                if (visDesc) visDesc.textContent = 'Only you can see this';
                row?.classList.remove('is-public');
            }
        };
    }
    
    if (uploadBtn) {
        uploadBtn.onclick = () => uploadPost();
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            overlay.classList.remove('show');
            resetUpload();
        };
    }
    
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
                resetUpload();
            }
        };
    }
    
    function selectFile(file) {
        if (file.size > MAX_FILE_SIZE) {
            if (sizeWarn) sizeWarn.textContent = `File is ${formatFileSize(file.size)} — limit 50 MB`;
            showToast('File exceeds 50 MB', 'error');
            return;
        }
        
        if (sizeWarn) sizeWarn.textContent = '';
        selectedFile = file;
        if (uploadBtn) uploadBtn.disabled = false;
        if (previewArea) previewArea.style.display = 'block';
        
        if (file.type.startsWith('image')) {
            previewArea.innerHTML = `<div class="preview-wrap"><img src="${URL.createObjectURL(file)}"><button class="preview-clear" onclick="window.clearSelectedFile?.()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
        } else if (file.type.startsWith('video')) {
            previewArea.innerHTML = `<div class="preview-wrap"><video src="${URL.createObjectURL(file)}" controls style="max-height:150px;width:100%;border-radius:10px"></video><button class="preview-clear" onclick="window.clearSelectedFile?.()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
        } else {
            previewArea.innerHTML = `<div class="preview-file">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div><div style="font-size:13px;font-weight:500">${escapeHtml(file.name)}</div><div style="font-size:11px;color:var(--text3)">${formatFileSize(file.size)}</div></div>
                <button style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;display:flex;align-items:center" onclick="window.clearSelectedFile?.()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
        }
    }
    
    window.clearSelectedFile = () => {
        selectedFile = null;
        if (previewArea) previewArea.style.display = 'none';
        if (uploadBtn) uploadBtn.disabled = true;
        if (fileInput) fileInput.value = '';
    };
    
    function resetUpload() {
        selectedFile = null;
        if (fileInput) fileInput.value = '';
        if (previewArea) previewArea.style.display = 'none';
        if (captionInput) captionInput.value = '';
        if (pubToggle) pubToggle.checked = false;
        if (uploadBtn) uploadBtn.disabled = true;
        if (sizeWarn) sizeWarn.textContent = '';
        
        const row = document.getElementById('pubToggle')?.closest('.visibility-row');
        const label = row?.querySelector('.visibility-label');
        if (row && label) {
            label.innerHTML = `<svg class="vis-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Private`;
            if (visDesc) visDesc.textContent = 'Only you can see this';
            row.classList.remove('is-public');
        }
    }
    
    async function uploadPost() {
        if (!selectedFile || !currentUser) return;
        
        const btn = uploadBtn;
        btn.disabled = true;
        btn.textContent = 'Uploading...';
        
        try {
            const path = `posts/${currentUser.uid}/${Date.now()}_${selectedFile.name}`;
            const { data, error } = await supabase.storage.from('videos').upload(path, selectedFile);
            if (error) throw error;
            
            const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(data.path);
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            const userData = userDoc.data() || {};
            
            await addDoc(collection(db, 'posts'), {
                text: captionInput?.value.trim() || null,
                mediaUrl: publicUrl,
                mediaType: selectedFile.type,
                fileName: selectedFile.name,
                fileSize: selectedFile.size,
                isPublic: pubToggle?.checked || false,
                userId: currentUser.uid,
                userFullName: userData.fullName || currentUser.displayName || 'User',
                createdAt: serverTimestamp(),
                views: 0,
                likes: 0
            });
            
            showToast('Posted!', 'success');
            overlay.classList.remove('show');
            resetUpload();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Post';
        }
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
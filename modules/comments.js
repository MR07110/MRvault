import { db } from './config.js';
import { doc, getDoc, getDocs, collection, addDoc, deleteDoc, orderBy, query, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { escapeHtml, getDefaultAvatar } from './utils.js';
import { showToast } from './ui.js';
import { setCommentCount, getUserFromCache, setUserCache } from './cache.js';

let currentUser = null;
let currentPostId = null;

export function setCommentsUser(user) {
    currentUser = user;
}

export async function openCommentsModal(postId) {
    currentPostId = postId;
    const modal = document.getElementById('cmtModal');
    const list = document.getElementById('cmtModalList');
    const input = document.getElementById('cmtModalInput');
    const charCount = document.getElementById('cmtCharCount');
    
    // Show skeleton
    list.innerHTML = `
        <div class="cmt-skel-row"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:75%;height:9px;opacity:.6"></div></div></div>
        <div class="cmt-skel-row" style="animation-delay:60ms"><div class="skel skel-avi" style="width:32px;height:32px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-line" style="width:35%"></div><div class="skel skel-line" style="width:60%;height:9px;opacity:.6"></div></div></div>`;
    
    if (input) input.value = '';
    if (charCount) {
        charCount.textContent = '300';
        charCount.className = 'cmt-char-count';
    }
    
    modal.classList.add('show');
    
    // Show current user avatar
    if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data() || {};
        const avatar = userData.avatar || getDefaultAvatar(userData.fullName);
        const cmtMyAvi = document.getElementById('cmtMyAvi');
        if (cmtMyAvi) {
            cmtMyAvi.innerHTML = `<img src="${avatar}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        }
    }
    
    await loadComments(postId);
}

async function loadComments(postId) {
    const list = document.getElementById('cmtModalList');
    if (!list) return;
    
    const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(commentsQuery);
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Update cache
    setCommentCount(postId, comments.length);
    const ccSpan = document.getElementById(`cc-${postId}`);
    if (ccSpan) ccSpan.textContent = `${comments.length} comments`;
    
    if (!comments.length) {
        list.innerHTML = `<div class="cmt-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:8px">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            No comments yet
        </div>`;
        return;
    }
    
    // Load user avatars
    const uids = [...new Set(comments.map(c => c.userId))];
    for (const uid of uids) {
        if (!getUserFromCache(uid)) {
            const userDoc = await getDoc(doc(db, 'users', uid));
            const userData = userDoc.data() || {};
            setUserCache(uid, {
                fullName: userData.fullName,
                avatar: userData.avatar || getDefaultAvatar(userData.fullName)
            });
        }
    }
    
    list.innerHTML = comments.map(c => {
        const user = getUserFromCache(c.userId) || { fullName: 'User', avatar: getDefaultAvatar('U') };
        const canDelete = currentUser?.uid === c.userId || currentUser?.email === 'admin@gmail.com';
        return `<div class="cmt-row">
            <div class="cmt-avi user-avi-btn" data-uid="${c.userId}"><img src="${user.avatar}" onerror="this.style.display='none'"></div>
            <div class="cmt-body">
                <div class="cmt-name">${escapeHtml(c.userName)}</div>
                <div class="cmt-text">${escapeHtml(c.text)}</div>
            </div>
            ${canDelete ? `<button class="cmt-del" data-post="${postId}" data-cmt="${c.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
                </svg>
            </button>` : ''}
        </div>`;
    }).join('');
    
    // Add delete handlers
    list.querySelectorAll('.cmt-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            await deleteDoc(doc(db, 'posts', btn.dataset.post, 'comments', btn.dataset.cmt));
            await loadComments(btn.dataset.post);
            showToast('Comment deleted', 'success');
        });
    });
    
    // Add user profile click
    list.querySelectorAll('.user-avi-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.uid !== currentUser?.uid) {
                document.getElementById('cmtModal').classList.remove('show');
                import('./profile.js').then(({ openUserProfileModal }) => openUserProfileModal(btn.dataset.uid));
            }
        });
    });
    
    list.scrollTop = list.scrollHeight;
}

export async function sendComment() {
    const input = document.getElementById('cmtModalInput');
    const text = input?.value.trim();
    if (!text || !currentPostId || !currentUser) return;
    
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data() || {};
    
    await addDoc(collection(db, 'posts', currentPostId, 'comments'), {
        userId: currentUser.uid,
        userName: userData.fullName || currentUser.displayName || 'User',
        text: text,
        createdAt: serverTimestamp()
    });
    
    if (input) input.value = '';
    const charCount = document.getElementById('cmtCharCount');
    if (charCount) {
        charCount.textContent = '300';
        charCount.className = 'cmt-char-count';
    }
    
    await loadComments(currentPostId);
    showToast('Comment posted', 'success');
    
    // Update comment count in feed
    const ccSpan = document.getElementById(`cc-${currentPostId}`);
    if (ccSpan) {
        const current = parseInt(ccSpan.textContent) || 0;
        ccSpan.textContent = `${current + 1} comments`;
    }
}

export function initComments() {
    const sendBtn = document.getElementById('cmtModalSend');
    const input = document.getElementById('cmtModalInput');
    const closeBtn = document.getElementById('cmtModalClose');
    const modal = document.getElementById('cmtModal');
    const charCount = document.getElementById('cmtCharCount');
    
    if (sendBtn) {
        sendBtn.onclick = sendComment;
    }
    
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendComment();
            }
        });
        
        input.addEventListener('input', () => {
            const len = input.value.length;
            if (charCount) {
                charCount.textContent = 300 - len;
                charCount.className = 'cmt-char-count' + (len >= 270 ? (len >= 300 ? ' over' : ' warn') : '');
            }
        });
    }
    
    if (closeBtn) {
        closeBtn.onclick = () => modal?.classList.remove('show');
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }
}
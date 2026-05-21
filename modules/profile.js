import { db, supabase, ADMIN_EMAIL } from './config.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth } from './config.js';
import { escapeHtml, getDefaultAvatar, formatFileSize, formatDate } from './utils.js';
import { showToast, showConfirm } from './ui.js';
import { getUserFromCache, setUserCache } from './cache.js';
import { logout } from './auth.js';

let currentUser = null;
let allPosts = [];
let myFollowing = new Set();

export function setProfileUser(user, posts, following) {
    currentUser = user;
    allPosts = posts;
    myFollowing = following;
}

export async function renderProfile() {
    if (!currentUser) return;
    
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data() || {};
    const fullName = userData.fullName || currentUser.displayName || 'User';
    const avatar = userData.avatar || getDefaultAvatar(fullName);
    
    // Update UI
    const profileAvi = document.getElementById('profileAvi');
    if (profileAvi) {
        profileAvi.innerHTML = `<img src="${avatar}" onerror="this.style.display='none'"><div class="avi-edit-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>`;
    }
    
    const profileName = document.getElementById('profileName');
    const profileBio = document.getElementById('profileBio');
    if (profileName) profileName.textContent = fullName;
    if (profileBio) profileBio.textContent = userData.bio || '';
    
    const myPosts = allPosts.filter(p => p.userId === currentUser.uid);
    const totalLikes = myPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
    
    const statPosts = document.getElementById('statPosts');
    const statLikes = document.getElementById('statLikes');
    const statFollowers = document.getElementById('statFollowers');
    const statFollowing = document.getElementById('statFollowing');
    
    if (statPosts) statPosts.textContent = myPosts.length;
    if (statLikes) statLikes.textContent = totalLikes;
    if (statFollowers) statFollowers.textContent = (userData.followers || []).length;
    if (statFollowing) statFollowing.textContent = (userData.following || []).length;
    
    // Avatar click for upload
    if (profileAvi) {
        profileAvi.onclick = () => uploadAvatar();
    }
    
    renderProfileGrid(myPosts);
}

async function uploadAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please select an image', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('Avatar must be under 5 MB', 'error');
            return;
        }
        
        const path = `avatars/${currentUser.uid}/${Date.now()}`;
        const { data, error } = await supabase.storage.from('videos').upload(path, file, { upsert: true, contentType: file.type });
        
        if (error) {
            showToast('Error: ' + error.message, 'error');
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(data.path);
        await updateDoc(doc(db, 'users', currentUser.uid), { avatar: publicUrl });
        await updateProfile(currentUser, { photoURL: publicUrl });
        showToast('Avatar updated!', 'success');
        renderProfile();
    };
    input.click();
}

function renderProfileGrid(posts) {
    const grid = document.getElementById('profileGrid');
    if (!grid) return;
    
    if (!posts.length) {
        grid.innerHTML = `<div class="empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="opacity:.3;margin:0 auto 10px;display:block"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 9 4-4 4 4 4-4 4 4"/></svg>No posts yet</div>`;
        return;
    }
    
    grid.innerHTML = posts.map(post => {
        let content = '';
        if (post.mediaUrl && post.mediaType?.startsWith('image')) {
            content = `<img src="${escapeHtml(post.mediaUrl)}" loading="lazy">`;
        } else if (post.mediaUrl && post.mediaType?.startsWith('video')) {
            content = `<video src="${escapeHtml(post.mediaUrl)}" preload="metadata" muted></video>`;
        } else {
            content = `<div class="grid-cell-txt">${escapeHtml((post.text || post.fileName || '').substring(0, 60))}</div>`;
        }
        const isVideo = post.mediaType?.startsWith('video');
        
        return `<div class="grid-cell" data-id="${post.id}">
            ${content}
            ${isVideo ? `<div class="grid-play-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3z"/></svg></div>` : ''}
            <div class="grid-cell-overlay">
                <div class="grid-stat">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    ${post.likes || 0}
                </div>
                <div class="grid-stat">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    ${post.views || 0}
                </div>
            </div>
        </div>`;
    }).join('');
    
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.addEventListener('click', () => openPostDetail(cell.dataset.id));
    });
}

async function openPostDetail(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    const detailModal = document.getElementById('detailModal');
    const detailContent = document.getElementById('detailContent');
    
    // Show loading skeleton
    detailContent.innerHTML = `
        <div class="dm-handle"></div>
        <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px">
            <div style="width:38px;height:38px;border-radius:50%;background:var(--bg3);flex-shrink:0"></div>
            <div style="flex:1"><div style="height:12px;width:120px;background:var(--bg3);border-radius:4px;margin-bottom:6px"></div><div style="height:10px;width:80px;background:var(--bg3);border-radius:4px"></div></div>
        </div>
        <div style="width:100%;aspect-ratio:1;background:var(--bg3)"></div>
        <div style="height:60px"></div>`;
    detailModal.classList.add('show');
    
    // Load real data
    const [likeDoc, commentsSnap, userDoc] = await Promise.all([
        getDoc(doc(db, 'posts', postId, 'likes', currentUser.uid)),
        getDocs(collection(db, 'posts', postId, 'comments')),
        getDoc(doc(db, 'users', post.userId))
    ]);
    
    const isLiked = likeDoc.exists();
    const commentCount = commentsSnap.size;
    const userData = userDoc.data() || {};
    const userAvatar = userData.avatar || getDefaultAvatar(userData.fullName);
    const isOwn = post.userId === currentUser?.uid;
    
    let mediaHtml = '';
    if (post.mediaUrl && post.mediaType?.startsWith('image')) {
        mediaHtml = `<div class="dm-media"><img src="${escapeHtml(post.mediaUrl)}" loading="lazy"></div>`;
    } else if (post.mediaUrl && post.mediaType?.startsWith('video')) {
        mediaHtml = `<div class="dm-media"><div class="vid-wrap"><video src="${escapeHtml(post.mediaUrl)}" preload="metadata" playsinline></video><div class="vid-overlay" onclick="window.toggleVidPlay?.(this)"></div><div class="vid-controls"><button class="vc-play" onclick="window.toggleVidPlay?.(this.closest('.vid-wrap'))"><svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg><svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><div class="vc-progress" onclick="window.seekVid?.(event, this)"><div class="vc-bar"><div class="vc-fill"></div></div></div><span class="vc-time">0:00</span><button class="vc-mute" onclick="window.toggleMute?.(this.closest('.vid-wrap'))"><svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button><button class="vc-fs" onclick="window.reqFullscreen?.(this.closest('.vid-wrap'))"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div></div></div>`;
    }
    
    const likeFill = isLiked ? '#f04060' : 'none';
    const likeStroke = isLiked ? '#f04060' : 'currentColor';
    
    detailContent.innerHTML = `
        <div class="dm-handle"></div>
        <div class="dm-head">
            <div class="dm-avi${!isOwn ? ' dm-avi-link' : ''}" ${!isOwn ? `data-uid="${post.userId}"` : ''}>
                <img src="${userAvatar}" onerror="this.style.display='none'">
            </div>
            <div class="dm-meta">
                <div class="dm-name${!isOwn ? ' dm-name-link' : ''}" ${!isOwn ? `data-uid="${post.userId}"` : ''}>
                    ${escapeHtml(userData.fullName || 'Anonymous')}
                </div>
                <div class="dm-time">${formatDate(post.createdAt)}</div>
            </div>
            <button class="dm-close" id="dmClose"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        ${mediaHtml}
        ${post.text ? `<div class="dm-caption">${escapeHtml(post.text)}</div>` : ''}
        <div class="dm-stats">
            <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${post.views || 0}</span>
            <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="${likeFill}" stroke="${likeStroke}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span id="dmLikeCount">${post.likes || 0}</span></span>
            <span class="dm-stat-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ${commentCount}</span>
        </div>
        <div class="dm-actions">
            <button class="dm-act${isLiked ? ' liked' : ''}" id="dmLikeBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="${likeFill}" stroke="${likeStroke}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span class="dm-act-count" id="dmLikeCount2">${post.likes || 0}</span>
            </button>
            <button class="dm-act" id="dmCmtBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span class="dm-act-count">${commentCount}</span>
            </button>
            ${post.mediaUrl ? `<button class="dm-act" id="dmShareBtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>` : ''}
        </div>`;
    
    // Initialize video if present
    const videoWrap = detailContent.querySelector('.vid-wrap');
    if (videoWrap) {
        import('./feed.js').then(({ initVideoWrap }) => initVideoWrap(videoWrap));
    }
    
    // Close handler
    const closeDetail = () => {
        const video = detailContent.querySelector('video');
        if (video) video.pause();
        detailModal.classList.remove('show');
    };
    
    document.getElementById('dmClose').onclick = closeDetail;
    detailModal.onclick = (e) => { if (e.target === detailModal) closeDetail(); };
    
    // Like button
    document.getElementById('dmLikeBtn').onclick = async () => {
        await doDetailLike(postId);
        const updatedPost = await getDoc(doc(db, 'posts', postId));
        const newLikes = updatedPost.data()?.likes || 0;
        document.getElementById('dmLikeCount').textContent = newLikes;
        document.getElementById('dmLikeCount2').textContent = newLikes;
    };
    
    // Comment button
    document.getElementById('dmCmtBtn').onclick = () => {
        closeDetail();
        import('./comments.js').then(({ openCommentsModal }) => openCommentsModal(postId));
    };
    
    // Share button
    const shareBtn = document.getElementById('dmShareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            navigator.clipboard?.writeText(post.mediaUrl);
            showToast('Link copied', 'info');
        });
    }
    
    // User profile links
    detailContent.querySelectorAll('.dm-avi-link, .dm-name-link').forEach(el => {
        el.addEventListener('click', () => {
            closeDetail();
            openUserProfileModal(el.dataset.uid);
        });
    });
}

async function doDetailLike(postId) {
    const likeRef = doc(db, 'posts', postId, 'likes', currentUser.uid);
    const postRef = doc(db, 'posts', postId);
    const likeDoc = await getDoc(likeRef);
    const exists = likeDoc.exists();
    
    if (exists) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likes: increment(-1) });
    } else {
        await setDoc(likeRef, { userId: currentUser.uid, createdAt: new Date() });
        await updateDoc(postRef, { likes: increment(1) });
    }
}

export async function openUserProfileModal(uid) {
    if (!uid || uid === currentUser?.uid) return;
    
    const modal = document.getElementById('userProfileModal');
    const body = document.getElementById('upBody');
    modal.classList.add('show');
    body.innerHTML = '<div class="spin-wrap" style="padding-top:80px"><div class="spinner"></div></div>';
    
    const [userSnap, userPosts] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        Promise.resolve(allPosts.filter(p => p.userId === uid && p.isPublic === true))
    ]);
    
    const userData = userSnap.data() || {};
    const avatar = userData.avatar || getDefaultAvatar(userData.fullName);
    const totalLikes = userPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
    const followersCount = (userData.followers || []).length;
    const followingCount = (userData.following || []).length;
    const isFollowing = myFollowing.has(uid);
    
    const gridHtml = userPosts.length === 0
        ? '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text3);font-size:13px">No public posts</div>'
        : userPosts.map(post => {
            let content = '';
            if (post.mediaUrl && post.mediaType?.startsWith('image')) {
                content = `<img src="${escapeHtml(post.mediaUrl)}" loading="lazy">`;
            } else if (post.mediaUrl && post.mediaType?.startsWith('video')) {
                content = `<video src="${escapeHtml(post.mediaUrl)}" preload="metadata" muted></video>`;
            } else {
                content = `<div class="up-grid-cell-txt">${escapeHtml((post.text || post.fileName || '').substring(0, 40))}</div>`;
            }
            const isVideo = post.mediaType?.startsWith('video');
            return `<div class="up-grid-cell" data-id="${post.id}" data-uid="${uid}">
                ${content}
                ${isVideo ? `<div class="grid-play-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3z"/></svg></div>` : ''}
                <div class="up-grid-cell-overlay">
                    <div class="grid-stat"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ${post.likes || 0}</div>
                    <div class="grid-stat"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${post.views || 0}</div>
                </div>
            </div>`;
        }).join('');
    
    body.innerHTML = `
        <div class="up-cover"><div class="up-avi-wrap"><div class="up-avi"><img src="${avatar}" onerror="this.src='${getDefaultAvatar(userData.fullName)}'"></div></div></div>
        <div class="up-info">
            <div class="up-name">${escapeHtml(userData.fullName || 'Anonymous')}</div>
            ${userData.bio ? `<div class="up-bio">${escapeHtml(userData.bio)}</div>` : ''}
            <div class="up-stats">
                <div class="up-stat"><div class="up-stat-val">${userPosts.length}</div><div class="up-stat-lbl">posts</div></div>
                <div class="up-stat"><div class="up-stat-val">${totalLikes}</div><div class="up-stat-lbl">likes</div></div>
                <div class="up-stat"><div class="up-stat-val">${followersCount}</div><div class="up-stat-lbl">followers</div></div>
                <div class="up-stat"><div class="up-stat-val">${followingCount}</div><div class="up-stat-lbl">following</div></div>
            </div>
            <button class="up-follow-btn ${isFollowing ? 'is-following' : 'not-following'}" id="upFollowBtn" data-uid="${uid}">
                ${isFollowing ? 'Following' : 'Follow'}
            </button>
            <div class="up-posts-tab"><span class="up-posts-tab-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Posts</span></div>
            <div class="up-grid" id="upGrid">${gridHtml}</div>
        </div>`;
    
    const followBtn = document.getElementById('upFollowBtn');
    if (followBtn) {
        followBtn.onclick = async () => {
            const targetUid = followBtn.dataset.uid;
            if (myFollowing.has(targetUid)) {
                myFollowing.delete(targetUid);
                followBtn.className = 'up-follow-btn not-following';
                followBtn.textContent = 'Follow';
                await unfollowUser(targetUid);
            } else {
                myFollowing.add(targetUid);
                followBtn.className = 'up-follow-btn is-following';
                followBtn.textContent = 'Following';
                await followUser(targetUid);
            }
            // Update followers count
            const followersSpan = body.querySelector('.up-stat:nth-child(3) .up-stat-val');
            if (followersSpan) {
                const current = parseInt(followersSpan.textContent) || 0;
                followersSpan.textContent = myFollowing.has(targetUid) ? current + 1 : current - 1;
            }
        };
    }
    
    document.querySelectorAll('.up-grid-cell[data-id]').forEach(cell => {
        cell.addEventListener('click', () => openPostDetail(cell.dataset.id));
    });
}

async function followUser(uid) {
    await Promise.all([
        updateDoc(doc(db, 'users', currentUser.uid), { following: arrayUnion(uid) }),
        updateDoc(doc(db, 'users', uid), { followers: arrayUnion(currentUser.uid) })
    ]);
}

async function unfollowUser(uid) {
    await Promise.all([
        updateDoc(doc(db, 'users', currentUser.uid), { following: arrayRemove(uid) }),
        updateDoc(doc(db, 'users', uid), { followers: arrayRemove(currentUser.uid) })
    ]);
}

// Close modal
document.getElementById('upBack')?.addEventListener('click', () => {
    document.getElementById('userProfileModal').classList.remove('show');
});
document.getElementById('userProfileModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('userProfileModal')) {
        document.getElementById('userProfileModal').classList.remove('show');
    }
});

export function initProfile() {
    const editBtn = document.getElementById('editProfileBtn');
    const saveBtn = document.getElementById('saveProfileBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const overlay = document.getElementById('profileEditOverlay');
    
    if (editBtn) {
        editBtn.onclick = async () => {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            const data = userDoc.data() || {};
            document.getElementById('editName').value = data.fullName || '';
            document.getElementById('editBioInput').value = data.bio || '';
            overlay.classList.add('show');
        };
    }
    
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newName = document.getElementById('editName').value.trim();
            if (!newName) {
                showToast('Enter your name', 'error');
                return;
            }
            await updateDoc(doc(db, 'users', currentUser.uid), {
                fullName: newName,
                bio: document.getElementById('editBioInput').value.trim()
            });
            await updateProfile(currentUser, { displayName: newName });
            overlay.classList.remove('show');
            showToast('Profile updated', 'success');
            renderProfile();
        };
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = () => overlay.classList.remove('show');
    }
    
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            showConfirm('You will need to sign in again.', () => logout(), 'Sign out?');
        };
    }
    
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
    });
}
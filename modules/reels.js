import { db } from './config.js';
import { doc, getDoc, getDocs, collection, updateDoc, increment, setDoc, deleteDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { escapeHtml, getDefaultAvatar, showHeartBurst, getMuteState } from './utils.js';
import { showToast } from './ui.js';
import { getUserFromCache, setUserCache, hasViewedPost, markPostViewed } from './cache.js';
import { openCommentsModal } from './comments.js';

let allReels = [];
let currentUser = null;
let myLikedPosts = new Set();
let myFollowing = new Set();
let reelObserver = null;
let viewedReels = new Set();

export function setReelsUser(user) {
    currentUser = user;
}

export async function refreshReelsFollowing() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    myFollowing = new Set(snap.data()?.following || []);
}

export function setReelsData(posts) {
    if (!currentUser) return;
    allReels = posts.filter(p => 
        p.mediaUrl && 
        (p.mediaType?.startsWith('image') || p.mediaType?.startsWith('video')) &&
        (p.isPublic === true || p.userId === currentUser?.uid)
    );
}

async function loadReelsLikeStatus(reels) {
    if (!currentUser) return new Set();
    
    const unknown = reels.filter(r => !myLikedPosts.has(r.id));
    if (unknown.length) {
        const likeDocs = await Promise.all(unknown.map(r => getDoc(doc(db, 'posts', r.id, 'likes', currentUser.uid))));
        unknown.forEach((r, i) => {
            if (likeDocs[i].exists()) myLikedPosts.add(r.id);
        });
    }
    return new Set(reels.filter(r => myLikedPosts.has(r.id)).map(r => r.id));
}

async function loadReelsUserData(reels) {
    const uids = [...new Set(reels.map(r => r.userId))];
    const uncached = uids.filter(uid => !getUserFromCache(uid));
    
    if (uncached.length) {
        const docs = await Promise.all(uncached.map(uid => getDoc(doc(db, 'users', uid))));
        uncached.forEach((uid, i) => {
            const data = docs[i].data() || {};
            setUserCache(uid, {
                fullName: data.fullName || 'Anonymous',
                avatar: data.avatar || getDefaultAvatar(data.fullName)
            });
        });
    }
    
    const result = {};
    uids.forEach(uid => { result[uid] = getUserFromCache(uid); });
    return result;
}

async function loadReelsCommentCounts(reels) {
    const counts = {};
    for (const reel of reels) {
        const snap = await getDocs(collection(db, 'posts', reel.id, 'comments'));
        counts[reel.id] = snap.size;
    }
    return counts;
}

async function trackReelView(reelId, userId) {
    if (!userId || !reelId) return;
    if (hasViewedPost(userId, reelId)) return;
    
    markPostViewed(userId, reelId);
    
    try {
        await updateDoc(doc(db, 'posts', reelId), { views: increment(1) });
        const viewSpan = document.querySelector(`.reel[data-id="${reelId}"] .rvc-count`);
        if (viewSpan) {
            const cur = parseInt(viewSpan.textContent) || 0;
            viewSpan.textContent = `${cur + 1}`;
        }
    } catch (e) {}
}

export async function renderReels() {
    const container = document.getElementById('reelsWrap');
    if (!container || !currentUser) return;
    
    if (!allReels.length) {
        container.innerHTML = `<div class="empty" style="color:#fff;padding-top:50vh;text-align:center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" style="margin:0 auto 12px;display:block">
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4V8z"/>
            </svg>
            No reels yet
        </div>`;
        return;
    }
    
    const likedSet = await loadReelsLikeStatus(allReels);
    const userMap = await loadReelsUserData(allReels);
    const commentCounts = await loadReelsCommentCounts(allReels);
    
    let html = '';
    for (let idx = 0; idx < allReels.length; idx++) {
        const reel = allReels[idx];
        const user = userMap[reel.userId] || { fullName: 'Anonymous', avatar: getDefaultAvatar('U') };
        const liked = likedSet.has(reel.id);
        const isFollowing = myFollowing.has(reel.userId);
        const isMine = currentUser.uid === reel.userId;
        const eager = idx < 3;
        
        const mediaHtml = reel.mediaType?.startsWith('video')
            ? `<video src="${escapeHtml(reel.mediaUrl)}" loop playsinline preload="${eager ? 'auto' : 'none'}" muted="${getMuteState()}"></video>`
            : `<img src="${escapeHtml(reel.mediaUrl)}" loading="${eager ? 'eager' : 'lazy'}">`;
        
        const captionText = reel.text || '';
        const captionPreview = captionText.length > 80 ? captionText.substring(0, 80) : captionText;
        const hasMore = captionText.length > 80;
        
        html += `<div class="reel" data-id="${reel.id}" data-uid="${reel.userId}" data-idx="${idx}">
            ${mediaHtml}
            <div class="reel-grad"></div>
            <div class="reel-progress"><div class="reel-progress-track"><div class="reel-progress-fill" id="rp-${reel.id}"></div></div></div>
            <div class="reel-pause-icon" id="rpause-${reel.id}">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                    <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
            </div>
            <div class="reel-info">
                <div class="reel-user-row">
                    <div class="reel-avi${!isMine ? ' reel-avi-link' : ''}" ${!isMine ? `data-uid="${reel.userId}"` : ''}>
                        <img src="${user.avatar}" onerror="this.style.display='none'">
                    </div>
                    <span class="reel-uname${!isMine ? ' reel-uname-link' : ''}" ${!isMine ? `data-uid="${reel.userId}"` : ''}>
                        ${escapeHtml(user.fullName)}
                    </span>
                    ${!isMine ? `<button class="reel-follow${isFollowing ? ' following' : ''}" data-uid="${reel.userId}">${isFollowing ? 'Following' : 'Follow'}</button>` : ''}
                </div>
                ${captionText ? `<div class="reel-cap" data-full="${escapeHtml(captionText)}" data-postid="${reel.id}" data-uid="${reel.userId}">
                    ${escapeHtml(captionPreview)}${hasMore ? '<span class="reel-cap-more">...more</span>' : ''}
                </div>` : ''}
            </div>
            <div class="reel-side">
                <button class="reel-act${liked ? ' liked' : ''}" data-id="${reel.id}">
                    <svg viewBox="0 0 24 24" fill="${liked ? '#f04060' : 'none'}" stroke="${liked ? '#f04060' : 'rgba(255,255,255,0.9)'}" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <span class="rlc-${reel.id}">${reel.likes || 0}</span>
                </button>
                <button class="reel-act reel-cmt-btn" data-id="${reel.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span class="rcmt-${reel.id}">${commentCounts[reel.id] || 0}</span>
                </button>
                <button class="reel-act reel-share" data-url="${escapeHtml(reel.mediaUrl)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                </button>
                <button class="reel-act reel-dl" data-url="${escapeHtml(reel.mediaUrl)}" data-name="${escapeHtml(reel.fileName || 'media')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
                <div class="reel-act" style="cursor:default;pointer-events:none">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span class="rvc-count">${reel.views || 0}</span>
                </div>
            </div>
        </div>`;
    }
    
    container.innerHTML = html;
    bindReelEvents();
    setupReelObserver();
}

function bindReelEvents() {
    document.querySelectorAll('.reel-progress').forEach(bar => {
        const handleSeek = (clientX) => {
            const reel = bar.closest('.reel');
            const video = reel?.querySelector('video');
            if (!video || !video.duration) return;
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            video.currentTime = pct * video.duration;
            const fill = bar.querySelector('.reel-progress-fill');
            if (fill) fill.style.width = (pct * 100) + '%';
        };
        
        bar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            handleSeek(e.clientX);
            const onMove = (ev) => handleSeek(ev.clientX);
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        
        bar.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            handleSeek(e.touches[0].clientX);
            const onMove = (ev) => { ev.preventDefault(); handleSeek(ev.touches[0].clientX); };
            const onEnd = () => {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        });
    });
    
    document.querySelectorAll('.reel-act[data-id]:not(.reel-cmt-btn)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            doReelLike(btn.dataset.id, btn);
        });
    });
    
    document.querySelectorAll('.reel-cmt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCommentsModal(btn.dataset.id);
        });
    });
    
    document.querySelectorAll('.reel-share').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(btn.dataset.url);
            showToast('Link copied', 'info');
        });
    });
    
    document.querySelectorAll('.reel-dl').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.downloadFile) window.downloadFile(btn.dataset.url, btn.dataset.name);
        });
    });
    
    document.querySelectorAll('.reel-follow').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = btn.dataset.uid;
            if (myFollowing.has(uid)) {
                myFollowing.delete(uid);
                btn.className = 'reel-follow';
                btn.textContent = 'Follow';
                await unfollowUser(uid);
            } else {
                myFollowing.add(uid);
                btn.className = 'reel-follow following';
                btn.textContent = 'Following';
                await followUser(uid);
            }
            updateReelFollowButtons();
        });
    });
    
    document.querySelectorAll('.reel-avi-link, .reel-uname-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.dataset.uid !== currentUser?.uid) {
                import('./profile.js').then(({ openUserProfileModal }) => openUserProfileModal(el.dataset.uid));
            }
        });
    });
    
    document.querySelectorAll('.reel-cap').forEach(cap => {
        cap.addEventListener('click', (e) => {
            e.stopPropagation();
            const fullText = cap.dataset.full;
            if (!fullText || fullText.length <= 80) return;
            openReelCaptionSheet(cap.dataset.postid, cap.dataset.uid, fullText);
        });
    });
    
    document.querySelectorAll('.reel').forEach(reel => {
        let tapTimer = null;
        reel.addEventListener('click', (e) => {
            if (e.target.closest('.reel-side') || e.target.closest('.reel-follow') ||
                e.target.closest('.reel-cap') || e.target.closest('.reel-avi-link') ||
                e.target.closest('.reel-uname-link')) return;
            
            if (tapTimer) {
                clearTimeout(tapTimer);
                tapTimer = null;
                const rect = reel.getBoundingClientRect();
                showHeartBurst(e.clientX - rect.left, e.clientY - rect.top, reel);
                if (!myLikedPosts.has(reel.dataset.id)) {
                    const likeBtn = reel.querySelector('.reel-act[data-id]');
                    if (likeBtn) doReelLike(reel.dataset.id, likeBtn);
                }
            } else {
                tapTimer = setTimeout(() => {
                    tapTimer = null;
                    const video = reel.querySelector('video');
                    if (!video) return;
                    const pauseIcon = document.getElementById(`rpause-${reel.dataset.id}`);
                    if (video.paused) {
                        video.play().catch(() => {});
                        pauseIcon?.classList.remove('show');
                    } else {
                        video.pause();
                        pauseIcon?.classList.add('show');
                        setTimeout(() => pauseIcon?.classList.remove('show'), 900);
                    }
                }, 220);
            }
        });
    });
}

async function doReelLike(postId, btn) {
    if (!currentUser) return;
    
    const wasLiked = myLikedPosts.has(postId);
    const reel = allReels.find(r => r.id === postId);
    const currentLikes = reel?.likes || 0;
    const svg = btn.querySelector('svg');
    const countSpan = document.querySelector(`.rlc-${postId}`);
    
    if (wasLiked) {
        myLikedPosts.delete(postId);
        btn.classList.remove('liked');
        if (svg) { svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'rgba(255,255,255,0.9)'); }
        if (countSpan) countSpan.textContent = `${Math.max(0, currentLikes - 1)}`;
        if (reel) reel.likes = Math.max(0, currentLikes - 1);
    } else {
        myLikedPosts.add(postId);
        btn.classList.add('liked');
        if (svg) { svg.setAttribute('fill', '#f04060'); svg.setAttribute('stroke', '#f04060'); }
        if (countSpan) countSpan.textContent = `${currentLikes + 1}`;
        if (reel) reel.likes = currentLikes + 1;
        
        btn.classList.add('like-pop');
        setTimeout(() => btn.classList.remove('like-pop'), 400);
        
        const rect = btn.getBoundingClientRect();
        showHeartBurst(rect.width / 2, rect.height / 2, btn.parentElement || document.body);
    }
    
    const likeRef = doc(db, 'posts', postId, 'likes', currentUser.uid);
    const postRef = doc(db, 'posts', postId);
    
    try {
        if (wasLiked) {
            await Promise.all([deleteDoc(likeRef), updateDoc(postRef, { likes: increment(-1) })]);
        } else {
            await Promise.all([setDoc(likeRef, { userId: currentUser.uid, createdAt: new Date() }), updateDoc(postRef, { likes: increment(1) })]);
        }
    } catch (error) {}
}

async function followUser(uid) {
    await Promise.all([
        updateDoc(doc(db, 'users', currentUser.uid), { following: arrayUnion(uid) }),
        updateDoc(doc(db, 'users', uid), { followers: arrayUnion(currentUser.uid) })
    ]);
    showToast('Now following', 'success');
}

async function unfollowUser(uid) {
    await Promise.all([
        updateDoc(doc(db, 'users', currentUser.uid), { following: arrayRemove(uid) }),
        updateDoc(doc(db, 'users', uid), { followers: arrayRemove(currentUser.uid) })
    ]);
    showToast('Unfollowed', 'info');
}

function updateReelFollowButtons() {
    document.querySelectorAll('.reel-follow[data-uid]').forEach(btn => {
        const uid = btn.dataset.uid;
        const isFollowing = myFollowing.has(uid);
        btn.className = 'reel-follow' + (isFollowing ? ' following' : '');
        btn.textContent = isFollowing ? 'Following' : 'Follow';
    });
}

function openReelCaptionSheet(postId, uid, fullText) {
    const sheet = document.getElementById('reelCapSheet');
    const userRow = document.getElementById('rcapUserRow');
    const textEl = document.getElementById('rcapText');
    if (!sheet || !userRow || !textEl) return;
    
    const user = getUserFromCache(uid) || { fullName: 'Anonymous', avatar: getDefaultAvatar('U') };
    const isFollowing = myFollowing.has(uid);
    const isMine = currentUser?.uid === uid;
    
    userRow.innerHTML = `
        <div class="rcap-avi"><img src="${user.avatar}" onerror="this.style.display='none'"></div>
        <div style="flex:1"><div style="font-size:14px;font-weight:600">${escapeHtml(user.fullName)}</div></div>
        ${!isMine ? `<button class="rcap-follow ${isFollowing ? 'following' : ''}" id="rcapFollowBtn" data-uid="${uid}">${isFollowing ? 'Following' : 'Follow'}</button>` : ''}
    `;
    textEl.textContent = fullText;
    sheet.classList.add('show');
    
    const followBtn = document.getElementById('rcapFollowBtn');
    if (followBtn) {
        followBtn.onclick = async () => {
            const targetUid = followBtn.dataset.uid;
            if (myFollowing.has(targetUid)) {
                myFollowing.delete(targetUid);
                followBtn.className = 'rcap-follow';
                followBtn.textContent = 'Follow';
                await unfollowUser(targetUid);
            } else {
                myFollowing.add(targetUid);
                followBtn.className = 'rcap-follow following';
                followBtn.textContent = 'Following';
                await followUser(targetUid);
            }
            updateReelFollowButtons();
        };
    }
}

function setupReelObserver() {
    if (reelObserver) reelObserver.disconnect();
    
    reelObserver = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
            const video = entry.target.querySelector('video');
            
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                if (!viewedReels.has(entry.target.dataset.id) && currentUser) {
                    viewedReels.add(entry.target.dataset.id);
                    await trackReelView(entry.target.dataset.id, currentUser.uid);
                }
                
                if (video) {
                    video.muted = getMuteState();
                    video.play().catch(() => {});
                    
                    const reelId = entry.target.dataset.id;
                    video.ontimeupdate = () => {
                        const fill = document.getElementById(`rp-${reelId}`);
                        if (fill && video.duration) {
                            fill.style.width = `${(video.currentTime / video.duration) * 100}%`;
                        }
                    };
                    video.onended = () => {
                        const fill = document.getElementById(`rp-${reelId}`);
                        if (fill) fill.style.width = '0%';
                    };
                }
                
                const nextReel = entry.target.nextElementSibling;
                if (nextReel) {
                    const nextVideo = nextReel.querySelector('video');
                    if (nextVideo && nextVideo.preload === 'none') {
                        nextVideo.preload = 'auto';
                        nextVideo.load();
                    }
                }
            } else {
                if (video) {
                    video.pause();
                    video.ontimeupdate = null;
                    const fill = document.getElementById(`rp-${entry.target.dataset.id}`);
                    if (fill) fill.style.width = '0%';
                }
            }
        });
    }, { root: document.getElementById('reelsWrap'), threshold: 0.6 });
    
    document.querySelectorAll('.reel').forEach(reel => reelObserver.observe(reel));
}

export async function initReels() {
    if (window.appState?.allPosts) {
        setReelsData(window.appState.allPosts);
        await refreshReelsFollowing();
        await renderReels();
    }
}
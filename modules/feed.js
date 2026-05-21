import { db, ADMIN_EMAIL } from './config.js';
import { doc, collection, query, orderBy, onSnapshot, getDoc, setDoc, deleteDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { escapeHtml, formatDate, formatFileSize, showHeartBurst, getDefaultAvatar, getMuteState, setMuteState } from './utils.js';
import { showToast, showConfirm, showSkeletons } from './ui.js';
import { getUserFromCache, setUserCache, getCommentCount, setCommentCount, hasViewedPost, markPostViewed } from './cache.js';
import { openCommentsModal } from './comments.js';

let allPosts = [];
let feedUnsubscribe = null;
let currentUser = null;
let myLikedPosts = new Set();
let knownUnliked = new Set();
let myFollowing = new Set();
let viewObserver = null;

export function setCurrentUser(user) {
    currentUser = user;
}

export async function refreshMyFollowing() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    myFollowing = new Set(snap.data()?.following || []);
}

export function listenPosts(callback) {
    if (feedUnsubscribe) feedUnsubscribe();
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    feedUnsubscribe = onSnapshot(postsQuery, (snap) => {
        allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (window.appState) window.appState.allPosts = allPosts;
        if (callback) callback(allPosts);
    });
}

export function getFilteredPosts(searchQuery = '', tab = 'all') {
    let posts = [...allPosts];
    
    if (tab === 'mine') {
        posts = posts.filter(p => p.userId === currentUser?.uid);
    } else {
        posts = posts.filter(p => p.isPublic === true || p.userId === currentUser?.uid);
    }
    
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        posts = posts.filter(p =>
            (p.text || '').toLowerCase().includes(q) ||
            (p.userFullName || '').toLowerCase().includes(q)
        );
    }
    
    return posts;
}

export function getFollowingPosts(searchQuery = '') {
    let posts = allPosts.filter(p => myFollowing.has(p.userId) && p.isPublic === true);
    
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        posts = posts.filter(p =>
            (p.text || '').toLowerCase().includes(q) ||
            (p.userFullName || '').toLowerCase().includes(q)
        );
    }
    
    return posts;
}

async function loadUserData(uids) {
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

async function loadLikeStatus(posts) {
    if (!currentUser) return new Set();
    
    const unknown = posts.filter(p => !myLikedPosts.has(p.id) && !knownUnliked.has(p.id));
    if (unknown.length) {
        const likeDocs = await Promise.all(unknown.map(p => getDoc(doc(db, 'posts', p.id, 'likes', currentUser.uid))));
        unknown.forEach((p, i) => {
            if (likeDocs[i].exists()) myLikedPosts.add(p.id);
            else knownUnliked.add(p.id);
        });
    }
    return new Set(posts.filter(p => myLikedPosts.has(p.id)).map(p => p.id));
}

function buildMediaHtml(post) {
    if (!post.mediaUrl) return '';
    
    if (post.mediaType?.startsWith('image')) {
        return `<div class="post-media" data-id="${post.id}" data-type="image" data-url="${escapeHtml(post.mediaUrl)}"><img src="${escapeHtml(post.mediaUrl)}" loading="lazy"></div>`;
    }
    
    if (post.mediaType?.startsWith('video')) {
        return `<div class="post-media" data-id="${post.id}" data-type="video" data-url="${escapeHtml(post.mediaUrl)}">
            <div class="vid-wrap">
                <video src="${escapeHtml(post.mediaUrl)}" preload="metadata" playsinline></video>
                <div class="vid-overlay" onclick="window.toggleVidPlay?.(this)"></div>
                <div class="vid-controls">
                    <button class="vc-play" onclick="window.toggleVidPlay?.(this.closest('.vid-wrap'))">
                        <svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        <svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    </button>
                    <div class="vc-progress" onclick="window.seekVid?.(event, this)">
                        <div class="vc-bar"><div class="vc-fill"></div></div>
                    </div>
                    <span class="vc-time">0:00</span>
                    <button class="vc-mute" onclick="window.toggleMute?.(this.closest('.vid-wrap'))">
                        <svg class="ic-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                        <svg class="ic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    </button>
                    <button class="vc-fs" onclick="window.reqFullscreen?.(this.closest('.vid-wrap'))">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                </div>
            </div>
        </div>`;
    }
    
    return `<div class="file-card">
        <div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8ef5" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="file-info"><div class="file-name">${escapeHtml(post.fileName || 'File')}</div><div class="file-size">${formatFileSize(post.fileSize)}</div></div>
        <button class="file-dl" data-url="${escapeHtml(post.mediaUrl)}" data-name="${escapeHtml(post.fileName || 'file')}">Download</button>
    </div>`;
}

function buildCaptionHtml(text, postId) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (text.length <= 100) return `<div class="post-caption">${escaped}</div>`;
    const short = escapeHtml(text.substring(0, 100));
    return `<div class="post-caption cap-collapsed" data-postid="${postId}">
        <span class="cap-short">${short}<span class="cap-more">...more</span></span>
        <span class="cap-full">${escaped}<span class="cap-more">less</span></span>
    </div>`;
}

async function trackView(postId, userId) {
    if (!userId || !postId) return;
    if (hasViewedPost(userId, postId)) return;
    
    markPostViewed(userId, postId);
    
    try {
        await updateDoc(doc(db, 'posts', postId), { views: increment(1) });
        const statsEl = document.querySelector(`.post[data-id="${postId}"] .post-stats span:first-child`);
        if (statsEl) {
            const cur = parseInt(statsEl.textContent) || 0;
            statsEl.textContent = `${cur + 1} views`;
        }
    } catch (e) {}
}

export function setupViewObserver() {
    if (viewObserver) viewObserver.disconnect();
    
    viewObserver = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && currentUser) {
                const post = entry.target.closest('.post');
                if (post && post.dataset.id) {
                    await trackView(post.dataset.id, currentUser.uid);
                }
            }
        });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('.post').forEach(el => {
        if (el && el.dataset?.id) viewObserver.observe(el);
    });
}

export async function renderFeedTo(container, posts, limit = null) {
    if (!container || !currentUser) return;
    
    const displayPosts = limit ? posts.slice(0, limit) : posts;
    
    if (!displayPosts.length) {
        container.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><div>No posts yet</div></div>`;
        return;
    }
    
    const uids = [...new Set(displayPosts.map(p => p.userId))];
    const userMap = await loadUserData(uids);
    const likedSet = await loadLikeStatus(displayPosts);
    
    let html = '';
    for (const post of displayPosts) {
        const user = userMap[post.userId] || { fullName: 'Anonymous', avatar: getDefaultAvatar('U') };
        const liked = likedSet.has(post.id);
        const canDelete = currentUser.uid === post.userId || currentUser.email === ADMIN_EMAIL;
        const commentCount = getCommentCount(post.id);
        
        html += `<div class="post" data-id="${post.id}">
            <div class="post-head">
                <div class="avi user-avi-btn" data-uid="${post.userId}"><img src="${user.avatar}" onerror="this.style.display='none'"></div>
                <div class="post-meta user-avi-btn" data-uid="${post.userId}">
                    <div class="post-name">${escapeHtml(user.fullName)}</div>
                    <div class="post-time">${formatDate(post.createdAt)}</div>
                </div>
                ${canDelete ? `<button class="del-btn" data-id="${post.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
            </div>
            ${buildMediaHtml(post)}
            ${buildCaptionHtml(post.text, post.id)}
            <div class="post-stats">
                <span>${post.views || 0} views</span>
                <span id="lc-${post.id}">${post.likes || 0} likes</span>
                <span id="cc-${post.id}">${commentCount} comments</span>
            </div>
            <div class="post-actions">
                <button class="act-btn like-btn${liked ? ' liked' : ''}" data-id="${post.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="${liked ? '#f04060' : 'none'}" stroke="${liked ? '#f04060' : 'currentColor'}" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </button>
                <button class="act-btn cmt-open-btn" data-id="${post.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </button>
                ${post.mediaUrl ? `<button class="act-btn share-btn" data-url="${escapeHtml(post.mediaUrl)}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                </button>` : ''}
            </div>
        </div>`;
    }
    
    container.innerHTML = html;
    bindFeedEvents(container);
    setTimeout(() => setupViewObserver(), 100);
}

function bindFeedEvents(container) {
    container.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', () => doLike(btn.dataset.id, btn));
    });
    
    container.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', () => doDelete(btn.dataset.id));
    });
    
    container.querySelectorAll('.cmt-open-btn').forEach(btn => {
        btn.addEventListener('click', () => openCommentsModal(btn.dataset.id));
    });
    
    container.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard?.writeText(btn.dataset.url);
            showToast('Link copied', 'info');
        });
    });
    
    container.querySelectorAll('.user-avi-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.uid !== currentUser?.uid) {
                import('./profile.js').then(({ openUserProfileModal }) => openUserProfileModal(btn.dataset.uid));
            }
        });
    });
    
    container.querySelectorAll('.cap-more').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cap = btn.closest('.post-caption');
            cap.classList.toggle('cap-collapsed');
            cap.classList.toggle('cap-expanded');
        });
    });
    
    container.querySelectorAll('.vid-wrap').forEach(wrap => initVideoWrap(wrap));
    
    container.querySelectorAll('.post-media').forEach(media => {
        media.addEventListener('click', (e) => {
            if (e.target.closest('.file-dl') || e.target.closest('.vid-controls')) return;
            openMediaZoom(media.dataset.id);
        });
    });
    
    container.querySelectorAll('.file-dl').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.downloadFile(btn.dataset.url, btn.dataset.name);
        });
    });
}

export function initVideoWrap(wrap) {
    const video = wrap.querySelector('video');
    if (!video || video._inited) return;
    video._inited = true;
    
    video.muted = getMuteState();
    
    const volIcon = wrap.querySelector('.ic-vol');
    const mutedIcon = wrap.querySelector('.ic-muted');
    if (volIcon) volIcon.style.display = getMuteState() ? 'none' : '';
    if (mutedIcon) mutedIcon.style.display = getMuteState() ? '' : 'none';
    
    video.addEventListener('loadedmetadata', () => {
        const ratio = video.videoWidth / video.videoHeight;
        if (ratio && isFinite(ratio)) wrap.style.aspectRatio = ratio.toFixed(4);
    });
    
    video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        const pct = (video.currentTime / video.duration) * 100;
        const fill = wrap.querySelector('.vc-fill');
        const timeEl = wrap.querySelector('.vc-time');
        if (fill) fill.style.width = pct + '%';
        if (timeEl) timeEl.textContent = formatVideoTime(video.currentTime);
    });
    
    video.addEventListener('ended', () => setVideoPlayState(wrap, false));
    video.addEventListener('play', () => setVideoPlayState(wrap, true));
    video.addEventListener('pause', () => setVideoPlayState(wrap, false));
}

function formatVideoTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function setVideoPlayState(wrap, playing) {
    const playIcon = wrap.querySelector('.ic-play');
    const pauseIcon = wrap.querySelector('.ic-pause');
    if (playIcon) playIcon.style.display = playing ? 'none' : '';
    if (pauseIcon) pauseIcon.style.display = playing ? '' : 'none';
}

async function doLike(postId, btn) {
    if (!currentUser) return;
    
    const wasLiked = myLikedPosts.has(postId);
    const post = allPosts.find(p => p.id === postId);
    const currentLikes = post?.likes || 0;
    const svg = btn.querySelector('svg');
    const likesSpan = document.getElementById(`lc-${postId}`);
    
    if (wasLiked) {
        myLikedPosts.delete(postId);
        btn.classList.remove('liked');
        if (svg) { svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); }
        if (likesSpan) likesSpan.textContent = `${Math.max(0, currentLikes - 1)} likes`;
        if (post) post.likes = Math.max(0, currentLikes - 1);
    } else {
        myLikedPosts.add(postId);
        btn.classList.add('liked');
        if (svg) { svg.setAttribute('fill', '#f04060'); svg.setAttribute('stroke', '#f04060'); }
        if (likesSpan) likesSpan.textContent = `${currentLikes + 1} likes`;
        if (post) post.likes = currentLikes + 1;
        
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
    } catch (error) {
        console.error('Like error:', error);
    }
}

async function doDelete(postId) {
    showConfirm('This post will be permanently deleted.', async () => {
        await deleteDoc(doc(db, 'posts', postId));
        showToast('Post deleted', 'success');
    }, 'Delete post?');
}

function openMediaZoom(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    const zoomModal = document.getElementById('zoomModal');
    const zoomImg = document.getElementById('zoomImg');
    const zoomVideo = document.getElementById('zoomVideo');
    
    if (post.mediaType?.startsWith('image')) {
        zoomImg.style.display = 'block';
        zoomVideo.style.display = 'none';
        zoomImg.src = post.mediaUrl;
    } else if (post.mediaType?.startsWith('video')) {
        zoomImg.style.display = 'none';
        zoomVideo.style.display = 'block';
        zoomVideo.src = post.mediaUrl;
        zoomVideo.play().catch(() => {});
    } else {
        window.open(post.mediaUrl, '_blank');
        return;
    }
    
    zoomModal.classList.add('show');
}

export async function initFeed() {
    listenPosts(async () => {
        await refreshMyFollowing();
        await renderFeed();
    });
}

export async function renderFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;
    
    const appState = window.appState;
    if (!appState) return;
    
    const posts = getFilteredPosts(appState.searchQuery, appState.tab);
    const displayPosts = posts.slice(0, appState.visibleN);
    
    if (!feedContainer.querySelector('.post') && !feedContainer.querySelector('.skeleton-post')) {
        showSkeletons(feedContainer, 3);
    }
    
    await renderFeedTo(feedContainer, displayPosts);
    
    if (appState.visibleN < posts.length) {
        feedContainer.insertAdjacentHTML('beforeend', '<div class="spin-wrap"><div class="spinner"></div></div>');
    }
    
    setupInfiniteScroll();
}

export async function renderFollowingFeed() {
    const container = document.getElementById('followingFeed');
    if (!container) return;
    
    const appState = window.appState;
    const posts = getFollowingPosts(appState?.searchQuery);
    const displayPosts = posts.slice(0, appState?.visibleN || 8);
    
    if (!container.querySelector('.post') && !container.querySelector('.skeleton-post')) {
        showSkeletons(container, 2);
    }
    
    await renderFeedTo(container, displayPosts);
}

function setupInfiniteScroll() {
    const appState = window.appState;
    if (!appState) return;
    
    const handleScroll = () => {
        const maxPosts = appState.currentView === 'following' 
            ? getFollowingPosts(appState.searchQuery).length 
            : getFilteredPosts(appState.searchQuery, appState.tab).length;
        
        if (appState.loadingMore || appState.visibleN >= maxPosts) return;
        
        if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 400) {
            appState.loadingMore = true;
            setTimeout(() => {
                appState.visibleN = Math.min(appState.visibleN + 8, maxPosts);
                appState.loadingMore = false;
                if (appState.currentView === 'home') renderFeed();
                else if (appState.currentView === 'following') renderFollowingFeed();
            }, 300);
        }
    };
    
    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll);
}

export function loadViewedPostsFromStorage() {
    import('./cache.js').then(({ loadViewedFromStorage }) => loadViewedFromStorage());
}
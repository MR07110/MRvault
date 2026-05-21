// User cache
const userCache = new Map();
const commentCountCache = new Map();
const viewedPosts = new Map();

export function getUserFromCache(uid) {
    return userCache.get(uid);
}

export function setUserCache(uid, data) {
    userCache.set(uid, data);
}

export function getCommentCount(postId) {
    return commentCountCache.get(postId) || 0;
}

export function setCommentCount(postId, count) {
    commentCountCache.set(postId, count);
}

export function hasViewedPost(userId, postId) {
    return viewedPosts.has(`${userId}_${postId}`);
}

export function markPostViewed(userId, postId) {
    const key = `${userId}_${postId}`;
    if (!viewedPosts.has(key)) {
        viewedPosts.set(key, Date.now());
        saveViewedToStorage();
    }
}

function saveViewedToStorage() {
    try {
        const toStore = {};
        for (const [k, v] of viewedPosts.entries()) toStore[k] = v;
        localStorage.setItem('mrtube_viewed', JSON.stringify(toStore));
    } catch (e) {}
}

export function loadViewedFromStorage() {
    try {
        const stored = JSON.parse(localStorage.getItem('mrtube_viewed') || '{}');
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        for (const [key, time] of Object.entries(stored)) {
            if (now - time < THIRTY_DAYS) {
                viewedPosts.set(key, time);
            }
        }
        console.log(`📊 Loaded ${viewedPosts.size} viewed posts from cache`);
    } catch (e) {}
}

// Clear old cache entries
setInterval(() => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    for (const [key, time] of viewedPosts.entries()) {
        if (now - time > THIRTY_DAYS) {
            viewedPosts.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) saveViewedToStorage();
}, 24 * 60 * 60 * 1000); // Run once per day
// Main entry point - loads all modules
import './modules/config.js';
import { initAuthUI, onAuthStateChange } from './modules/auth.js';
import { initUI, showToast } from './modules/ui.js';
import { initFeed, setCurrentUser, loadViewedPostsFromStorage } from './modules/feed.js';
import { initReels } from './modules/reels.js';
import { initProfile } from './modules/profile.js';
import { initUpload } from './modules/upload.js';
import { initComments } from './modules/comments.js';
import { setMuteState, updateAllMuteButtons, toggleGlobalMute, initMuteSystem } from './modules/utils.js';

// Global state
window.appState = {
    currentUser: null,
    allPosts: [],
    myFollowing: new Set(),
    myLikedPosts: new Set(),
    knownUnliked: new Set(),
    globalMuted: true,
    currentView: 'home',
    visibleN: 8,
    loadingMore: false,
    searchQuery: '',
    tab: 'all'
};

// Initialize app
async function initApp() {
    console.log('🚀 Initializing MRtube...');
    
    loadViewedPostsFromStorage();
    initUI();
    initMuteSystem();
    initComments();
    initUpload();
    initAuthUI();  // <-- initAuthUI emas, initAuth
    
    // Auth state listener
    onAuthStateChange(async (user) => {
        window.appState.currentUser = user;
        setCurrentUser(user);
        
        if (user) {
            const loader = document.getElementById('authStateLoader');
            if (loader) loader.remove();
            const authWrap = document.getElementById('authWrap');
            const app = document.getElementById('app');
            if (authWrap) authWrap.classList.remove('show');
            if (app) app.classList.add('show');
            showToast(`Welcome back, ${user.displayName || 'User'}!`, 'success');
            
            await initFeed();
            await initReels();
            await initProfile();
            
            // Render home feed
            import('./modules/feed.js').then(({ renderFeed }) => renderFeed());
        } else {
            const app = document.getElementById('app');
            const authWrap = document.getElementById('authWrap');
            const loader = document.getElementById('authStateLoader');
            if (app) app.classList.remove('show');
            if (authWrap) authWrap.classList.add('show');
            if (loader) loader.remove();
        }
    });
}

// Start app
initApp();

// Global exports for HTML onclick handlers
window.toggleGlobalMute = toggleGlobalMute;
window.showToast = showToast;
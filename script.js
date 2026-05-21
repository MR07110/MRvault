// Main entry point - loads all modules
import './modules/config.js';
import { initAuth, onAuthStateChange } from './modules/auth.js';
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
    
    // Auth state listener
    onAuthStateChange(async (user) => {
        window.appState.currentUser = user;
        setCurrentUser(user);
        
        if (user) {
            document.getElementById('authStateLoader')?.remove();
            document.getElementById('authWrap').classList.remove('show');
            document.getElementById('app').classList.add('show');
            showToast(`Welcome back, ${user.displayName || 'User'}!`, 'success');
            
            await initFeed();
            await initReels();
            await initProfile();
            
            // Render home feed
            import('./modules/feed.js').then(({ renderFeed }) => renderFeed());
        } else {
            document.getElementById('app').classList.remove('show');
            document.getElementById('authWrap').classList.add('show');
            document.getElementById('authStateLoader')?.remove();
        }
    });
}

// Start app
initApp();

// Global exports for HTML onclick handlers
window.toggleGlobalMute = toggleGlobalMute;
window.showToast = showToast;
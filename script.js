import { initAuthUI, onAuthStateChange } from './modules/auth.js';
import { initUI, showToast, switchView } from './modules/ui.js';
import { initFeed, setCurrentUser, loadViewedPostsFromStorage, renderFeed, renderFollowingFeed } from './modules/feed.js';
import { initReels, renderReels } from './modules/reels.js';
import { initProfile, renderProfile } from './modules/profile.js';
import { initUpload } from './modules/upload.js';
import { initComments } from './modules/comments.js';
import { toggleGlobalMute, initMuteSystem } from './modules/utils.js';

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

window.toggleGlobalMute = toggleGlobalMute;
window.switchView = switchView;

async function initApp() {
    console.log('Initializing MRtube...');
    
    loadViewedPostsFromStorage();
    initUI();
    initMuteSystem();
    initComments();
    initUpload();
    initAuthUI();
    
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
            showToast('Welcome back, ' + (user.displayName || 'User') + '!', 'success');
            
            await initFeed();
            await initReels();
            await initProfile();
            
            renderFeed();
        } else {
            const app = document.getElementById('app');
            const authWrap = document.getElementById('authWrap');
            const loader = document.getElementById('authStateLoader');
            if (app) app.classList.remove('show');
            if (authWrap) authWrap.classList.add('show');
            if (loader) loader.remove();
        }
    });
    
    setupNavigation();
    setupSearch();
}

function setupNavigation() {
    const homeBtn = document.querySelector('.nav-btn[data-v="home"]');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            window.appState.currentView = 'home';
            window.appState.visibleN = 8;
            switchView('home', window.appState);
            renderFeed();
        });
    }
    
    const reelsBtn = document.querySelector('.nav-btn[data-v="reels"]');
    if (reelsBtn) {
        reelsBtn.addEventListener('click', () => {
            window.appState.currentView = 'reels';
            switchView('reels', window.appState);
            renderReels();
        });
    }
    
    const followingBtn = document.querySelector('.nav-btn[data-v="following"]');
    if (followingBtn) {
        followingBtn.addEventListener('click', () => {
            window.appState.currentView = 'following';
            window.appState.visibleN = 8;
            switchView('following', window.appState);
            renderFollowingFeed();
        });
    }
    
    const profileBtn = document.querySelector('.nav-btn[data-v="profile"]');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.appState.currentView = 'profile';
            switchView('profile', window.appState);
            renderProfile();
        });
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            window.appState.searchQuery = e.target.value;
            window.appState.visibleN = 8;
            clearTimeout(window._searchTimeout);
            window._searchTimeout = setTimeout(() => {
                if (window.appState.currentView === 'home') {
                    renderFeed();
                } else if (window.appState.currentView === 'following') {
                    renderFollowingFeed();
                }
            }, 300);
        });
    }
    
    const allTabs = document.querySelectorAll('.hdr-tab[data-tab="all"], .sb-tab[data-stab="all"]');
    const mineTabs = document.querySelectorAll('.hdr-tab[data-tab="mine"], .sb-tab[data-stab="mine"]');
    
    allTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            window.appState.tab = 'all';
            window.appState.visibleN = 8;
            document.querySelectorAll('.hdr-tab, .sb-tab').forEach(t => t.classList.remove('on'));
            tab.classList.add('on');
            if (window.appState.currentView === 'home') renderFeed();
        });
    });
    
    mineTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            window.appState.tab = 'mine';
            window.appState.visibleN = 8;
            document.querySelectorAll('.hdr-tab, .sb-tab').forEach(t => t.classList.remove('on'));
            tab.classList.add('on');
            if (window.appState.currentView === 'home') renderFeed();
        });
    });
}

initApp().catch(console.error);
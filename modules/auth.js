import { auth, usernameToEmail, ADMIN_EMAIL } from './config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut, 
    onAuthStateChanged, 
    updateProfile 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './config.js';
import { getDefaultAvatar, escapeHtml } from './utils.js';
import { showToast } from './ui.js';

let authStateChangeCallback = null;

export function onAuthStateChange(callback) {
    authStateChangeCallback = callback;
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Ensure user document exists
            const userRef = doc(db, 'users', user.uid);
            const snap = await getDoc(userRef);
            if (!snap.exists()) {
                await setDoc(userRef, {
                    uid: user.uid,
                    username: user.email?.split('@')[0] || user.uid.slice(0, 8),
                    fullName: user.displayName || 'User',
                    email: user.email,
                    avatar: getDefaultAvatar(user.displayName || 'U'),
                    bio: '',
                    followers: [],
                    following: [],
                    createdAt: serverTimestamp()
                });
            }
        }
        if (callback) callback(user);
    });
}

export async function signIn(username, password) {
    try {
        const email = usernameToEmail(username);
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Signed in successfully!', 'success');
        return true;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

export async function signUp(username, password, fullName, confirmPassword) {
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return false;
    }
    try {
        const email = usernameToEmail(username);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: fullName });
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            username: username,
            fullName: fullName,
            email: email,
            bio: '',
            avatar: getDefaultAvatar(fullName),
            followers: [],
            following: [],
            createdAt: serverTimestamp()
        });
        showToast('Account created!', 'success');
        return true;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

export async function logout() {
    await signOut(auth);
    showToast('Signed out', 'info');
}

export function getCurrentUser() {
    return auth.currentUser;
}

// Setup auth UI - BU FUNKSIYA MAVJUDLIGINI TEKSHIRING
export function initAuthUI() {
    console.log('initAuthUI called');
    const authBtn = document.getElementById('authBtn');
    const authSwitchBtn = document.getElementById('authSwitchBtn');
    const nameRow = document.getElementById('nameRow');
    const confirmRow = document.getElementById('confirmRow');
    const authTitle = document.getElementById('authTitle');
    const authSwitchText = document.getElementById('authSwitchText');
    const authErr = document.getElementById('authErr');
    
    if (!authBtn || !authSwitchBtn) {
        console.error('Auth elements not found!');
        return;
    }
    
    let isLogin = true;
    
    authSwitchBtn.onclick = () => {
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Sign in to your account' : 'Create an account';
        authBtn.textContent = isLogin ? 'Sign in' : 'Sign up';
        authSwitchText.textContent = isLogin ? 'No account? ' : 'Have an account? ';
        authSwitchBtn.textContent = isLogin ? 'Sign up' : 'Sign in';
        if (nameRow) nameRow.style.display = isLogin ? 'none' : 'block';
        if (confirmRow) confirmRow.style.display = isLogin ? 'none' : 'block';
        if (authErr) authErr.textContent = '';
    };
    
    authBtn.onclick = async () => {
        const username = document.getElementById('aUsername')?.value.trim();
        const password = document.getElementById('aPassword')?.value;
        
        if (!username || username.length < 3) {
            if (authErr) authErr.textContent = 'Username must be at least 3 characters';
            return;
        }
        if (!password || password.length < 6) {
            if (authErr) authErr.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        if (authErr) authErr.textContent = '';
        
        if (isLogin) {
            await signIn(username, password);
        } else {
            const fullName = document.getElementById('aFullname')?.value.trim();
            const confirm = document.getElementById('aConfirm')?.value;
            if (!fullName) {
                if (authErr) authErr.textContent = 'Enter your name';
                return;
            }
            await signUp(username, password, fullName, confirm);
        }
    };
    
    // Enter key support
    ['aUsername', 'aPassword', 'aConfirm', 'aFullname'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && authBtn) authBtn.click();
            });
        }
    });
}
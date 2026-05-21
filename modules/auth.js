import { auth, db, state }             from './config.js';
import { $, esc, defAvi, uToEmail }    from './utils.js';
import { toast }                       from './toast.js';
import { userCache }                   from './cache.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
  updateProfile as fbUpdateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, setDoc, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── Render callbacks injected by script.js ──────────────────────────── */
let _cb = {};
export function setRenderCallbacks(callbacks) {
  _cb = callbacks;
}

/* ── Auth form state ─────────────────────────────────────────────────── */
let isLogin = true;

$('authSwitchBtn').onclick = () => {
  isLogin = !isLogin;
  $('authTitle').textContent      = isLogin ? 'Sign in to your account' : 'Create an account';
  $('authBtn').textContent        = isLogin ? 'Sign in' : 'Sign up';
  $('authSwitchText').textContent = isLogin ? 'No account? ' : 'Have an account? ';
  $('authSwitchBtn').textContent  = isLogin ? 'Sign up' : 'Sign in';
  $('nameRow').style.display      = isLogin ? 'none' : 'block';
  $('confirmRow').style.display   = isLogin ? 'none' : 'block';
  $('authErr').textContent = '';
};

$('authBtn').onclick = async () => {
  const u = $('aUsername').value.trim(), p = $('aPassword').value, e = $('authErr');
  if (!u || u.length < 3) { e.textContent = 'Username must be at least 3 characters'; return; }
  if (!p || p.length < 6) { e.textContent = 'Password must be at least 6 characters'; return; }
  e.textContent = '';
  try {
    if (isLogin) {
      await signInWithEmailAndPassword(auth, uToEmail(u), p);
    } else {
      const fn = $('aFullname').value.trim(), c = $('aConfirm').value;
      if (!fn) { e.textContent = 'Enter your name'; return; }
      if (p !== c) { e.textContent = 'Passwords do not match'; return; }
      const cr = await createUserWithEmailAndPassword(auth, uToEmail(u), p);
      await fbUpdateProfile(cr.user, { displayName: fn });
      await setDoc(doc(db,'users',cr.user.uid), {
        uid: cr.user.uid, username: u, fullName: fn,
        email: uToEmail(u), bio: '', avatar: defAvi(fn),
        followers: [], following: [], createdAt: serverTimestamp()
      });
      toast('Account created!', 'success');
    }
  } catch(err) { e.textContent = err.message; }
};

['aUsername','aPassword','aConfirm'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('keydown', ev => { if (ev.key === 'Enter') $('authBtn').click(); });
});

/* ── Auth state observer ─────────────────────────────────────────────── */
onAuthStateChanged(auth, async user => {
  $('authStateLoader')?.remove();
  if (user) {
    state.me = user;
    $('authWrap').classList.remove('show');
    $('app').classList.add('show');
    const ref  = doc(db,'users',user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        username: user.email?.split('@')[0] || user.uid.slice(0,8),
        fullName: user.displayName || 'User',
        email: user.email,
        avatar: defAvi(user.displayName || 'U'),
        bio: '', followers: [], following: [],
        createdAt: serverTimestamp()
      });
    }
    await refreshMyFollowing();
    listenPosts();
  } else {
    state.me = null;
    $('app').classList.remove('show');
    $('authWrap').classList.add('show');
  }
});

/* ── Following helpers ───────────────────────────────────────────────── */
export async function refreshMyFollowing() {
  if (!state.me) return;
  const snap = await getDoc(doc(db,'users',state.me.uid));
  state.myFollowing = new Set(snap.data()?.following || []);
}

/* ── Live posts listener ─────────────────────────────────────────────── */
export function listenPosts() {
  onSnapshot(
    query(collection(db,'posts'), orderBy('createdAt','desc')),
    snap => {
      const newPosts  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const newIds    = newPosts.map(p => p.id).join(',');
      const structural = newIds !== state._lastPostIds;
      state._lastPostIds = newIds;
      state.allPosts     = newPosts;

      if (structural) {
        if (state.view === 'home')      _cb.renderFeed?.();
        if (state.view === 'following') _cb.renderFollowing?.();
        if (state.view === 'reels')     _cb.renderReels?.();
        if (state.view === 'profile')   _cb.renderProfile?.();
        if (state.currentViewingUserId) {
          const modal = document.getElementById('userProfileModal');
          if (modal?.classList.contains('show')) _cb.renderUserProfileModal?.(state.currentViewingUserId);
        }
      } else {
        _cb.patchCounts?.(newPosts);
      }
    }
  );
}

/* ── Follow / Unfollow ───────────────────────────────────────────────── */
export async function follow(uid) {
  await Promise.all([
    updateDoc(doc(db,'users',state.me.uid), { following: arrayUnion(uid) }),
    updateDoc(doc(db,'users',uid),          { followers: arrayUnion(state.me.uid) })
  ]);
  state.myFollowing.add(uid);
  toast('Now following', 'success');
}

export async function unfollow(uid) {
  await Promise.all([
    updateDoc(doc(db,'users',state.me.uid), { following: arrayRemove(uid) }),
    updateDoc(doc(db,'users',uid),          { followers: arrayRemove(state.me.uid) })
  ]);
  state.myFollowing.delete(uid);
  toast('Unfollowed', 'info');
}

/* ── Profile edit / logout ───────────────────────────────────────────── */
$('editProfileBtn').onclick = async () => {
  const d = (await getDoc(doc(db,'users',state.me.uid))).data() || {};
  $('editName').value     = d.fullName || '';
  $('editBioInput').value = d.bio || '';
  $('profileEditOverlay').classList.add('show');
};

$('saveProfileBtn').onclick = async () => {
  const fn = $('editName').value.trim();
  if (!fn) { toast('Enter your name', 'error'); return; }
  await updateDoc(doc(db,'users',state.me.uid), { fullName: fn, bio: $('editBioInput').value.trim() });
  await fbUpdateProfile(state.me, { displayName: fn });
  userCache.delete(state.me.uid);
  $('profileEditOverlay').classList.remove('show');
  toast('Profile updated', 'success');
  _cb.renderProfile?.();
};

$('cancelEditBtn').onclick = () => $('profileEditOverlay').classList.remove('show');
$('logoutBtn').onclick = async () => {
  const { showConfirm } = await import('./utils.js');
  showConfirm('You will need to sign in again.', () => signOut(auth), 'Sign out?');
};
$('profileEditOverlay').onclick = e => {
  if (e.target === $('profileEditOverlay')) $('profileEditOverlay').classList.remove('show');
};
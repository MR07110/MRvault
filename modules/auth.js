import { auth, db, state, ADMIN_UIDS }             from './config.js';
import { $, esc, defAvi, uToEmail, validateUsername } from './utils.js';
import { toast }                                   from './toast.js';
import { userCache }                               from './cache.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
  updateProfile as fbUpdateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, setDoc, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove, where, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/* ── FIX: Firebase xato kodlarini o'zbek tiliga tarjima ─────────────── */
const AUTH_ERRORS = {
  'auth/user-not-found':         'Bunday foydalanuvchi topilmadi',
  'auth/wrong-password':         'Parol noto\'g\'ri',
  'auth/invalid-credential':     'Username yoki parol noto\'g\'ri',
  'auth/email-already-in-use':   'Bu username allaqachon band',
  'auth/weak-password':          'Parol kamida 6 ta belgi bo\'lsin',
  'auth/too-many-requests':      'Juda ko\'p urinish. Biroz kuting',
  'auth/network-request-failed': 'Internet aloqasi yo\'q',
  'auth/user-disabled':          'Bu akkaunt bloklangan',
};

function authErrMsg(err) {
  return AUTH_ERRORS[err.code] || 'Xatolik yuz berdi. Qayta urinib ko\'ring';
}

/* ── Admin tekshiruvi (UID asosida, email emas) ──────────────────────── */
export function isAdmin(uid) {
  return ADMIN_UIDS.has(uid);
}

/* ── Render callbacks injected by script.js ──────────────────────────── */
let _cb = {};
export function setRenderCallbacks(callbacks) {
  _cb = callbacks;
}

/* ── Auth form state ─────────────────────────────────────────────────── */
let isLogin = true;

$('authSwitchBtn').onclick = () => {
  isLogin = !isLogin;
  $('authTitle').textContent      = isLogin ? 'Tizimga kirish' : 'Akkaunt yaratish';
  $('authBtn').textContent        = isLogin ? 'Kirish' : 'Ro\'yxatdan o\'tish';
  $('authSwitchText').textContent = isLogin ? 'Akkaunt yo\'qmi? ' : 'Akkaunt bormi? ';
  $('authSwitchBtn').textContent  = isLogin ? 'Ro\'yxatdan o\'ting' : 'Kirish';
  $('nameRow').style.display      = isLogin ? 'none' : 'block';
  $('confirmRow').style.display   = isLogin ? 'none' : 'block';
  $('authErr').textContent = '';
};

$('authBtn').onclick = async () => {
  const u = $('aUsername').value.trim();
  const p = $('aPassword').value;
  const e = $('authErr');
  e.textContent = '';

  /* FIX: validateUsername funksiyasi bilan qat'iy tekshiruv */
  const uErr = validateUsername(u);
  if (uErr) { e.textContent = uErr; return; }
  if (!p || p.length < 6) { e.textContent = 'Parol kamida 6 ta belgi bo\'lsin'; return; }

  $('authBtn').disabled = true;
  $('authBtn').textContent = isLogin ? 'Kirilmoqda...' : 'Yaratilmoqda...';

  try {
    if (isLogin) {
      await signInWithEmailAndPassword(auth, uToEmail(u), p);
    } else {
      const fn = $('aFullname').value.trim();
      const c  = $('aConfirm').value;
      if (!fn) { e.textContent = 'Ismingizni kiriting'; return; }
      if (p !== c) { e.textContent = 'Parollar mos emas'; return; }

      /* FIX: Username band ekanligini tekshirish */
      const existing = await getDocs(query(collection(db,'users'), where('username','==', u)));
      if (!existing.empty) { e.textContent = 'Bu username allaqachon band'; return; }

      const cr = await createUserWithEmailAndPassword(auth, uToEmail(u), p);
      await fbUpdateProfile(cr.user, { displayName: fn });
      await setDoc(doc(db,'users',cr.user.uid), {
        uid: cr.user.uid, username: u, fullName: fn,
        email: uToEmail(u), bio: '', avatar: defAvi(fn),
        followers: [], following: [], createdAt: serverTimestamp()
      });
      toast('Akkaunt yaratildi!', 'success');
    }
  } catch(err) {
    e.textContent = authErrMsg(err);
  } finally {
    $('authBtn').disabled = false;
    $('authBtn').textContent = isLogin ? 'Kirish' : 'Ro\'yxatdan o\'tish';
  }
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
  toast('Kuzatilmoqda', 'success');
}

export async function unfollow(uid) {
  await Promise.all([
    updateDoc(doc(db,'users',state.me.uid), { following: arrayRemove(uid) }),
    updateDoc(doc(db,'users',uid),          { followers: arrayRemove(state.me.uid) })
  ]);
  state.myFollowing.delete(uid);
  toast('Kuzatish bekor qilindi', 'info');
}

/* ── Profile edit / logout ───────────────────────────────────────────── */
$('editProfileBtn').onclick = async () => {
  const d = (await getDoc(doc(db,'users',state.me.uid))).data() || {};
  $('editName').value    = d.fullName || '';
  $('editBioInput').value = d.bio || '';
  $('profileEditOverlay').classList.add('show');
};

$('saveProfileBtn').onclick = async () => {
  const fn = $('editName').value.trim();
  if (!fn) { toast('Ismingizni kiriting', 'error'); return; }
  await updateDoc(doc(db,'users',state.me.uid), { fullName: fn, bio: $('editBioInput').value.trim() });
  await fbUpdateProfile(state.me, { displayName: fn });
  userCache.delete(state.me.uid);
  $('profileEditOverlay').classList.remove('show');
  toast('Profil yangilandi', 'success');
  _cb.renderProfile?.();
};

$('cancelEditBtn').onclick = () => $('profileEditOverlay').classList.remove('show');
$('logoutBtn').onclick = async () => {
  const { showConfirm } = await import('./utils.js');
  showConfirm('Tizimdan chiqasizmi?', () => signOut(auth), 'Chiqish');
};
$('profileEditOverlay').onclick = e => {
  if (e.target === $('profileEditOverlay')) $('profileEditOverlay').classList.remove('show');
};
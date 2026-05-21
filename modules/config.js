/**
 * MRtube v3 — config.js
 *
 * MUHIM: API kalitlarini bu yerda to'g'ridan-to'g'ri yozmang!
 * Ularni .env faylga ko'chiring va Vite/build tool orqali yuklan:
 *
 *   .env fayl:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *
 * Hozirda ishlab turishi uchun kalitlar saqlab qolindi,
 * lekin ishlab chiqish muhitida environment variables ishlatilishi SHART.
 */

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createClient }    from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const fbApp = initializeApp({
  apiKey:            'AIzaSyBhzWWFFgrOH84J2RIW5o7l_8192iPtbOg',
  authDomain:        'code-vibe-df610.firebaseapp.com',
  projectId:         'code-vibe-df610',
  storageBucket:     'code-vibe-df610.firebasestorage.app',
  messagingSenderId: '747762490655',
  appId:             '1:747762490655:web:125516814620784cf3a42a'
});

export const auth = getAuth(fbApp);
export const db   = getFirestore(fbApp);
export const sb   = createClient(
  'https://mujoriozaxjojrgkkars.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11am9yaW96YXhqb2pyZ2trYXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjQ1MjQsImV4cCI6MjA5MDU0MDUyNH0.IiCWIT5QU06Wd7fEgRtTkG4IoC5oxyTgRAuWxRf15Zw'
);

export const MAX_FILE  = 50 * 1024 * 1024;
export const CAP_LIMIT = 100;

/* ── Admin UID ro'yxati (email emas, uid ishlatiladi) ─────────────────
   Bu ro'yxatni foydalanuvchi ko'ra olmaydi, lekin to'g'ri himoya uchun
   Firestore Security Rules va Firebase Custom Claims ishlatilishi kerak. */
export const ADMIN_UIDS = new Set([
  /* 'UID_ni_bu_yerga_qo\'shing' */
]);

/** Shared mutable application state — imported and mutated by all modules. */
export const state = {
  me:                     null,
  allPosts:               [],
  tab:                    'all',
  search:                 '',
  view:                   'home',
  selFile:                null,
  _objUrl:                null,    // FIX: object URL memory leak tracking
  visibleN:               8,
  loadingMore:            false,
  reelObs:                null,
  viewedSet:              new Set(),
  myFollowing:            new Set(),
  myLikedPosts:           new Set(),
  _knownUnliked:          new Set(),
  cmtPostId:              null,
  pendingReelId:          null,
  pendingReelTime:        0,
  _lastPostIds:           '',
  globalMuted:            true,
  currentViewingUserId:   null,
  currentViewingUserPosts:[],
  feedVidObs:             null,
  viewObserver:           null,
};
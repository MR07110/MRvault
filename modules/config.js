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

/** Shared mutable application state — imported and mutated by all modules. */
export const state = {
  me:                     null,
  allPosts:               [],
  tab:                    'all',
  search:                 '',
  view:                   'home',
  selFile:                null,
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
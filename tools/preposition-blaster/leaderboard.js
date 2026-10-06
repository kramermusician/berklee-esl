/*
 * Preposition Blaster: sign-in, scores, and saved progress.
 *
 * The game only ever talks to PBLeaderboard. Two backends sit behind it:
 *   - local: localStorage on this device. Always on. Works offline and signed out.
 *   - cloud: the Lens v2 Firebase project ("lens-v2"). Any Google account may
 *     sign in (no allowlist). Scores go to the `pb_scores` collection, saved
 *     progress to `pb_players/{uid}`. Rules for both are in
 *     korean-photo-slideshow/lens-v2/firestore.rules (pb_* block).
 *
 * Signed out, everything behaves exactly as v1 did. Signed in, the local save
 * is merged with the cloud save (highest unlock, union of cleared levels, best
 * scores, summed tallies), written back to both, and every later save goes to
 * both. Scores are written to the cloud when signed in and kept locally too.
 *
 * The Firebase web config values are public; security lives in the rules.
 */
(function () {
  const SCORES_KEY = 'pb_scores_v1';
  const SAVE_KEY = 'pb_save_v1';
  const MAX_SCORES = 25;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const firebaseConfig = {
    apiKey: 'AIzaSyCL0YEBjRRzam0tuaXwP5nUQ8Aa7tdcw3U',
    authDomain: 'lens-v2.firebaseapp.com',
    projectId: 'lens-v2',
    storageBucket: 'lens-v2.firebasestorage.app',
    messagingSenderId: '169781960240',
    appId: '1:169781960240:web:f7642d73682173a180d7f5',
  };

  function read(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // ---------- local backend ----------
  function localSubmit(entry) {
    const scores = read(SCORES_KEY, []);
    scores.push(entry); scores.sort((a, b) => b.score - a.score);
    write(SCORES_KEY, scores.slice(0, MAX_SCORES));
  }
  function localTop(n) { return read(SCORES_KEY, []).slice(0, n); }

  // ---------- cloud backend (lazy) ----------
  let fb = null;          // { app, auth, db, fns }
  let fbPromise = null;
  let user = null;
  const authListeners = [];
  const progressListeners = [];
  let cloudSaveTimer = null;
  let status = 'idle';    // idle | loading | ready | unavailable

  async function loadFirebase() {
    if (fb) return fb;
    if (fbPromise) return fbPromise;
    status = 'loading';
    fbPromise = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js'),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);
      fb = { app, auth, db, authMod, fsMod };
      authMod.onAuthStateChanged(auth, async (u) => {
        user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null;
        authListeners.forEach(cb => { try { cb(user); } catch (e) { console.warn(e); } });
        if (user) { try { await mergeCloudProgress(); } catch (e) { console.warn('cloud progress', e); } }
      });
      try { await authMod.getRedirectResult(auth); } catch (e) { /* no redirect pending */ }
      status = 'ready';
      return fb;
    })().catch((e) => { console.warn('Firebase unavailable', e); status = 'unavailable'; fbPromise = null; return null; });
    return fbPromise;
  }

  async function signIn() {
    const f = await loadFirebase(); if (!f) throw new Error('Firebase unavailable');
    const provider = new f.authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await f.authMod.signInWithPopup(f.auth, provider);
    } catch (e) {
      // Popups are blocked in some mobile browsers and in Safari with strict settings.
      if (e && /popup|blocked|cancelled-popup/i.test(e.code || e.message || '')) {
        await f.authMod.signInWithRedirect(f.auth, provider); return;
      }
      throw e;
    }
  }
  async function signOut() { const f = await loadFirebase(); if (f) await f.authMod.signOut(f.auth); }

  // ---------- progress merge ----------
  function mergeSaves(a, b) {
    if (!a) return b; if (!b) return a;
    const out = { name: a.name || b.name || '', unlocked: Math.max(a.unlocked || 1, b.unlocked || 1), cleared: Object.assign({}, b.cleared, a.cleared), best: {}, items: {} };
    const levels = new Set([...Object.keys(a.best || {}), ...Object.keys(b.best || {})]);
    levels.forEach(k => { out.best[k] = Math.max((a.best || {})[k] || 0, (b.best || {})[k] || 0); });
    const keys = new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})]);
    keys.forEach(k => { const x = (a.items || {})[k] || { right: 0, wrong: 0 }, y = (b.items || {})[k] || { right: 0, wrong: 0 }; out.items[k] = { right: (x.right || 0) + (y.right || 0), wrong: (x.wrong || 0) + (y.wrong || 0) }; });
    return out;
  }
  async function mergeCloudProgress() {
    if (!fb || !user) return;
    const { fsMod, db } = fb;
    const ref = fsMod.doc(db, 'pb_players', user.uid);
    const snap = await fsMod.getDoc(ref);
    const cloud = snap.exists() ? (snap.data().save || null) : null;
    const local = read(SAVE_KEY, null);
    // The cloud copy wins on tallies only if local is empty; otherwise sum both.
    // Summing is the honest merge for a student who played on two devices.
    const merged = mergeSaves(local, cloud) || { name: '', unlocked: 1, cleared: {}, best: {}, items: {} };
    if (!merged.name && user.name) merged.name = user.name.split(' ')[0].slice(0, 16);
    write(SAVE_KEY, merged);
    await fsMod.setDoc(ref, { save: merged, name: merged.name, email: user.email, updatedAt: fsMod.serverTimestamp() }, { merge: true });
    progressListeners.forEach(cb => { try { cb(merged); } catch (e) { console.warn(e); } });
  }
  function cloudSaveProgress(save) {
    if (!fb || !user) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
      try {
        const { fsMod, db } = fb;
        await fsMod.setDoc(fsMod.doc(db, 'pb_players', user.uid), { save, name: save.name || '', email: user.email, updatedAt: fsMod.serverTimestamp() }, { merge: true });
      } catch (e) { console.warn('cloud save failed', e); }
    }, 1500);
  }

  // ---------- scores ----------
  async function cloudSubmit(entry) {
    if (!fb || !user) return false;
    const { fsMod, db } = fb;
    await fsMod.addDoc(fsMod.collection(db, 'pb_scores'), Object.assign({}, entry, { uid: user.uid, createdAt: fsMod.serverTimestamp() }));
    return true;
  }
  async function cloudTop(n) {
    if (!fb || !user) return null;
    const { fsMod, db } = fb;
    const q = fsMod.query(fsMod.collection(db, 'pb_scores'), fsMod.orderBy('score', 'desc'), fsMod.limit(n));
    const snap = await fsMod.getDocs(q);
    return snap.docs.map(d => { const x = d.data(); return { name: x.name, score: x.score, level: x.level, accuracy: x.accuracy, date: x.date, uid: x.uid }; });
  }

  window.PBLeaderboard = {
    get backendName() { return user ? 'cloud' : 'local'; },
    get user() { return user; },
    get status() { return status; },
    get cloudConfigured() { return true; },

    /** Starts loading the SDK and restores any existing session. Safe to call more than once. */
    init() { return loadFirebase(); },
    signIn, signOut,
    onAuth(cb) { authListeners.push(cb); if (fb) cb(user); },
    onProgress(cb) { progressListeners.push(cb); },

    /** entry: {name, score, level, levelsCleared, accuracy, date} */
    async submit(entry) {
      const clean = {
        name: String(entry.name || 'Pilot').slice(0, 16),
        score: Math.max(0, Math.min(200000, Math.round(entry.score || 0))),
        level: String(entry.level || '').slice(0, 40),
        levelsCleared: entry.levelsCleared ? 1 : 0,
        accuracy: Math.max(0, Math.min(100, Math.round(entry.accuracy || 0))),
        date: entry.date || new Date().toISOString().slice(0, 10),
      };
      localSubmit(clean);
      try { await cloudSubmit(clean); } catch (e) { console.warn('cloud score failed', e); return false; }
      return true;
    },
    /** Returns {rows, source} where source is 'cloud' or 'local'. */
    async top(n = 10) {
      try { const rows = await cloudTop(n); if (rows) return { rows, source: 'cloud' }; } catch (e) { console.warn('cloud top failed', e); }
      return { rows: localTop(n), source: 'local' };
    },

    loadProgress() { return read(SAVE_KEY, null); },
    saveProgress(save) { const ok = write(SAVE_KEY, save); cloudSaveProgress(save); return ok; },
    clearProgress() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
  };
})();

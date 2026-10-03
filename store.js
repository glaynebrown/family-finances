/* All database access lives here (and in demo.js, its stand-in for sample
   mode), so app.js only deals in plain objects.

   Firestore layout:
     users/{uid}                       { hid }             which household you're in
     joinCodes/{code}                  { hid }             lets the second person join
     households/{hid}                  settings, bills, helpers, savings, plans, look,
                                       members { uid: true }, people { uid: { name } }
     households/{hid}/months/{ym}      the month's checklist (budgets, checking, bills...)
     households/{hid}/purchases/{id}   one logged purchase
     households/{hid}/wallpapers/{1-12} { data: 'data:image/jpeg;base64,...' }

   Each of you signs in with an email + password; only members of the household
   can read or write it (see firestore.rules). */

const Store = (() => {
  const configured = typeof firebaseConfig !== 'undefined' && !/PASTE/.test(firebaseConfig.apiKey);
  if (!configured) return { configured: false };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  const DEL = FV.delete();

  let hid = null;
  const hh = () => db.collection('households').doc(hid);
  const sub = n => hh().collection(n);
  let unsubs = [];

  const onUser = cb => auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null));

  async function signUp(name, email, password) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    return cred.user;
  }
  const signIn = (email, password) => auth.signInWithEmailAndPassword(email, password);
  const reset = email => auth.sendPasswordResetEmail(email);
  const signOut = () => { stop(); return auth.signOut(); };

  async function myHousehold() {
    const u = auth.currentUser;
    const snap = await db.collection('users').doc(u.uid).get();
    return snap.exists ? snap.get('hid') || null : null;
  }

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const makeCode = () => Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

  async function createHousehold(name) {
    const u = auth.currentUser;
    const { household, months } = seedHousehold(u.uid, name);
    const ref = db.collection('households').doc();
    household.joinCode = makeCode();
    await ref.set(household);
    await db.collection('joinCodes').doc(household.joinCode).set({ hid: ref.id });
    await db.collection('users').doc(u.uid).set({ hid: ref.id });
    const batch = db.batch();
    for (const ym in months) batch.set(ref.collection('months').doc(ym), months[ym]);
    await batch.commit();
    return ref.id;
  }

  async function joinHousehold(code, name) {
    const u = auth.currentUser;
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const snap = await db.collection('joinCodes').doc(code).get();
    if (!snap.exists) throw new Error('That code didn’t match. Check it and try again.');
    const id = snap.get('hid');
    await db.collection('households').doc(id).update(
      new firebase.firestore.FieldPath('members', u.uid), true,
      new firebase.firestore.FieldPath('people', u.uid), { name, tourPending: true },
      'joinAttempt', code,
    );
    await db.collection('users').doc(u.uid).set({ hid: id });
    return id;
  }

  // cbs: { household(H), months({ym: M}), purchases([...]), wallpapers({m: data}), error(e) }
  function open(id, cbs) {
    stop();
    hid = id;
    const err = what => e => { console.error(what, e); cbs.error && cbs.error(e); };
    unsubs.push(hh().onSnapshot(s => s.exists && cbs.household(s.data()), err('household')));
    unsubs.push(sub('months').onSnapshot(s => {
      const out = {};
      s.forEach(d => { out[d.id] = d.data(); });
      cbs.months(out);
    }, err('months')));
    // Only last month + this month stay live (keeps reads small as the years add
    // up), plus older bulk buys still spreading into them ('until' = last month a
    // purchase counts in). Older months are fetched on demand with loadPurchases().
    let byDate = [];
    let byUntil = [];
    const send = () => { const seen = new Set(); cbs.purchases(byDate.concat(byUntil).filter(p => !seen.has(p.id) && seen.add(p.id))); };
    const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
    unsubs.push(sub('purchases').where('date', '>=', cbs.since).onSnapshot(s => { byDate = docs(s); send(); }, err('purchases')));
    unsubs.push(sub('purchases').where('until', '>=', cbs.since.slice(0, 7)).onSnapshot(s => { byUntil = docs(s); send(); }, err('purchases')));
  }
  function stop() { unsubs.forEach(u => u()); unsubs = []; if (wallUnsub) wallUnsub(); wallUnsub = null; wallM = null; }

  // Wallpapers are big, so only the month on screen is kept live; the other
  // eleven are read once, when Settings -> Look is opened.
  let wallUnsub = null;
  let wallM = null;
  function watchWall(m, cb) {
    m = String(m);
    if (wallM === m) return;
    if (wallUnsub) wallUnsub();
    wallM = m;
    wallUnsub = sub('wallpapers').doc(m).onSnapshot(d => cb(m, d.exists ? d.get('data') : null), e => console.error('wallpaper', e));
  }
  const loadAllWalls = () => sub('wallpapers').get().then(s => { const out = {}; s.forEach(d => { out[d.id] = d.get('data'); }); return out; });

  // Change fields on the household. pairs: [[['plans', '2026-10', 'nick'], 4750], ...]
  // (a value of Store.DEL removes the field)
  function setH(pairs) {
    const args = [];
    for (const [path, val] of pairs) args.push(new firebase.firestore.FieldPath(...path), val === undefined ? DEL : val);
    return hh().update(...args);
  }
  const setMonth = (ym, data) => sub('months').doc(ym).set(data, { merge: true });
  // Replace a whole month doc field (merge would blend old map keys in)
  const setMonthField = (ym, path, val) => sub('months').doc(ym).set({}, { merge: true })
    .then(() => sub('months').doc(ym).update(new firebase.firestore.FieldPath(...path), val === undefined ? DEL : val));
  function savePurchase(p) {
    const { id, ...rest } = p;
    const ref = id ? sub('purchases').doc(id) : sub('purchases').doc();
    return ref.set(rest).then(() => ref.id);
  }
  // Many at once (an import): one batch per 400 writes.
  async function savePurchases(list) {
    for (let i = 0; i < list.length; i += 400) {
      const batch = db.batch();
      for (const p of list.slice(i, i + 400)) {
        const { id, ...rest } = p;
        batch.set(id ? sub('purchases').doc(id) : sub('purchases').doc(), rest);
      }
      await batch.commit();
    }
  }
  // Purchases dated from <= date < to (one-time read, for paging back on Review).
  const loadPurchases = (from, to) => sub('purchases').where('date', '>=', from).where('date', '<', to).get()
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
  const deletePurchase = id => sub('purchases').doc(id).delete();
  const setWallpaper = (m, data) => (data ? sub('wallpapers').doc(String(m)).set({ data }) : sub('wallpapers').doc(String(m)).delete());

  return {
    configured: true, DEL, onUser, signUp, signIn, reset, signOut, myHousehold, createHousehold,
    joinHousehold, open, stop, setH, setMonth, setMonthField, savePurchase, savePurchases, loadPurchases, deletePurchase, setWallpaper, watchWall, loadAllWalls,
    uid: () => auth.currentUser && auth.currentUser.uid,
  };
})();

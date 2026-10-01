/* Sample mode: the same calls as store.js, kept in this browser only.
   Used when firebase-config.js hasn't been filled in, so the app can be tried
   (and previewed) without a database. */

const Demo = (() => {
  const KEY = 'ne-demo';
  const DEL = { __del: true };
  let st = null;
  let cbs = null;

  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
    if (!st) {
      const { household, months } = seedHousehold('me', 'Bella');
      household.people.nick = { name: 'Nick' };
      household.members.nick = true;
      household.joinCode = 'SAMPLE22';
      st = { H: household, months, purchases: [], wallpapers: {} };
      save();
    }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { console.warn('sample save failed', e); } }
  const clone = o => JSON.parse(JSON.stringify(o));
  function emit() {
    if (!cbs) return;
    save();
    setTimeout(() => {
      cbs.household(clone(st.H));
      cbs.months(clone(st.months));
      cbs.purchases(clone(st.purchases));
      cbs.wallpapers({ ...st.wallpapers });
    }, 0);
  }
  function setPath(obj, path, val) {
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof o[path[i]] !== 'object' || o[path[i]] === null) o[path[i]] = {};
      o = o[path[i]];
    }
    const k = path[path.length - 1];
    if (val === DEL || val === undefined) delete o[k]; else o[k] = clone(val);
  }
  function merge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]);
      else a[k] = clone(b[k]);
    }
    return a;
  }

  return {
    DEL,
    open(c) { load(); cbs = c; emit(); },
    setH(pairs) { for (const [p, v] of pairs) setPath(st.H, p, v); emit(); return Promise.resolve(); },
    setMonth(ym, data) { st.months[ym] = merge(st.months[ym] || {}, clone(data)); emit(); return Promise.resolve(); },
    setMonthField(ym, path, val) { st.months[ym] = st.months[ym] || {}; setPath(st.months[ym], path, val); emit(); return Promise.resolve(); },
    savePurchase(p) {
      const id = p.id || newId();
      const i = st.purchases.findIndex(x => x.id === id);
      const rec = { ...clone(p), id };
      if (i >= 0) st.purchases[i] = rec; else st.purchases.push(rec);
      emit();
      return Promise.resolve(id);
    },
    savePurchases(list) {
      for (const p of list) st.purchases.push({ ...clone(p), id: p.id || newId() });
      emit();
      return Promise.resolve();
    },
    loadPurchases() { return Promise.resolve([]); }, // sample mode keeps everything live
    deletePurchase(id) { st.purchases = st.purchases.filter(x => x.id !== id); emit(); return Promise.resolve(); },
    setWallpaper(m, data) { if (data) st.wallpapers[m] = data; else delete st.wallpapers[m]; emit(); return Promise.resolve(); },
    loadSetup(file) {
      const fresh = seedHousehold('me', 'Bella');
      const { household, months } = applySetup(fresh, file);
      household.joinCode = 'SAMPLE22';
      st = { H: household, months, purchases: [], wallpapers: {} };
      emit();
      return Promise.resolve();
    },
    reset() { localStorage.removeItem(KEY); location.reload(); },
    uid: () => 'me',
  };
})();

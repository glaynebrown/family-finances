/* The screens. Data comes in through the listeners in boot(), everything is
   drawn from plain HTML strings, and taps are handled by one delegated
   listener keyed on data-act (clicks) and data-ch (input changes).

   Screens (hash routes): #/review  #/home ($: budgets + bills)  #/year
                          #/setup (from Review)  #/settings (gear on Home) */

const B = Store.configured ? Store : Demo;
const S = {
  user: null, hid: null, H: null, months: {}, purchases: [], wallpapers: {},
  gotH: false, gotM: false, gotP: false,
  bdYm: null, bdTab: 'cat', year: null, open: {}, sinceOpen: false,
  draft: null, pending: false, openShares: {}, adding: null,
  setOpen: {},
  hideDone: (() => { try { return localStorage.getItem('ne-hide') === '1'; } catch (e) { return false; } })(),
  page: (() => { try { return localStorage.getItem('ne-page') === 'budgets' ? 'budgets' : 'overview'; } catch (e) { return 'overview'; } })(),
};
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = s => {
  const v = parseFloat(String(s === undefined || s === null ? '' : s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};
const H = () => S.H;
const me = () => B.uid();
const myName = () => ((H().people || {})[me()] || {}).name || (S.user && S.user.name) || 'there';
const calm = () => !H() || !H().look || H().look.calm !== false;
const homeYm = () => Calc.homeMonth(S.months);
const catById = id => (H().categories || []).find(c => c.id === id);
const feat = k => ((H() && H().features) || {})[k];
const checkingBuffer = () => { const b = ((H() && H().savings) || {}).buffer; return b === undefined || b === null ? 500 : Number(b) || 0; };
const bucketsOn = () => !!feat('buckets');
const overviewOn = () => feat('overview') !== false;
const payInChecking = () => !!feat('payInChecking');


/* ---------- little UI pieces ---------- */

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet-wrap').hidden = false;
  requestAnimationFrame(() => $('#sheet-wrap').classList.add('on'));
}
function closeSheet() {
  const w = $('#sheet-wrap');
  w.classList.remove('on');
  setTimeout(() => { w.hidden = true; $('#sheet').innerHTML = ''; if (S.pending) render(); }, 180);
  S.sheet = null;
}
const sheetOpen = () => !$('#sheet-wrap').hidden;

// A styled yes/no question (instead of the browser's confirm()).
function ask(text, ok = 'OK', cancel = 'Cancel') {
  return new Promise(res => {
    $('#dialog').innerHTML = `<p>${text}</p><div class="row end">
      <button class="btn ghost" data-d="0">${esc(cancel)}</button><button class="btn" data-d="1">${esc(ok)}</button></div>`;
    $('#dialog-wrap').hidden = false;
    $('#dialog').onclick = e => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      $('#dialog-wrap').hidden = true;
      res(b.dataset.d === '1');
    };
  });
}

function confetti() {
  if (!calm()) return;
  const box = $('#confetti');
  const colors = Object.values((H().look || {}).colors || Looks.colors);
  let html = '';
  for (let i = 0; i < 70; i++) {
    const c = colors[i % colors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const dur = 1.6 + Math.random() * 1.2;
    const rot = Math.floor(Math.random() * 360);
    html += `<i style="left:${left}%;background:${c};animation-delay:${delay}s;animation-duration:${dur}s;transform:rotate(${rot}deg)"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => { box.innerHTML = ''; }, 3200);
}

const icons = {
  home: '<svg viewBox="0 0 24 24"><path d="M12 3.5v17M16.5 7.5c-.6-1.6-2.4-2.5-4.5-2.5-2.6 0-4.5 1.4-4.5 3.4 0 4.6 9.3 2.4 9.3 7.2 0 2-2 3.4-4.8 3.4-2.3 0-4.2-1-4.8-2.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  review: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5M10.5 8v5"/></svg>',
  bills: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="m8.5 9 1.5 1.5L13 7.5M8.5 15h7"/></svg>',
  year: '<svg viewBox="0 0 24 24"><path d="M5 20V11M10 20V6M15 20v-7M20 20V9"/></svg>',
  gallery: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5 4 4 2.5-2.5 4.5 4.5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>',
};

/* ---------- look: month color, fonts, wallpaper ---------- */

const FONT_W = {
  Oswald: 'wght@400;600', 'Playfair Display': 'wght@500;700', Fredoka: 'wght@400;600', 'Josefin Sans': 'wght@400;600',
  Caveat: 'wght@500;700', Nunito: 'wght@400;600;700;800', 'DM Sans': 'wght@400;500;700', Lato: 'wght@400;700',
  Quicksand: 'wght@400;600;700', Poppins: 'wght@400;500;600', 'Source Sans 3': 'wght@400;600;700',
};
const fontParam = f => `family=${f.replace(/ /g, '+')}${FONT_W[f] ? ':' + FONT_W[f] : ''}`;

function onColor(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#2B2522' : '#FFFFFF';
}
const monthColor = ym => ((H().look || {}).colors || Looks.colors)[D.monthNum(ym)] || Looks.colors[D.monthNum(ym)];

function applyLook() {
  if (!H()) return;
  const look = H().look || {};
  const ym = homeYm();
  const accent = monthColor(ym);
  const vars = {
    '--accent': accent,
    '--on-accent': onColor(accent),
    '--accent-ink': onColor(accent) === '#FFFFFF' ? accent : `color-mix(in srgb, ${accent} 62%, #2B2522)`,
    '--glass': String(look.glass === undefined ? 0.82 : look.glass),
    '--hfont': `'${look.heading || 'Oswald'}'`,
    '--bfont': `'${look.body || 'Nunito'}'`,
  };
  const root = document.documentElement.style;
  for (const k in vars) root.setProperty(k, vars[k]);
  const fonts = `https://fonts.googleapis.com/css2?${fontParam(look.heading || 'Oswald')}&${fontParam(look.body || 'Nunito')}&display=swap`;
  const link = $('#fonts');
  if (link.href !== fonts) link.href = fonts;
  const wm = String(D.monthNum(ym));
  if (B.watchWall) B.watchWall(wm, (k, data) => {
    if (data) S.wallpapers[k] = data; else delete S.wallpapers[k];
    applyLook();
    if (route() === 'settings') render();
  });
  const wp = S.wallpapers[wm];
  $('#wall').style.backgroundImage = wp ? `url("${wp}")` : '';
  document.body.classList.toggle('has-wall', !!wp);
  try { localStorage.setItem('ne-look', JSON.stringify({ vars, fonts })); } catch (e) {}
}

/* ---------- routing & rendering ---------- */

const OLD_ROUTES = { bills: 'home', more: 'home', breakdown: 'review' };
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home'; return OLD_ROUTES[r] || r; };

function render(force) {
  // Don't redraw under someone's fingers: wait until they leave the field / close the sheet.
  const a = document.activeElement;
  if (S.drag) { S.pending = true; return; }
  if (!force && (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox') || (sheetOpen() && S.sheet !== 'soft')) {
    S.pending = true;
    return;
  }
  S.pending = false;
  if (!H()) return;
  applyLook();
  const r = route();
  const screens = { home: viewHome, year: viewYear, review: viewReview, setup: viewSetup, settings: viewSettings, import: viewImport, savings: viewSavings };
  const fn = screens[r] || viewHome;
  const y = window.scrollY;
  // Keep anything typed in "add" boxes (and which one had focus) across a redraw.
  const typed = {};
  view.querySelectorAll('.add-row input[id], .add-inline input[id]').forEach(i => { if (i.value) typed[i.id] = i.value; });
  const focusId = document.activeElement && view.contains(document.activeElement) ? document.activeElement.id : '';
  view.innerHTML = fn();
  for (const id in typed) { const i = document.getElementById(id); if (i && !i.value) i.value = typed[id]; }
  if (focusId && typed[focusId]) { const i = document.getElementById(focusId); if (i) i.focus(); }
  window.scrollTo(0, y);
  drawTabs(r);
  const fab = $('#fab');
  fab.hidden = !['home', 'review'].includes(r);
  const importing = H().trackMode === 'import';
  fab.dataset.act = importing ? 'import-file' : 'log';
  fab.innerHTML = importing ? '<span>↑</span> Import' : '<span>+</span> Log';
  fab.setAttribute('aria-label', importing ? 'Import bank transactions' : 'Log a purchase');
  const demo = !Store.configured;
  const bn = $('#banner');
  bn.hidden = !demo;
  if (demo) bn.innerHTML = 'Sample mode — saved in this browser only.';
}
// Leaving a text box saves it:
//  - tap-to-edit boxes (amounts, names) close back up even if nothing changed
//    (if something changed, the 'change' handler has already saved it)
//  - "add" rows (name + amount + Add button) add the item once every box is
//    filled and you tap somewhere outside the row
document.addEventListener('pointerdown', e => { S.lastDown = e.target; }, true);
document.addEventListener('focusout', e => {
  const t = e.target;
  setTimeout(() => {
    const now = document.activeElement;
    if (t.matches && t.matches('.val-in, .item-in') && t.isConnected) S.pending = true;
    const row = t.closest && t.closest('.add-row');
    if (row && row.isConnected && !row.contains(now) && !(S.lastDown && row.contains(S.lastDown))) {
      const inputs = [...row.querySelectorAll('input')];
      const btn = row.querySelector('button[data-act]');
      if (btn && inputs.length && inputs.every(i => i.value.trim() !== '')) { btn.click(); return; }
    }
    const tapping = S.lastDown && S.lastDown.closest && S.lastDown.closest('[data-act]');
    const later = () => { if (S.pending && !sheetOpen()) render(); };
    if (tapping) setTimeout(later, 350); else later();
  }, 0);
});

function drawTabs(r) {
  const t = $('#tabs');
  t.hidden = false;
  const on = id => (r === id || (id === 'home' && (r === 'settings' || r === 'import')) || (id === 'year' && r === 'savings') || (id === 'review' && r === 'setup') ? 'on' : '');
  t.innerHTML = `<a href="#/review" class="${on('review')}">${icons.review}<span>Review</span></a>`
    + `<a href="#/home" class="money ${on('home')}" aria-label="Home">${icons.home}</a>`
    + `<a href="#/year" class="${on('year')}">${icons.year}<span>Year</span></a>`;
}
window.addEventListener('hashchange', e => {
  window.scrollTo(0, 0);
  // Coming into Settings from another screen: every section starts collapsed.
  if (route() === 'settings' && !/#\/settings/.test(e.oldURL || '')) S.setOpen = {};
  if (sheetOpen()) { S.sheet = null; $('#sheet-wrap').hidden = true; $('#sheet-wrap').classList.remove('on'); }
  render();
});

/* ---------- Home ---------- */

function catCard(c) {
  const pct = c.budget > 0 ? Math.min(100, (c.used / c.budget) * 100) : (c.used > 0 ? 100 : 0);
  // Tapping the amount left changes this month's budget for the category;
  // tapping anywhere else on the card logs a purchase (or lists them, in import mode).
  const right = c.over
    ? `<button class="val-edit over-txt" data-act="left" data-cat="${esc(c.id)}" aria-label="Change what's left in ${esc(c.name)}">${calm() ? 'Over by ' : 'Over budget: '}${money(c.used - c.budget)}</button>`
    : `<button class="val-edit" data-act="left" data-cat="${esc(c.id)}" aria-label="Change what's left in ${esc(c.name)}">${money(c.left)}</button> <span class="muted small">left</span>`;
  const tapAct = H().trackMode === 'import' ? 'cat-list' : 'log';
  return `<div class="cat card ${c.over ? 'over' : ''}" role="button" tabindex="0" data-act="${tapAct}" data-cat="${esc(c.id)}">
    <div class="row between"><span class="cat-name"><span class="emoji">${esc(c.emoji || '•')}</span>${esc(c.name)}</span><span>${right} <span class="muted small of">/ <button class="val-edit small-edit" data-act="budget-edit" data-cat="${esc(c.id)}" aria-label="Change ${esc(c.name)}'s budget this month">${money(c.budget)}</button></span></span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function purchaseRow(p, showPart = true) {
  const c = catById(p.cat);
  const part = showPart && p.part !== undefined && Math.abs(p.part - p.amount) > 0.004 ? `<span class="muted small"> (${money(p.part)} this month)</span>` : '';
  const who = p.src === 'import' ? '🏦' : (p.byName || '?').slice(0, 1).toUpperCase();
  const tags = (p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  return `<button class="prow" data-act="edit-p" data-id="${esc(p.id)}">
    <span class="who" title="${esc(p.byName)}">${esc(who)}</span>
    <span class="pmain"><span class="pstore">${esc(p.store || (c ? c.name : 'Purchase'))}</span>
      <span class="small muted">${D.niceDay(p.date)} · ${esc(c ? c.name : 'Uncategorized')}${p.spread > 1 ? ` · spread over ${p.spread} months` : ''}</span>
      ${tags ? `<span class="tags">${tags}</span>` : ''}${p.note ? `<span class="small muted">${esc(p.note)}</span>` : ''}</span>
    <span class="pamt">${money(p.amount)}${part}</span>
  </button>`;
}

function viewHome() {
  const ym = homeYm();
  const M = S.months[ym];
  const c = Calc.checklist(H(), M, ym, S.purchases);
  const totalB = c.cats.reduce((s, x) => s + x.budget, 0);
  const totalU = c.cats.reduce((s, x) => s + x.used, 0);
  const pct = totalB ? Math.min(100, (totalU / totalB) * 100) : 0;
  const overs = c.cats.filter(x => x.over);
  return `
  <header class="hero home-hero">
    <a class="gear" href="#/settings" aria-label="Settings">${icons.gear}</a>
    <h1>${D.name(ym)}</h1>
  </header>
  ${M && M.setup ? '' : `<div class="card note-card"><p><b>${D.name(ym)} isn’t set up yet.</b> You can still log purchases — they’ll count against your normal budgets.</p><a class="btn" href="#/setup">Set up ${D.name(ym)}</a></div>`}
  ${overviewOn() ? `<div class="seg page-toggle" role="tablist">${[['overview', 'Overview'], ['budgets', 'Budgets']].map(([k, l]) => `<button role="tab" aria-selected="${S.page === k}" class="${S.page === k ? 'on' : ''}" data-act="page" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
  ${overviewOn() && S.page === 'overview' ? billsSections() : `
  <div class="spend-sum">
    <div><b>${money(Math.max(0, totalB - totalU))}</b> <span class="muted">left to spend</span> <span class="muted small">/ ${money(totalB)}</span></div>
    ${H().trackMode === 'import' ? `<div class="small muted">${(H().imports || {}).through ? `Updated through ${D.niceDay(H().imports.through)}` : 'No imports yet'}</div>` : ''}
  </div>
  <section class="cats">${c.cats.map(catCard).join('')}</section>
  ${uncatCard(c.spent)}`}`;
}

// Imported purchases nobody put in a category yet (they still count as spending).
function uncatCard(spent) {
  const list = spent.list.filter(p => p.cat === 'uncat' || !catById(p.cat));
  if (!list.length) return '';
  const total = list.reduce((a, p) => a + p.part, 0);
  return `<section class="card uncat-card"><div class="row between"><h2>Uncategorized</h2><b>${money(total)}</b></div>
    <p class="small muted">Tap one to pick a category. Anything left here comes up in monthly review.</p>
    ${list.map(p => purchaseRow(p)).join('')}</section>`;
}

/* ---------- Log a purchase (sheet) ---------- */

function openLog(opts = {}) {
  const p = opts.id ? S.purchases.find(x => x.id === opts.id) : null;
  const ym = homeYm();
  const defDate = ym === D.curYm() ? D.today() : `${ym}-01`;
  S.log = p ? { ...p, tags: [...(p.tags || [])] } : {
    amount: '', cat: opts.cat || (H().categories[0] || {}).id, store: '', tags: [], note: '',
    date: defDate, spread: 1,
  };
  S.sheet = 'log';
  openSheet(logHtml());
  if (!p) setTimeout(() => { const a = $('#l-amount'); a && a.focus(); }, 250);
}
function syncLog() {
  const L = S.log;
  if (!L || !$('#l-amount')) return;
  L.amount = $('#l-amount').value;
  L.date = $('#l-date').value || L.date;
  L.note = $('#l-note').value;
}
function logHtml() {
  const L = S.log;
  const chip = (act, v, on, label) => `<button type="button" class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${label}</button>`;
  return `<div class="sheet-head"><h2>${L.id ? 'Edit purchase' : 'Log a purchase'}</h2><button class="x" data-act="close" aria-label="Close">×</button></div>
  <label class="amount"><span>$</span><input id="l-amount" inputmode="decimal" placeholder="0.00" value="${esc(L.amount)}" autocomplete="off"></label>
  <div class="field"><span class="label">Category</span><div class="chips">${H().categories.map(c => chip('l-cat', c.id, L.cat === c.id, `${esc(c.emoji || '')} ${esc(c.name)}`)).join('')}</div></div>
  <div class="field"><span class="label">Store</span><div class="chips">${(H().stores || []).map(s => chip('l-store', s, L.store === s, esc(s))).join('')}
    <button type="button" class="chip add" data-act="l-add" data-kind="stores">+ New</button></div></div>
  <div class="field"><span class="label">Tags <span class="muted small">(optional — for tracking things like diapers)</span></span><div class="chips">${(H().tags || []).map(t => chip('l-tag', t, L.tags.includes(t), esc(t))).join('')}
    <button type="button" class="chip add" data-act="l-add" data-kind="tags">+ New</button></div></div>
  <div class="two">
    <label class="field"><span class="label">Date</span><input id="l-date" type="date" value="${esc(L.date)}"></label>
    <label class="field"><span class="label">Note</span><input id="l-note" placeholder="optional" value="${esc(L.note)}"></label>
  </div>
  <div class="field"><span class="label">Bulk buy? Spread it over</span><div class="seg">${[1, 2, 3, 4, 6].map(n => `<button type="button" class="${Number(L.spread) === n ? 'on' : ''}" data-act="l-spread" data-v="${n}">${n === 1 ? 'Just this month' : n + ' months'}</button>`).join('')}</div></div>
  <div class="row end sheet-foot">${L.id ? '<button class="btn ghost danger" data-act="l-del">Delete</button>' : ''}<button class="btn" data-act="l-save">${L.id ? 'Save' : 'Log it'}</button></div>`;
}
function redrawLog() { syncLog(); const y = $('#sheet').scrollTop; $('#sheet').innerHTML = logHtml(); $('#sheet').scrollTop = y; }

async function saveLog() {
  syncLog();
  const L = S.log;
  const amount = num(L.amount);
  if (!amount || amount <= 0) { toast('Add the amount first'); $('#l-amount').focus(); return; }
  if (!L.cat) { toast('Pick a category'); return; }
  const rec = {
    amount, cat: L.cat, store: L.store || '', tags: L.tags || [], note: (L.note || '').trim(),
    date: L.date || D.today(), spread: Number(L.spread) || 1,
    by: L.by || me(), byName: L.byName || myName(), t: L.t || Date.now(),
  };
  rec.until = untilOf(rec);
  if (L.id) rec.id = L.id;
  if (L.src) { rec.src = L.src; rec.key = L.key || ''; }
  const before = Calc.checklist(H(), S.months[D.ymOf(rec.date)], D.ymOf(rec.date), S.purchases).cats.find(c => c.id === rec.cat);
  closeSheet();
  await B.savePurchase(rec);
  if (rec.id && rec.date < S.since) { S.older = S.older.map(p => (p.id === rec.id ? { ...rec } : p)); mergePurchases(); render(); }
  const c = catById(rec.cat);
  const ym = D.ymOf(rec.date);
  const after = Calc.checklist(H(), S.months[ym], ym, S.purchases.filter(p => p.id !== rec.id).concat([{ ...rec, id: rec.id || 'new' }])).cats.find(x => x.id === rec.cat);
  if (after && after.over && !(before && before.over)) toast(calm() ? `${c.name} is ${money(after.used - after.budget)} over — flagged for review. That’s OK.` : `${c.name} is over budget by ${money(after.used - after.budget)}`);
  else if (after) toast(`Logged ${money(amount)} · ${money(Math.max(0, after.left))} left in ${c.name}`);
}

/* ---------- Bills ---------- */

function billsSections() {
  const ym = homeYm();
  const M = S.months[ym] || {};
  const c = Calc.checklist(H(), M, ym, S.purchases);
  const helpersBy = {};
  for (const h of M.held || []) (helpersBy[h.bill] = helpersBy[h.bill] || []).push(h);
  const moved = M.moved !== null && M.moved !== undefined;
  const excessLabel = moved ? 'Leftover right now' : 'Savings/Excess';
  const line = (sign, label, amt, cls = '') => `<div class="line ${cls}"><span>${sign ? `<i class="sign">${sign}</i>` : ''}${label}</span><b>${money(amt)}</b></div>`;
  const excessNote = moved
    ? `<p class="small muted">${M.moved >= 0 ? `Moved ${money(M.moved)} to savings` : `Took ${money(-M.moved)} from savings`} when you set up ${D.name(ym)}.${c.excess < -0.004 ? (calm() ? ` Spending is ${money(-c.excess)} past the plan — it’ll come up in review.` : ` Short ${money(-c.excess)}.`) : ''}</p>`
    : '';
  const checking = `<button class="line tap checking-row" data-act="checking" aria-label="Update checking balance"><span><b>Checking</b> <span class="small muted">(updated ${c.checkedAt ? `${new Date(c.checkedAt).getMonth() + 1}/${new Date(c.checkedAt).getDate()}` : '—'})</span></span><b class="val-edit">${money(c.est)}</b></button>`;
  return `
  <section class="card checklist">
    ${checking}
    ${c.since.length ? `<button class="linkish small" data-act="since">${S.sinceOpen ? 'Hide' : 'What changed since then?'}</button>
      ${S.sinceOpen ? `<div class="since">${c.since.map(s => `<div class="line small"><span>${esc(s.what)}</span><span>${s.amount > 0 ? '+' : ''}${money(s.amount)}</span></div>`).join('')}</div>` : ''}` : ''}
    ${c.backIn ? line('+', 'Additional income', c.backIn) : ''}
    ${c.owed ? line('+', 'Still owed for shared bills', c.owed) : ''}
    ${c.heldBack ? line('−', 'Held for shared bills (theirs)', c.heldBack) : ''}
    ${c.nextPay ? line('−', 'Set aside for next month (paychecks)', c.nextPay) : ''}
    ${line('−', 'Bills still to come', c.billsLeft)}
    ${c.otherLeft ? line('−', 'Other expenses to pay', c.otherLeft) : ''}
    ${line('−', 'Budget left to spend', c.budgetsLeft)}
    <div class="line total-line ${c.excess < -0.004 ? 'neg' : ''}"><span>${excessLabel}</span><b>${money(c.excess)}</b></div>
    ${excessNote}
  </section>

  <section class="card">
    <div class="row between card-head"><h2>Automatic payments</h2>${eyeBtn()}</div>
    <p class="small muted">These check themselves off on their due date. Tap to change one if something’s off.</p>
    ${c.bills.filter(b => !(S.hideDone && b.paid)).map(b => {
      const hs = helpersBy[b.id] || [];
      const shareTotal = hs.reduce((s, h) => s + Number(h.amount || 0), 0);
      // Shared bill: what actually gets charged (our part + theirs) next to the name, and a
      // marker for each person's transfer on its own line -- marking one adds it to checking.
      const charged = hs.length ? ` <span class="small muted">(${money(b.charge)} total)</span>` : '';
      const extra = !hs.length ? '' : (hs.every(h => h.received) && !S.openShares[b.id]
        ? `<span class="small muted shares"><button class="linkish small" data-act="shares" data-id="${esc(b.id)}" aria-label="Show transfers">✓ ${hs.map(h => esc(h.name)).join(' & ')} sent theirs</button></span>`
        : `<span class="small muted shares">${hs.map(h => `<button class="share ${h.received ? 'on' : ''}" data-act="held" data-id="${esc(h.id)}" aria-pressed="${!!h.received}">${h.received ? '✓' : '○'} ${esc(h.name)} ${money(h.amount)}</button>`).join(' ')}</span>`);
      return `<div class="check-row ${b.paid ? 'done' : ''} ${hs.length ? 'has-shares' : ''}">
        <button class="box ${b.paid ? 'on' : ''}" data-act="bill" data-id="${esc(b.id)}" aria-label="Paid">${b.paid ? '✓' : ''}</button>
        <span class="day">${D.ordinal(b.day)}</span>
        <span class="grow"><span>${esc(b.name)}${charged}</span>${b.self && !b.paid ? `<span class="small ${b.late ? 'warn' : 'muted'}">${b.late ? `⚠️ due the ${D.ordinal(b.day)}` : 'you pay this one'}</span>` : ''}${b.manual ? `<span class="small ${b.late ? 'warn' : 'muted'}">${b.late ? '⚠️ unchecked by hand' : 'set by hand'} · <button class="linkish small" data-act="bill-auto" data-id="${esc(b.id)}">back to automatic</button></span>` : ''}</span>
        <span class="bill-amt">${Math.abs(b.amountNow - b.normal) > 0.004 ? `<span class="small muted">normally ${money(b.normal)}</span>` : ''}<button class="val-edit" data-act="bill-amt" data-id="${esc(b.id)}" aria-label="Change this month's amount">${money(b.amountNow)}</button></span>
        ${extra}
      </div>`;
    }).join('')}
    ${doneNote(c.bills.filter(b => b.paid).length, 'paid')}
  </section>

  ${listCard('other', 'Other expenses this month', M.other || [], 'paid', 'Paid')}
  ${listCard('back', 'Additional income', M.back || [], 'received', 'Received')}
  ${payInChecking() ? listCard('incoming', `Paychecks for ${D.name(D.addMonths(ym, 1))}`, M.incoming || [], 'received', 'Arrived') : ''}
  ${[['other', 'other expense'], ['back', 'additional income'], ...(payInChecking() ? [['incoming', 'paycheck']] : [])].filter(([k]) => !(M[k] || []).length && S.adding !== k)
    .map(([k, l]) => `<button class="linkish small add-link" data-act="li-open" data-kind="${k}">+ Add ${l}</button>`).join('')}`;
}

// The eye hides checked-off rows on Overview (one setting for every list).
const EYE = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.6 7.6C4 9.4 2.5 12 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const eyeBtn = () => `<button class="eye" data-act="eye" aria-pressed="${S.hideDone}" aria-label="${S.hideDone ? 'Show checked items' : 'Hide checked items'}">${S.hideDone ? EYE_OFF : EYE}</button>`;
const doneNote = (n, word) => (S.hideDone && n ? `<p class="small muted done-note">${n} ${word} hidden</p>` : '');

function listCard(kind, title, items, flag, flagLabel) {
  const adding = S.adding === kind;
  if (!items.length && !adding) return '';
  return `<section class="card">
    <div class="row between card-head"><h2>${title}</h2>${eyeBtn()}</div>
    ${items.filter(o => !(S.hideDone && o[flag])).map(o => `<div class="check-row ${o[flag] ? 'done' : ''}">
      <button class="box ${o[flag] ? 'on' : ''}" data-act="li-toggle" data-kind="${kind}" data-id="${esc(o.id)}" aria-label="${flagLabel}">${o[flag] ? '✓' : ''}</button>
      <span class="grow"><button class="item-edit" data-act="li-edit" data-kind="${kind}" data-id="${esc(o.id)}" data-f="name" aria-label="Edit name">${esc(o.name)}</button></span>
      <button class="val-edit" data-act="li-edit" data-kind="${kind}" data-id="${esc(o.id)}" data-f="amount" aria-label="Edit amount">${money(o.amount)}</button>
      <button class="x small" data-act="li-del" data-kind="${kind}" data-id="${esc(o.id)}" aria-label="Remove">×</button>
    </div>`).join('')}
    ${doneNote(items.filter(o => o[flag]).length, kind === 'back' ? 'received' : 'paid')}
    ${adding ? `<div class="add-row"><input id="add-${kind}-name" placeholder="${kind === 'back' ? 'What’s coming in' : kind === 'incoming' ? 'Paycheck' : 'What is it'}"><input id="add-${kind}-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="li-add" data-kind="${kind}">Add</button></div>
      <button class="linkish small" data-act="li-open" data-kind="">Cancel</button>`
      : `<button class="linkish small add-link" data-act="li-open" data-kind="${kind}">+ Add</button>`}
  </section>`;
}

// Check/uncheck an item. Re-checking something that was already in before the
// last checking balance keeps its old time, so it isn't counted twice.
function toggleFlag(o, flag) {
  const key = flag + 'At';
  if (o[flag]) return { ...o, [flag]: false };
  const snap = ((S.months[homeYm()] || {}).checking || {}).at || 0;
  return { ...o, [flag]: true, [key]: o[key] && o[key] <= snap ? o[key] : Date.now() };
}

// Keep the Year tab's income for this month in step with the paychecks listed
// (amounts change with overtime). Goes to the household's first earner.
async function syncPayPlan(list, ym = homeYm()) {
  list = list || (S.months[ym] || {}).incoming || [];
  const e = Calc.earners(H())[0];
  if (!e) return;
  await B.setH([[['plans', ym, e.id], round2(list.reduce((a, x) => a + (Number(x.amount) || 0), 0))]]);
}

async function monthList(kind, fn) {
  const ym = homeYm();
  const M = S.months[ym] || {};
  const arr = fn([...(M[kind] || [])]);
  await B.setMonthField(ym, [kind], arr);
  if (kind === 'incoming') await syncPayPlan(arr, ym);
}

/* ---------- Year ---------- */

// The first year this household has anything in the app (no going back past it).
function firstYear() {
  const yms = [...Object.keys(H().plans || {}), ...Object.keys(S.months || {})].filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const years = [D.yearOf(homeYm())];
  if (yms.length) years.push(D.yearOf(yms[0]));
  if (H().created) years.push(new Date(H().created).getFullYear());
  return Math.min(...years);
}

function viewYear() {
  const hy = D.yearOf(homeYm());
  const Y = Math.max(S.year || hy, firstYear());
  const y = Calc.year(H(), S.months, Y, S.purchases, homeYm());
  const sv = H().savings || {};
  const actual = Number(sv.actual) || 0;
  const goalMin = Number(sv.goalMin) || 5000;
  const goalMax = Number(sv.goalMax) || 10000;
  const floor = Number(sv.floor) || 5000;
  const proj = y.endOfYear;
  const goalAll = bucketsOn() ? (H().buckets || []).reduce((a, b) => a + (Number(b.goal) || 0), 0) : 0;
  const top = Math.max(bucketsOn() ? goalAll * 1.05 : goalMax * 1.1, proj || 0, actual) || 1;
  const pc = v => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const showActual = Y === hy;
  const bar = `<div class="goal">
      <div class="goal-track">
        ${proj !== null && proj > actual ? `<i class="ghost" style="width:${pc(proj)}"></i>` : ''}
        <i class="fill" style="width:${pc(showActual ? actual : (proj || 0))}"></i>
        ${bucketsOn() ? (goalAll ? `<span class="mark" style="left:${pc(goalAll)}"><em>${money(goalAll)} goal</em></span>` : '')
          : `<span class="mark" style="left:${pc(goalMin)}"><em>${money(goalMin)}${floor === goalMin ? ' · floor' : ''}</em></span>
        <span class="mark" style="left:${pc(goalMax)}"><em>${money(goalMax)} goal</em></span>`}
      </div>
      <div class="goal-scale"><span>$0</span></div>
    </div>`;
  const rows = y.rows;
  const early = rows.filter(r => r.past && !r.hasData);
  const shown = rows.filter(r => !(r.past && !r.hasData));
  const cards = shown.map(yearCard).join('');
  const isOpen = r => !!S.open[r.ym];
  // Months start collapsed. If anything is open, the arrow closes everything; otherwise it
  // opens this month and later (or every month when looking back at a finished year).
  const allOpen = shown.length && shown.some(isOpen);
  const ahead = shown.filter(r => !r.past);
  const arrowYms = (allOpen || !ahead.length ? shown : ahead).map(r => r.ym);
  return `
  <header class="hero small-hero ink-title"><div class="row between"><button class="nav" data-act="yr" data-d="-1" aria-label="Previous year" ${Y <= firstYear() ? 'style="visibility:hidden" disabled' : ''}>‹</button><h1>${Y}</h1><button class="nav" data-act="yr" data-d="1" aria-label="Next year">›</button></div></header>
  <section class="card ${bucketsOn() && showActual ? 'tap-card' : ''}" ${bucketsOn() && showActual ? 'role="button" tabindex="0" data-act="go-savings"' : ''}>
    <div class="row between"><span class="label">Savings${showActual ? ' right now' : ''}</span><button class="linkish small" data-act="savings">Update</button></div>
    <div class="big-num">${money(showActual ? actual : proj || 0)}</div>
    ${bar}
    <div class="small muted">${proj !== null ? `On track for <b class="${proj >= goalMin ? 'save-good' : ''}">${money(proj)}</b> by Dec 31` : 'Add income for the months ahead to see a projection'}
      ${proj === null || bucketsOn() ? '' : (proj >= goalMax ? ' — past your goal! 🎉' : proj >= goalMin ? ' — past the minimum.' : ` — ${money(goalMin - proj)} short of the minimum.`)}</div>
    ${Number(sv.hysa) && !bucketsOn() ? `<div class="small muted">HYSA: ${money(sv.hysa)}</div>` : ''}
    ${bucketsOn() && showActual ? `<div class="small tap-hint">See what it’s set aside for ›</div>` : ''}
  </section>
  <div class="year-head-row"><h2 class="year-head">Projected Savings</h2>
  ${shown.length ? `<button class="toggle-all" data-act="all-months" data-open="${allOpen ? '0' : '1'}" data-yms="${arrowYms.join(',')}" aria-label="${allOpen ? 'Collapse all months' : 'Show all months'}">${allOpen ? '▲' : '▼'}</button>` : ''}</div>
  ${early.length ? `<p class="small muted center">${early.length === 12 ? 'No months planned for this year yet.' : 'Prior data kept in Google Sheets'}</p>` : ''}
  <div class="months">${cards}</div>
  ${early.length === 12 ? `<button class="btn ghost full" data-act="plan" data-ym="${Y}-01">Plan January ${Y}</button>` : ''}`;
}

function yearCard(r) {
  const color = monthColor(r.ym);
  const open = !!S.open[r.ym];
  const head = `<div class="mhead" style="background:${color};color:${onColor(color)}"><span>${D.name(r.ym)}</span>
    ${r.current ? '<span class="pill">This month</span>' : ''}${!open && r.balance !== null ? `<span class="small">${money(r.balance)}</span>` : ''}</div>`;
  if (!open) return `<button class="mcard card collapsed" data-act="expand" data-ym="${r.ym}" data-open="0" aria-expanded="false">${head}</button>`;
  const line = (label, v, cls = '') => `<div class="line ${cls}"><span>${label}</span><b>${v === null || v === undefined || v === '' ? '—' : money(v)}</b></div>`;
  // Tap a value to change it right here (e.g. picking up overtime in November).
  const eline = (label, v, k, est) => `<div class="line"><span>${label}${est ? ' <span class="small muted">usual</span>' : ''}</span><button class="val-edit ${est ? 'est' : ''}" data-act="inc" data-ym="${r.ym}" data-k="${k}" aria-label="Change ${esc(label.replace(/<[^>]+>/g, ''))}">${v === null || v === undefined || v === '' ? '—' : money(v)}</button></div>`;
  const prevName = D.short(D.addMonths(r.ym, -1));
  const hint = { auto: `${prevName} income − expenses − other${r.elevate ? ' + additional' : ''}`, live: 'from this month’s checklist', moved: 'moved at setup', set: 'set by you', noincome: `add ${prevName} income to estimate` }[r.kind] || '';
  const p = r.plan || {};
  // ElevateEMS pay is additional income in that same month (not a paycheck for next month).
  const elev = r.elevate ? eline(`Additional income${p.elevateName ? ` <span class="small muted">${esc(p.elevateName)}</span>` : ''}`, r.elevate, 'elevate') : '';
  const elevBtn = '';
  return `<section class="mcard card ${r.current ? 'current' : ''}">
    <button class="plain" data-act="expand" data-ym="${r.ym}" data-open="1" aria-expanded="true">${head}</button>
    <div class="mbody">
      <div class="next-funds">
        ${r.pay.map(e => eline(`${esc(e.name)} income`, e.v, e.id, e.est)).join('')}
        ${line('Total <span class="small muted">(for next month)</span>', r.total, 'sub')}
      </div>
      ${line(`${prevName}${prevName === D.name(D.addMonths(r.ym, -1)) ? '' : '.'} income`, r.prevIn, 'strong')}
      ${eline('Expenses', r.expenses, 'expenses')}
      ${(r.other || []).map(o => line(`<span class="muted">Other:</span> ${esc(o.name)}`, o.amount)).join('')}
      ${elev}
      ${r.past ? '' : `<div class="line"><span>Savings <span class="small muted">${hint}</span></span><b class="${r.savings < 0 ? 'neg' : ''}">${r.savings === null ? '—' : (r.savings > 0 ? '+' : '') + money(r.savings)}</b></div>`}
      <div class="line total-line"><span>Savings balance</span><b>${r.balance === null ? '—' : money(r.balance)}</b></div>
      ${p.note ? `<p class="small muted">${esc(p.note)}</p>` : ''}
      <div class="row gap wrap">${elevBtn}<button class="btn ghost small" data-act="plan" data-ym="${r.ym}">Edit ${D.short(r.ym)}</button></div>
    </div>
  </section>`;
}

function openPlan(ym) {
  const p = (H().plans || {})[ym] || {};
  const y = Calc.year(H(), S.months, D.yearOf(ym), S.purchases, homeYm()).rows.find(r => r.ym === ym);
  S.plan = { ym, other: (p.other || []).map(o => ({ ...o })) };
  const auto = (() => {
    const M = S.months[ym];
    return (H().bills || []).reduce((s, b) => s + Calc.billAmount(b, ym, M), 0) + (H().categories || []).reduce((s, c) => s + Calc.budgetFor(H(), M, c, ym), 0);
  })();
  const v = x => (x === undefined || x === null ? '' : x);
  S.sheet = 'plan';
  openSheet(`<div class="sheet-head"><h2>${D.label(ym)}</h2><button class="x" data-act="close">×</button></div>
    <div class="two">${Calc.earners(H()).map(e => `<label class="field"><span class="label">${esc(e.name)} income</span><input id="p-pay-${esc(e.id)}" inputmode="decimal" value="${v(p[e.id])}"></label>`).join('')}</div>
    <div class="two"><label class="field"><span class="label">Additional income <span class="muted small">(one-time, this month)</span></span><input id="p-elevate" inputmode="decimal" placeholder="$" value="${v(p.elevate)}"></label>
    <label class="field"><span class="label">What is it?</span><input id="p-elevname" placeholder="e.g. OT" value="${esc(p.elevateName || '')}"></label></div>
    <p class="small muted">Additional income goes into ${D.name(ym)}’s savings and shows up on its checklist when you set it up — it isn’t next month’s income.</p>
    <label class="field"><span class="label">Expenses <span class="muted small">(bills + budgets ≈ ${money(auto)})</span></span><input id="p-exp" inputmode="decimal" placeholder="${auto}" value="${v(p.expenses)}"></label>
    <div class="field"><span class="label">Other expenses (one-time: travel, Xmas, birthdays…)</span><div id="p-other">${planOtherHtml()}</div>
      <div class="add-row"><input id="p-oname" placeholder="What"><input id="p-oamt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="p-oadd">Add</button></div></div>
    ${S.months[ym] && S.months[ym].setup
      ? `<p class="small muted">${D.name(ym)} is already set up — change its budgets on the Budgets page.</p>`
      : `<div class="field"><span class="label">Budgets for ${D.name(ym)} <span class="muted small">(starts from your normal amounts; used when you set up the month)</span></span>
        ${H().categories.map(c => { const pb = (p.budgets || {})[c.id]; return `<div class="line"><span>${esc(c.emoji || '')} ${esc(c.name)} <span class="small muted">normally ${money(c.budget)}</span></span><input class="mini" id="p-b-${esc(c.id)}" inputmode="decimal" value="${pb !== undefined && pb !== null ? pb : c.budget}"></div>`; }).join('')}</div>`}
    <label class="field"><span class="label">Added to savings this month <span class="muted small">(leave blank to figure it automatically${y && y.kind === 'auto' ? `: ${money(y.savings)}` : ''})</span></span><input id="p-sav" inputmode="decimal" value="${v(p.savings)}"></label>
    <label class="field"><span class="label">Note</span><input id="p-note" value="${esc(p.note || '')}"></label>
    <div class="row end sheet-foot"><button class="btn" data-act="p-save">Save</button></div>`);
}
const planOtherHtml = () => S.plan.other.map(o => `<div class="line"><span>${esc(o.name)}</span><span><b>${money(o.amount)}</b> <button class="x small" data-act="p-odel" data-id="${esc(o.id)}">×</button></span></div>`).join('') || '<p class="muted small">None</p>';

async function savePlan() {
  const ym = S.plan.ym;
  const old = (H().plans || {})[ym] || {};
  const val = id => { const n = num($(id).value); return n === null ? null : n; };
  const p = {
    ...old,
    ...Object.fromEntries(Calc.earners(H()).map(e => [e.id, val(`#p-pay-${e.id}`)])),
    elevate: val('#p-elevate'), elevateName: $('#p-elevname').value.trim() || null,
    elevateToSavings: true, expenses: val('#p-exp'), savings: val('#p-sav'),
    other: S.plan.other, note: $('#p-note').value.trim(),
    budgets: (() => {
      const out = {};
      for (const c of H().categories) {
        const el = $(`#p-b-${c.id}`);
        if (!el) continue;
        const v = num(el.value);
        if (v !== null && v !== (Number(c.budget) || 0)) out[c.id] = v;
      }
      return Object.keys(out).length ? out : (S.months[ym] && S.months[ym].setup ? old.budgets || null : null);
    })(),
  };
  for (const k of Object.keys(p)) if (p[k] === null) delete p[k];
  closeSheet();
  await B.setH([[['plans', ym], p]]);
  toast(`${D.name(ym)} saved`);
}

async function setSavings(newVal, note, kind = 'set') {
  const sv = H().savings || {};
  const old = Number(sv.actual) || 0;
  const log = [...(sv.log || []), { t: Date.now(), amount: newVal - old, kind, note: note || '' }].slice(-200);
  await B.setH([[['savings', 'actual'], Math.round(newVal * 100) / 100], [['savings', 'asOf'], D.today()], [['savings', 'log'], log]]);
  for (const mark of [Number(sv.goalMin) || 5000, Number(sv.goalMax) || 10000]) {
    if (old < mark && newVal >= mark) { confetti(); toast(`Savings just passed ${money(mark)}! 🎉`); return; }
  }
}

/* ---------- More ---------- */

function nextSetupYm() {
  const cur = homeYm();
  return S.months[cur] && S.months[cur].setup ? D.addMonths(cur, 1) : cur;
}

/* ---------- Breakdown ---------- */

// Direction + amount for any money going between checking and savings. Starts
// at the app's number; type over it with what you actually moved.
function moveForm(key, excess) {
  const dir = excess < 0 ? 'out' : 'in';
  return `<div class="move-form" data-key="${key}" data-dir="${dir}">
    <div class="seg">${[['in', 'Into savings'], ['out', 'From savings']].map(([k, l]) => `<button type="button" class="${dir === k ? 'on' : ''}" data-act="mdir" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="amount move-amt"><span>$</span><input id="mv-${key}" inputmode="decimal" value="${Math.abs(round2(excess))}" aria-label="Amount"></label>
  </div>`;
}
// Signed amount from a move form: + into savings, − out of savings.
function readMove(key) {
  const box = view.querySelector(`.move-form[data-key="${key}"]`);
  const v = num($(`#mv-${key}`).value);
  if (v === null) return null;
  return box.dataset.dir === 'out' ? -Math.abs(v) : Math.abs(v);
}

// Every December (and January, in case it slips): move anything above the
// savings floor to the HYSA, then look ahead to the next year.
function hysaCard() {
  if (bucketsOn()) return '';
  const now = D.curYm();
  const m = D.monthNum(now);
  if (m !== 12 && m !== 1) return '';
  const Y = m === 12 ? D.yearOf(now) : D.yearOf(now) - 1;
  const sv = H().savings || {};
  if ((sv.hysaDone || {})[Y]) return '';
  const floor = Number(sv.floor) || 5000;
  const actual = Number(sv.actual) || 0;
  const extra = round2(actual - floor);
  return `<section class="card move-card hysa-card">
    <div class="line"><span><b>Year-end: transfer to HYSA</b></span><b>${extra > 0 ? money(extra) : '—'}</b></div>
    <p class="small muted">${extra > 0 ? `Savings is ${money(actual)} — ${money(extra)} above your ${money(floor)} floor. Move that to the HYSA (or type what you actually moved), then tap below.` : `Savings is at or under your ${money(floor)} floor. Type an amount if you moved anything anyway.`}</p>
    <label class="amount move-amt"><span>$</span><input id="mv-hysa" inputmode="decimal" value="${Math.max(0, extra)}" data-actual="${actual}" data-y="${Y}" aria-label="Amount moved to HYSA"></label>
    <button class="btn full" data-act="hysa" data-y="${Y}">Reset savings to <span id="hysa-left">${money(actual - Math.max(0, extra))}</span> and review ${Y + 1}</button>
  </section>`;
}

function viewReview() {
  const ym = S.bdYm || homeYm();
  setTimeout(() => ensureLoaded(ym).catch(e => console.warn('older purchases', e)), 0);
  const s = Calc.spent(S.purchases, ym);
  const M = S.months[ym];
  const tab = S.bdTab;
  let items;
  if (tab === 'cat') {
    items = (H().categories || []).map(c => ({ key: c.id, name: `${c.emoji || ''} ${c.name}`, amt: s.cat[c.id] || 0, budget: Calc.budgetFor(H(), M, c) }));
    for (const k in s.cat) if (!catById(k)) items.push({ key: k, name: k === 'uncat' ? 'Uncategorized' : 'Old category', amt: s.cat[k] });
  } else {
    const src = tab === 'store' ? s.store : s.tag;
    items = Object.keys(src).map(k => ({ key: k, name: k, amt: src[k] }));
    if (tab === 'store') {
      const none = s.list.filter(p => !p.store).reduce((a, p) => a + p.part, 0);
      if (none) items.push({ key: '', name: 'No store', amt: round2(none) });
    }
  }
  items.sort((a, b) => b.amt - a.amt);
  const max = Math.max(1, ...items.map(i => i.amt));
  const counts = key => s.list.filter(p => (tab === 'cat' ? p.cat === key : tab === 'store' ? (p.store || '') === key : (p.tags || []).includes(key))).length;
  const n = nextSetupYm();
  return `<header class="hero small-hero"><h1>Review</h1></header>
  ${hysaCard()}
  <a class="card setup-link" href="#/setup"><span class="grow"><b>Set up ${D.name(n)}</b><span class="small muted">Your month-end checklist, step by step</span></span><i>›</i></a>
  <h2 class="section-title">Breakdown</h2>
  <div class="row between month-nav"><button class="nav" data-act="bd-m" data-d="-1" aria-label="Previous month">‹</button><h2>${D.name(ym)} ${D.yearOf(ym)}</h2><button class="nav" data-act="bd-m" data-d="1" aria-label="Next month">›</button></div>
  <section class="card">
    <div class="row between"><span class="label">Spent in ${D.name(ym)}</span><b class="big">${money(s.total)}</b></div>
    <div class="seg">${[['cat', 'Categories'], ['store', 'Stores'], ['tag', 'Tags']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="bd-tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${items.length ? items.map(i => `<button class="bd-row" data-act="bd-item" data-key="${esc(i.key)}">
        <span class="row between"><span>${esc(i.name)}</span><span><b>${money(i.amt)}</b>${i.budget !== undefined ? ` <span class="small muted">of ${money(i.budget)}</span>` : ''}</span></span>
        <span class="bar thin"><i style="width:${(i.amt / max) * 100}%"></i></span>
        <span class="small muted">${counts(i.key)} purchase${counts(i.key) === 1 ? '' : 's'} · see past months ›</span>
      </button>`).join('') : `<p class="muted">${tab === 'tag' ? 'No tagged purchases this month.' : 'Nothing logged this month.'}</p>`}
  </section>
  <section class="card"><h2>Every purchase</h2>${s.list.length ? s.list.map(p => purchaseRow(p)).join('') : '<p class="muted small">None yet.</p>'}</section>
  ${Store.configured ? '' : '<div class="card"><p class="small muted">Sample mode keeps everything in this browser. Once Firebase is connected, you and Nick share the same data.</p><button class="btn ghost small" data-act="demo-reset">Reset sample data</button> <button class="btn ghost small" data-act="setup-file">Load setup file</button></div>'}`;
}

// One item (a category, store or tag) over the last 12 months: a simple bar chart
// (single series in the month color, value label on the chosen month only,
// tap a bar for its amount) plus that month's purchases underneath.
function openItem(key) {
  const ym = S.bdYm || homeYm();
  const tab = S.bdTab;
  const c = tab === 'cat' ? catById(key) : null;
  const title = tab === 'cat' ? (c ? `${c.emoji || ''} ${c.name}` : key === 'uncat' ? 'Uncategorized' : 'Old category') : (key || 'No store');
  const months = Array.from({ length: 12 }, (_, i) => D.addMonths(ym, i - 11));
  const val = m => {
    const s = Calc.spent(S.purchases, m);
    if (tab === 'cat') return s.cat[key] || 0;
    if (tab === 'store') return key ? s.store[key] || 0 : round2(s.list.filter(p => !p.store).reduce((a, p) => a + p.part, 0));
    return s.tag[key] || 0;
  };
  const vals = months.map(val);
  const max = Math.max(1, ...vals);
  const withData = vals.filter(v => v > 0);
  const avg = withData.length ? round2(withData.reduce((a, b) => a + b, 0) / withData.length) : 0;
  const s = Calc.spent(S.purchases, ym);
  const list = s.list.filter(p => (tab === 'cat' ? p.cat === key : tab === 'store' ? (p.store || '') === key : (p.tags || []).includes(key)));
  S.sheet = 'soft';
  openSheet(`<div class="sheet-head"><h2>${esc(title)}</h2><button class="x" data-act="close">×</button></div>
    <p class="small muted">Last 12 months${withData.length ? ` · average ${money(avg)} in months with spending` : ''}</p>
    <div class="chart" role="img" aria-label="${esc(title)} by month">
      ${months.map((m, i) => `<button class="col ${m === ym ? 'sel' : ''}" data-act="chart-tip" data-tip="${esc(D.short(m))}: ${money(vals[i])}">
        <span class="val">${m === ym ? money(vals[i]) : ''}</span>
        <span class="barv" style="height:${vals[i] ? Math.max(3, (vals[i] / max) * 100) : 0}%"></span>
        <span class="mlabel">${D.short(m).slice(0, 3)}</span></button>`).join('')}
    </div>
    <p id="chart-tip" class="small center muted">Tap a bar to see its amount</p>
    <h3>${D.name(ym)}</h3>
    ${list.length ? list.map(p => purchaseRow(p)).join('') : '<p class="muted small">No purchases this month.</p>'}
    <details class="small"><summary>As a table</summary><table class="tbl">${months.map((m, i) => `<tr><td>${D.label(m)}</td><td>${money(vals[i])}</td></tr>`).join('')}</table></details>`);
}

/* ---------- Savings buckets ---------- */

// Every savings dollar has a job: each bucket shows its balance toward its goal.
function bucketsSection(actual) {
  const h = H();
  const bal = Calc.bucketBalances(h);
  const list = h.buckets || [];
  const sum = round2(list.reduce((a, b) => a + bal[b.id], 0));
  const unassigned = round2(actual - sum);
  return `<section class="buckets">
    ${Math.abs(unassigned) > 0.004 ? `<div class="card unassigned"><div class="row between"><b>${unassigned > 0 ? 'Not assigned' : 'Buckets are over your savings by'}</b><b>${money(Math.abs(unassigned))}</b></div>
      <p class="small muted">${unassigned > 0 ? 'Savings that isn’t in a bucket yet.' : 'The buckets add up to more than your savings balance.'}</p>
      <button class="btn small" data-act="assign" data-v="${unassigned}">${unassigned > 0 ? 'Give it a job' : 'Take it from…'}</button></div>` : ''}
    ${list.map(b => {
      const goal = Number(b.goal) || 0;
      const full = goal && bal[b.id] >= goal - 0.004;
      const pct = goal ? Math.min(100, (bal[b.id] / goal) * 100) : 0;
      const fill = b.monthly ? `${money(b.monthly)}/mo` : Number(b.pct) ? `${b.pct}%` : '';
      return `<div class="bucket card" role="button" tabindex="0" data-act="bucket" data-id="${esc(b.id)}">
        <div class="row between"><span class="cat-name">${b.emoji ? `<span class="emoji">${esc(b.emoji)}</span>` : ''}${esc(b.name)}</span><span><b>${money(bal[b.id])}</b> <span class="muted small">/ ${money(goal)}</span></span></div>
        <div class="bar save-bar"><i style="width:${pct}%"></i></div>
        <div class="small muted">${full ? '✓ Full' : `${money(Math.max(0, goal - bal[b.id]))} to go`}${fill ? ` · fills ${fill}` : ''}${b.note ? ` · ${esc(b.note)}` : ''}</div>
      </div>`;
    }).join('')}
    <p class="small muted center">Press and hold a bucket to drag it into a new order.</p>
    <button class="linkish small add-link" data-act="bucket-new">+ Add bucket</button>
  </section>`;
}

function viewSavings() {
  const actual = Number((H().savings || {}).actual) || 0;
  return `<header class="hero small-hero ink-title"><a class="back" href="#/year">‹ Year</a><h1>Savings</h1></header>
  <section class="card"><div class="row between"><span class="label">Savings right now</span><button class="linkish small" data-act="savings">Update</button></div>
    <div class="big-num">${money(actual)}</div></section>
  ${bucketsSection(actual)}`;
}

const bucketById = id => (H().buckets || []).find(b => b.id === id);
async function addBucketTx(list) {
  const tx = [...(H().bucketTx || []), ...list.map(t => ({ id: newId(), date: D.today(), t: Date.now(), ...t }))].slice(-2000);
  await B.setH([[['bucketTx'], tx]]);
}

function openBucket(id) {
  const b = bucketById(id);
  if (!b) return;
  const bal = Calc.bucketBalances(H())[id];
  const hist = (H().bucketTx || []).filter(t => t.b === id).slice().reverse().slice(0, 40);
  const others = (H().buckets || []).filter(x => x.id !== id);
  S.sheet = 'bucket';
  openSheet(`<div class="sheet-head"><h2>${b.emoji ? esc(b.emoji) + ' ' : ''}${esc(b.name)}</h2><button class="x" data-act="close">×</button></div>
    <div class="line"><span>Balance</span><b class="big">${money(bal)}</b></div>
    <div class="seg">${[['add', 'Add money'], ['spend', 'Spend from it'], ['move', 'Move']].map(([k, l]) => `<button class="${S.bkMode === k ? 'on' : ''}" data-act="bk-mode" data-v="${k}" data-id="${esc(id)}">${l}</button>`).join('')}</div>
    <div class="two"><label class="field"><span class="label">Amount</span><input id="bk-amt" inputmode="decimal" placeholder="$"></label>
      ${S.bkMode === 'move'
        ? `<label class="field"><span class="label">Move to</span><select id="bk-to">${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></label>`
        : `<label class="field"><span class="label">Date</span><input id="bk-date" type="date" value="${D.today()}"></label>`}</div>
    <label class="field"><span class="label">${S.bkMode === 'spend' ? 'What was it for?' : 'Note'}</span><input id="bk-note" placeholder="${S.bkMode === 'spend' ? 'e.g. Oil change (Walmart)' : 'optional'}"></label>
    <p class="small muted">${S.bkMode === 'spend' ? 'Money that left savings. Lowers this bucket and your savings — its % next month stays the same.' : S.bkMode === 'add' ? 'New money into savings for this bucket (raises your savings too).' : 'Moves money between buckets. Your savings total doesn’t change.'}</p>
    <button class="btn full" data-act="bk-save" data-id="${esc(id)}">${S.bkMode === 'spend' ? 'Save spending' : S.bkMode === 'add' ? 'Add it' : 'Move it'}</button>
    <details class="small"><summary>Edit bucket (name, goal, %)</summary>
      <div class="edit-row"><input class="emoji-in" data-ch="bk" data-id="${esc(id)}" data-f="emoji" value="${esc(b.emoji || '')}" placeholder="🙂" aria-label="Emoji"><input class="grow" data-ch="bk" data-id="${esc(id)}" data-f="name" value="${esc(b.name)}" aria-label="Name"></div>
      <div class="three">
        <label class="field"><span class="label">Goal</span><input data-ch="bk" data-id="${esc(id)}" data-f="goal" inputmode="decimal" value="${esc(b.goal)}"></label>
        <label class="field"><span class="label">% of extra</span><input data-ch="bk" data-id="${esc(id)}" data-f="pct" inputmode="decimal" value="${esc(b.pct || 0)}"></label>
        <label class="field"><span class="label">or $/month</span><input data-ch="bk" data-id="${esc(id)}" data-f="monthly" inputmode="decimal" value="${esc(b.monthly || '')}" placeholder="—"></label>
      </div>
      <label class="field"><span class="label">Correct the balance <span class="small muted">(doesn’t change your savings total)</span></span><input data-ch="bk-bal" data-id="${esc(id)}" inputmode="decimal" value="${bal}"></label>
      <label class="field"><span class="label">Note on the card</span><input data-ch="bk" data-id="${esc(id)}" data-f="note" value="${esc(b.note || '')}" placeholder="e.g. Don’t touch"></label>
      <button class="btn ghost small danger" data-act="bk-del" data-id="${esc(id)}">Remove bucket</button>
    </details>
    <h3>History</h3>
    ${hist.length ? hist.map(t => `<div class="line small hist-row"><span>${D.niceDay(t.date)} · ${esc(t.note || { fill: 'Monthly savings', spend: 'Spent', add: 'Added', move: 'Moved', adjust: 'Balance corrected', start: 'Starting balance', cover: 'Covered overspending' }[t.kind] || '')}</span><span><span class="${t.amount < 0 ? 'neg' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</span> <button class="x small" data-act="bk-tx-del" data-id="${esc(t.id)}" data-b="${esc(id)}" aria-label="Delete this entry">×</button></span></div>`).join('') : '<p class="muted small">Nothing yet.</p>'}`);
}

// Where money going into (or out of) savings lands. Positive: every bucket
// starts filled in with its share (its % up to its goal), so Save is all it
// takes -- change any amount, and place whatever's left from full buckets.
// Negative: she picks which buckets cover it.
function openAllocate(amount, done, note) {
  const sp = amount > 0 ? Calc.splitIntoBuckets(H(), amount) : { add: {} };
  S.alloc = { amount, auto: sp.add, amt: { ...sp.add }, done, note };
  S.sheet = 'alloc';
  openSheet(allocHtml());
}
function allocLeft() {
  const A = S.alloc;
  return round2(Math.abs(A.amount) - Object.values(A.amt).reduce((a, v) => a + (Number(v) || 0), 0));
}
// The pinned line at the top: what's still to place (updates as she types).
function allocSumHtml() {
  const A = S.alloc;
  const out = A.amount < 0;
  const left = allocLeft();
  if (Math.abs(left) <= 0.004) return `<div class="alloc-sum ok"><b>${money(0)}</b> <span>${out ? 'All covered ✓' : 'All placed ✓'}</span></div>`;
  if (left < 0) return `<div class="alloc-sum over"><b>Over by ${money(-left)}</b> <span>${out ? 'more than needed' : 'more than you moved'}</span></div>`;
  return `<div class="alloc-sum left"><b>${money(left)}</b> <span>${out ? 'still to cover' : 'left to place'}</span>
    ${!out ? `<div class="row gap wrap"><button class="btn ghost small" data-act="alloc-even">Split the rest evenly</button><select id="alloc-one" data-ch="alloc-one" aria-label="Put the rest in one bucket"><option value="">Rest to one bucket…</option>${(H().buckets || []).map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}</div>`;
}
function allocSaveLabel() {
  const out = S.alloc.amount < 0;
  const left = allocLeft();
  return !out && left > 0.004 ? `Save (${money(left)} not assigned)` : !out && left < -0.004 ? `Save (${money(-left)} more than you moved)` : 'Save';
}
function allocHtml() {
  const A = S.alloc;
  const bal = Calc.bucketBalances(H());
  const out = A.amount < 0;
  const total = Math.abs(A.amount);
  return `<div class="sheet-head alloc-head"><h2>${out ? `Cover ${money(total)}` : `Split ${money(total)}`}</h2><button class="x" data-act="close">×</button>
      <div id="alloc-sum" class="alloc-pin">${allocSumHtml()}</div></div>
    <p class="small muted">${out ? 'Pick which buckets this comes out of.' : 'Each bucket is filled in with its share. Tap Save, or change any amount first.'}</p>
    ${(H().buckets || []).map(b => {
      const auto = A.auto[b.id] || 0;
      const goal = Number(b.goal) || 0;
      const hint = auto ? (b.monthly ? 'monthly' : `${b.pct}%`) : goal && bal[b.id] >= goal - 0.004 ? 'full' : '';
      return `<div class="line alloc-line"><span><b>${b.emoji ? esc(b.emoji) + ' ' : ''}${esc(b.name)}</b> <span class="small muted">${money(bal[b.id])}${goal ? ` / ${money(goal)}` : ''}${hint ? ` · ${hint}` : ''}</span></span>
        <input class="mini" data-ch="alloc" data-id="${esc(b.id)}" inputmode="decimal" placeholder="${out ? '−$' : '+$'}" value="${A.amt[b.id] ? A.amt[b.id] : ''}"></div>`;
    }).join('')}
    <div class="row end sheet-foot"><button class="btn" id="alloc-save" data-act="alloc-save" ${out && Math.abs(allocLeft()) > 0.004 ? 'disabled' : ''}>${allocSaveLabel()}</button></div>`;
}
function redrawAlloc() { const y = $('#sheet').scrollTop; $('#sheet').innerHTML = allocHtml(); $('#sheet').scrollTop = y; }

/* ---------- Weekly import (Navy Federal CSV) ---------- */

function pickImportFile() {
  const f = $('#file');
  f.value = '';
  f.accept = '.csv,text/csv';
  f.onchange = async () => {
    const file = f.files[0];
    f.accept = 'image/*';
    if (!file) return;
    try {
      const text = await file.text();
      const res = Imp.classify(text, H(), S.months);
      const last = (H().imports || {}).through;
      let gap = '';
      if (last && res.from && res.from > D.dayStr(new Date(new Date(last + 'T12:00').getTime() + 864e5))) {
        gap = `Your last import went through ${D.niceDay(last)}, but this file starts ${D.niceDay(res.from)}. A few days might be missing — download a longer date range to be safe.`;
      }
      for (const r of res.rows) r.firstNeeds = r.status === 'review' && (!r.cat || r.ask || r.venmo || (r.payCandidate && r.reason.endsWith('?')));
      S.imp = { name: file.name, rows: res.rows, from: res.from, through: res.through, gap, showSkipped: false };
      location.hash = '#/import';
    } catch (e) { console.error(e); toast(e.message || 'Couldn’t read that file'); }
  };
  f.click();
}

const catOptions = (sel, withSkip) => `<option value="" ${!sel ? 'selected' : ''}>Pick a category…</option>`
  + H().categories.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc((c.emoji || '') + ' ' + c.name)}</option>`).join('')
  + `<option value="uncat" ${sel === 'uncat' ? 'selected' : ''}>Uncategorized (decide later)</option>`
  + (withSkip ? `<option value="skip" ${sel === 'skip' ? 'selected' : ''}>Skip — don’t count it</option>` : '');

function impRow(r) {
  if (r.payCandidate) {
    return `<div class="imp-row ${!r.cat ? 'needs' : ''} ${r.cat === 'skip' ? 'skipped' : ''}">
      <div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>+${money(r.amount)}</b></div>
      <div class="small muted">${esc(r.reason)}</div>
      <div class="imp-ctl"><select data-ch="imp-cat" data-i="${r.i}" aria-label="Paycheck?"><option value="" ${!r.cat ? 'selected' : ''}>Is this a paycheck?</option><option value="pay" ${r.cat === 'pay' ? 'selected' : ''}>Yes — a paycheck</option><option value="skip" ${r.cat === 'skip' ? 'selected' : ''}>No — skip it</option></select></div>
      ${r.cat ? `<label class="small remember"><input type="checkbox" data-ch="imp-remember" data-i="${r.i}" ${r.remember ? 'checked' : ''}> Always ${r.cat === 'pay' ? 'treat this as a paycheck' : 'skip this'}</label>` : ''}
    </div>`;
  }
  const needs = !r.cat && !r.splits;
  const tagChips = r.tags.map(t => `<span class="tag">${esc(t)} <button class="chip-x" data-act="imp-untag" data-i="${r.i}" data-v="${esc(t)}" aria-label="Remove tag">×</button></span>`).join('');
  const split = r.splits ? `<div class="splits">${r.splits.map((sp, j) => `<div class="edit-row"><input class="mini" data-ch="imp-split-amt" data-i="${r.i}" data-j="${j}" inputmode="decimal" value="${sp.amount}"><select data-ch="imp-split-cat" data-i="${r.i}" data-j="${j}">${catOptions(sp.cat)}</select><select class="split-tag" data-ch="imp-split-tag" data-i="${r.i}" data-j="${j}" aria-label="Tag"><option value="">Tag</option>${(H().tags || []).map(t => `<option ${sp.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${j ? `<button class="x small" data-act="imp-split-del" data-i="${r.i}" data-j="${j}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
      <div class="small ${Math.abs(r.splits.reduce((a, x) => a + (Number(x.amount) || 0), 0) - r.amount) > 0.004 ? 'warn' : 'muted'}">Split total ${money(r.splits.reduce((a, x) => a + (Number(x.amount) || 0), 0))} of ${money(r.amount)} · <button class="linkish small" data-act="imp-split-add" data-i="${r.i}">+ another</button> · <button class="linkish small" data-act="imp-split-off" data-i="${r.i}">undo split</button></div></div>` : '';
  return `<div class="imp-row ${needs ? 'needs' : ''} ${r.cat === 'skip' ? 'skipped' : ''}">
    <div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${r.amount < 0 ? '−' : ''}${money(Math.abs(r.amount))}${r.amount < 0 ? ' <span class="small muted">back</span>' : ''}</b></div>
    <div class="small muted">${esc(r.reason)}</div>
    ${r.splits ? split : `<div class="imp-ctl"><select data-ch="imp-cat" data-i="${r.i}" aria-label="Category">${catOptions(r.cat, true)}</select>
      ${r.cat !== 'skip' ? `<select data-ch="imp-tag" data-i="${r.i}" aria-label="Add a tag"><option value="">+ Tag</option>${(H().tags || []).filter(t => !r.tags.includes(t)).map(t => `<option>${esc(t)}</option>`).join('')}</select>
      ${r.amount > 0 ? `<button class="btn ghost small" data-act="imp-split" data-i="${r.i}">Split</button>` : ''}` : ''}</div>`}
    ${tagChips ? `<div class="tags">${tagChips}</div>` : ''}
    ${!r.ask && !r.venmo && r.cat && r.cat !== 'uncat' && !r.splits ? `<label class="small remember"><input type="checkbox" data-ch="imp-remember" data-i="${r.i}" ${r.remember ? 'checked' : ''}> Always use this for ${esc(r.name)}</label>` : ''}
  </div>`;
}

function viewImport() {
  const I = S.imp;
  if (!I) return `<header class="hero small-hero"><a class="back" href="#/home">‹ Home</a><h1>Import</h1></header>
    <section class="card"><p>Download your joint checking transactions from Navy Federal as a <b>CSV</b> (any date range — overlaps are fine), then pick the file.</p>
    <button class="btn full" data-act="import-file">Choose file</button></section>`;
  const live = I.rows.filter(r => r.status !== 'dup');
  const dups = I.rows.length - live.length;
  const review = live.filter(r => r.status === 'review');
  const skipped = live.filter(r => r.status === 'skip');
  const first = review.filter(r => r.firstNeeds);
  const rest = review.filter(r => !r.firstNeeds);
  const open = review.filter(r => !r.cat && !r.splits && !r.payCandidate).length + review.filter(r => r.payCandidate && !r.cat).length;
  return `<header class="hero small-hero"><a class="back" href="#/home" data-act="imp-cancel">‹ Cancel</a><h1>Import</h1></header>
  <section class="card">
    <div class="line"><span><b>${D.niceDay(I.from)} – ${D.niceDay(I.through)}</b></span><span class="small muted">${esc(I.name)}</span></div>
    <p class="small muted">${review.length} to review · ${skipped.length} skipped (bills & transfers)${dups ? ` · ${dups} already imported` : ''}</p>
    ${I.gap ? `<p class="msg small">${esc(I.gap)}</p>` : ''}
  </section>
  ${first.length ? `<h2 class="section-title">Needs a look <span class="small muted">${open} left</span></h2>${first.map(impRow).join('')}` : ''}
  ${rest.length ? `<h2 class="section-title">Ready</h2>${rest.map(impRow).join('')}` : ''}
  ${!review.length ? '<p class="muted center">Nothing new to add from this file.</p>' : ''}
  ${skipped.length ? `<button class="linkish small add-link" data-act="imp-skipped">${I.showSkipped ? 'Hide' : 'Show'} ${skipped.length} skipped</button>${I.showSkipped ? skipped.map(impRow).join('') : ''}` : ''}
  ${open ? `<p class="small muted center">${open} without a category will go to Uncategorized (Venmo and unanswered deposits are skipped).</p>` : ''}
  <section class="card">
    <label class="field"><span class="label">Checking balance right now <span class="small muted">(optional)</span></span>
      <span class="amount move-amt"><span>$</span><input data-ch="imp-bal" inputmode="decimal" placeholder="from your Navy Federal app" value="${esc(I.bal || '')}"></span></label>
    <p class="small muted">Fill this in and Checking on Overview is set to it when you save. Leave it blank to keep the app’s estimate.</p>
  </section>
  <div class="import-save">
    <button class="btn full" data-act="imp-save">Save ${live.reduce((n, r) => n + (r.payCandidate || r.cat === 'skip' || (r.venmo && !r.cat && !r.splits) ? 0 : r.splits ? r.splits.filter(x => Number(x.amount)).length : 1), 0)} purchases${live.some(r => r.payCandidate && r.cat === 'pay') ? ` + ${live.filter(r => r.payCandidate && r.cat === 'pay').length} paycheck${live.filter(r => r.payCandidate && r.cat === 'pay').length === 1 ? '' : 's'}` : ''}</button>
  </div>`;
}

async function saveImport() {
  const I = S.imp;
  const now = Date.now();
  const purchases = [];
  const keysByMonth = {};
  const rules = { ...(H().rules || {}) };
  const pays = [];
  let latest = (H().imports || {}).through || '';
  for (const r of I.rows) {
    if (r.status === 'dup') continue;
    const ym = D.ymOf(r.date);
    (keysByMonth[ym] = keysByMonth[ym] || []).push(r.key);
    if (r.post && r.post > latest) latest = r.post;
    if (r.payCandidate) {
      if (r.remember && r.cat) rules[r.ruleKey] = { action: r.cat === 'pay' ? 'pay' : 'skip', name: r.name };
      if (r.cat === 'pay') pays.push(r);
      continue;
    }
    if (r.cat === 'skip' || (r.venmo && !r.cat && !r.splits)) {
      if (r.remember && r.cat === 'skip' && !r.ask) rules[r.ruleKey] = { action: 'skip', name: r.name };
      continue;
    }
    const base = {
      store: r.name, note: '', date: r.date, spread: 1, by: 'import', byName: 'Bank', src: 'import',
      key: r.key, t: new Date(`${r.post || r.date}T12:00`).getTime(), until: D.ymOf(r.date),
    };
    if (r.splits) {
      r.splits.forEach((sp, j) => { const a = Number(sp.amount) || 0; if (a) purchases.push({ ...base, key: `${r.key}:${j}`, amount: a, cat: sp.cat || 'uncat', tags: [...new Set([...r.tags, ...(sp.tag ? [sp.tag] : [])])] }); });
    } else {
      purchases.push({ ...base, amount: r.amount, cat: r.cat || 'uncat', tags: [...r.tags] });
    }
    if (r.remember && !r.ask && !r.venmo && r.cat && r.cat !== 'uncat' && !r.splits) rules[r.ruleKey] = { action: 'cat', cat: r.cat, tags: [...r.tags], name: r.name };
  }
  if (purchases.length) await B.savePurchases(purchases);
  // Bills that came through at a different amount: use the real charge for that month.
  const billHits = {};
  for (const r of I.rows) {
    if (r.status === 'dup' || !r.billId) continue;
    const k = `${D.ymOf(r.date)}|${r.billId}`;
    billHits[k] = round2((billHits[k] || 0) + (Number(r.charged) || 0));
  }
  for (const k in billHits) {
    const [ym, id] = k.split('|');
    const b = (H().bills || []).find(x => x.id === id);
    if (!b) continue;
    if (Math.abs(billHits[k] - Calc.billNormal(b, ym)) > 0.004) await B.setMonthField(ym, ['billAmt', id], billHits[k]);
  }
  // Each paycheck checks off the next one expected that month, with its real
  // amount (overtime and all); if they've all arrived, it's added to the list.
  const byMonth = {};
  for (const r of pays.sort((a, b) => (a.date < b.date ? -1 : 1))) (byMonth[D.ymOf(r.date)] = byMonth[D.ymOf(r.date)] || []).push(r);
  for (const ym in byMonth) {
    const list = [...((S.months[ym] || {}).incoming || [])].map(x => ({ ...x }));
    for (const r of byMonth[ym]) {
      const at = new Date(`${r.post || r.date}T12:00`).getTime();
      const slot = list.find(x => !x.received);
      if (slot) Object.assign(slot, { amount: r.amount, received: true, receivedAt: at, fromImport: true });
      else list.push({ id: newId(), name: `Paycheck ${list.length + 1}`, amount: r.amount, received: true, receivedAt: at, fromImport: true });
    }
    await B.setMonthField(ym, ['incoming'], list);
    await syncPayPlan(list, ym);
  }
  for (const ym in keysByMonth) {
    const had = (S.months[ym] || {}).importedKeys || [];
    await B.setMonthField(ym, ['importedKeys'], [...new Set([...had, ...keysByMonth[ym]])]);
  }
  await B.setH([[['rules'], rules], [['imports', 'through'], latest], [['imports', 'at'], now]]);
  const bal = num(I.bal);
  if (bal !== null) await B.setMonth(homeYm(), { checking: { amount: bal, at: now } });
  S.imp = null;
  S.page = 'budgets';
  location.hash = '#/home';
  toast(`Imported ${purchases.length} purchase${purchases.length === 1 ? '' : 's'}${pays.length ? ` · ${pays.length} paycheck${pays.length === 1 ? '' : 's'}` : ''}${bal !== null ? ` · checking set to ${money(bal)}` : ''}`);
}

/* ---------- Month setup (the Checklist, step by step) ---------- */

const STEPS = ['Look back', 'Checking', 'Bills & extras', 'Budgets', 'Paychecks', 'Savings'];

function startDraft() {
  const N = nextSetupYm();
  const R = D.addMonths(N, -1);
  const MN = S.months[N];
  const MR = S.months[R] || {};
  const plan = (H().plans || {})[N] || {};
  const d = { ym: N, step: 0, checking: '' };
  if (MN && MN.setup) {
    d.redo = true;
    d.other = (MN.other || []).map(o => ({ ...o }));
    d.back = (MN.back || []).map(o => ({ ...o }));
    d.held = (MN.held || []).map(o => ({ ...o }));
    d.budgets = { ...(MN.budgets || {}) };
  } else {
    const carried = (MR.other || []).filter(o => !o.paid).map(o => ({ ...o, id: newId(), carried: true }));
    d.other = carried.concat((plan.other || []).map(o => ({ id: newId(), name: o.name, amount: o.amount, paid: false })));
    d.back = (MR.back || []).filter(b => !b.received).map(b => ({ ...b, carried: true }));
    if (Number(plan.elevate) > 0) d.back.push({ id: newId(), name: plan.elevateName || 'Additional income', amount: Number(plan.elevate), received: false });
    d.held = (H().helpers || []).map(h => ({ ...h, received: false }));
    d.budgets = {};
  }
  for (const c of H().categories) if (d.budgets[c.id] === undefined) d.budgets[c.id] = Calc.budgetFor(H(), null, c, N);
  // Starts from the Year tab: the month's own amount, else the usual income.
  d.pay = Object.fromEntries(Calc.earners(H()).map(e => [e.id, plan[e.id] ?? (H().usual || {})[e.id] ?? '']));
  // Paid every two weeks into checking: start with two paychecks splitting the
  // planned (or usual) amount; amounts are editable and a third can be added.
  if (payInChecking()) {
    const e = Calc.earners(H())[0];
    const monthly = Number(plan[e.id]) || Number((H().usual || {})[e.id]) || 0;
    const half = round2(monthly / 2);
    d.incoming = MN && MN.setup && MN.incoming ? MN.incoming.map(x => ({ ...x }))
      : [{ id: newId(), name: 'Paycheck 1', amount: half, received: false }, { id: newId(), name: 'Paycheck 2', amount: round2(monthly - half), received: false }];
  }
  S.draft = d;
}

// Left blank in setup = use the app's current checking estimate.
function estChecking() { const cur = homeYm(); return Calc.checklist(H(), S.months[cur], cur, S.purchases).est; }

function draftMonth(d) {
  return {
    setup: true, budgets: d.budgets, checking: { amount: num(d.checking) !== null ? num(d.checking) : estChecking(), at: Date.now() }, bills: {},
    other: d.other, back: d.back, held: d.held, moved: null, ...(d.incoming ? { incoming: d.incoming } : {}),
  };
}

function readDraftInputs() {
  const d = S.draft;
  if (!d) return;
  const v = id => { const el = $(id); return el ? el.value : undefined; };
  if (v('#d-checking') !== undefined) d.checking = v('#d-checking');
  for (const c of H().categories) { const x = v(`#d-b-${c.id}`); if (x !== undefined) d.budgets[c.id] = num(x) || 0; }
  for (const h of d.held) { const x = v(`#d-h-${h.id}`); if (x !== undefined) h.amount = num(x) || 0; }
  for (const e of Calc.earners(H())) { const x = v(`#d-pay-${e.id}`); if (x !== undefined) d.pay[e.id] = x; }
  for (const x of d.incoming || []) {
    const n = v(`#d-in-name-${x.id}`); if (n !== undefined) x.name = n.trim() || x.name;
    const a = v(`#d-in-amt-${x.id}`); if (a !== undefined) x.amount = num(a) || 0;
  }
  if (d.incoming && payInChecking()) { const e = Calc.earners(H())[0]; d.pay[e.id] = round2(d.incoming.reduce((a, x) => a + (Number(x.amount) || 0), 0)); }
}

function viewSetup() {
  if (!S.draft) startDraft();
  const d = S.draft;
  const N = d.ym;
  const R = D.addMonths(N, -1);
  const steps = `<div class="steps">${STEPS.map((s, i) => `<span class="${i === d.step ? 'on' : i < d.step ? 'done' : ''}"></span>`).join('')}</div>`;
  let body = '';
  if (d.step === 0) {
    const c = Calc.checklist(H(), S.months[R], R, S.purchases);
    const any = c.spent.list.length;
    const under = c.cats.filter(x => !x.over && x.used > 0);
    body = `<h2>How did ${D.name(R)} go?</h2>
      ${any ? c.cats.map(x => `<div class="line ${x.over ? 'over-line' : ''}"><span>${esc(x.emoji || '')} ${esc(x.name)} ${x.over ? `<span class="small over-txt">${calm() ? 'over by' : 'over'} ${money(x.used - x.budget)}</span>` : x.used > 0 ? `<span class="small good">${money(x.left)} under 🎉</span>` : ''}</span><b>${money(x.used)} <span class="small muted">/ ${money(x.budget)}</span></b></div>`).join('')
        + `<p class="small muted">${c.cats.some(x => x.over) ? (calm() ? 'Anything over is just information — maybe that budget needs a little more room, or it was a one-off month.' : 'Categories over budget are highlighted.') : 'Everything stayed within budget. Nice work.'} <a href="#/review" data-act="bd-go" data-ym="${R}">See the breakdown ›</a></p>`
        : `<p class="muted">Nothing was logged in the app for ${D.name(R)} — that’s fine, this is a fresh start.</p>`}
      `;
    if (under.length && calm() && !d.celebrated) { d.celebrated = true; setTimeout(confetti, 400); }
  } else if (d.step === 1) {
    const cur = homeYm();
    const est = Calc.checklist(H(), S.months[cur], cur, S.purchases).est;
    body = `<h2>Checking balance</h2><p class="muted">What does joint checking show right now?</p>
      <label class="amount"><span>$</span><input id="d-checking" inputmode="decimal" placeholder="${est}" value="${esc(d.checking)}"></label>
      <p class="small muted">The app’s estimate is ${money(est)}. Additional income you’re still expecting gets added on the next step.</p>`;
  } else if (d.step === 2) {
    const bills = (H().bills || []).map(b => {
      const hs = d.held.filter(h => h.bill === b.id);
      return `<div class="line"><span>${D.ordinal(b.day)} · ${esc(b.name)}</span><b>${money(Calc.billAmount(b, N))}</b></div>`
        + hs.map(h => `<div class="check-row share-row ${h.received ? 'done' : ''}"><button class="box ${h.received ? 'on' : ''}" data-act="d-toggle" data-kind="held" data-id="${esc(h.id)}" aria-label="Received">${h.received ? '✓' : ''}</button><span class="grow">${esc(h.name)}’s share <span class="small muted">${h.received ? 'in checking' : 'not in yet'}</span></span><input class="mini" id="d-h-${esc(h.id)}" inputmode="decimal" value="${esc(h.amount)}"></div>`).join('');
    }).join('');
    const row = (kind, flag) => o => `<div class="check-row ${o[flag] ? 'done' : ''}"><button class="box ${o[flag] ? 'on' : ''}" data-act="d-toggle" data-kind="${kind}" data-id="${esc(o.id)}">${o[flag] ? '✓' : ''}</button><span class="grow">${esc(o.name)}</span><b>${money(o.amount)}</b><button class="x small" data-act="d-del" data-kind="${kind}" data-id="${esc(o.id)}">×</button></div>`;
    // Items from the Year tab first; anything from last month that wasn't checked off gets its own group.
    const rows = (kind, flag) => {
      const fresh = d[kind].filter(o => !o.carried);
      const open = d[kind].filter(o => o.carried);
      if (!fresh.length && !open.length) return '<p class="muted small">None</p>';
      return fresh.map(row(kind, flag)).join('') + (open.length ? `<p class="small carried-head"><b>Still open from ${D.name(R)}</b> <span class="muted">Not checked off yet — remove any that are done.</span></p>${open.map(row(kind, flag)).join('')}` : '');
    };
    const add = kind => `<div class="add-row"><input id="d-${kind}-name" placeholder="What"><input id="d-${kind}-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="d-add" data-kind="${kind}">Add</button></div>`;
    body = `<h2>Bills & extras for ${D.name(N)}</h2>
      <h3>Automatic payments</h3>${bills}<p class="small muted">Check off shared payments that are already in. Change bills in Settings.</p>
      <h3>Other expenses</h3><p class="small muted">One-time things this month. Check any that are already paid.</p>${rows('other', 'paid')}${add('other')}
      <h3>Additional income</h3><p class="small muted">Refunds or extra money you’re expecting this month.</p>${rows('back', 'received')}${add('back')}`;
  } else if (d.step === 3) {
    body = `<h2>Budgets for ${D.name(N)}</h2><p class="muted">Start from your normal amounts. Trim any this month if things are tight — next month goes back to normal.</p>
      ${H().categories.map(c => `<div class="line"><span>${esc(c.emoji || '')} ${esc(c.name)} <span class="small muted">normally ${money(c.budget)}</span></span><input class="mini" id="d-b-${esc(c.id)}" inputmode="decimal" value="${esc(d.budgets[c.id])}"></div>`).join('')}
      <div class="line total-line"><span>Total</span><b>${money(Object.values(d.budgets).reduce((a, b) => a + (Number(b) || 0), 0))}</b></div>`;
  } else if (d.step === 4 && payInChecking()) {
    body = `<h2>Paychecks in ${D.name(N)}</h2><p class="muted">They land in checking during ${D.name(N)} and pay for ${D.name(D.addMonths(N, 1))}. Change any amount (overtime!) — you can edit them during the month too.</p>
      ${d.incoming.map(x => `<div class="line"><input class="grow item-in" id="d-in-name-${esc(x.id)}" value="${esc(x.name)}" aria-label="Name"><input class="mini" id="d-in-amt-${esc(x.id)}" inputmode="decimal" value="${esc(x.amount)}" aria-label="Amount"><button class="x small" data-act="d-del" data-kind="incoming" data-id="${esc(x.id)}" aria-label="Remove">×</button></div>`).join('')}
      <button class="linkish small" data-act="d-in-add">+ Add a paycheck</button>
      <div class="line total-line"><span>Total</span><b>${money(d.incoming.reduce((a, x) => a + (Number(x.amount) || 0), 0))}</b></div>`;
  } else if (d.step === 4) {
    body = `<h2>Paychecks in ${D.name(N)}</h2><p class="muted">What you expect to get paid this month (these pay for ${D.name(D.addMonths(N, 1))}). Filled in from the Year tab — change it here and the Year tab updates too.</p>
      <div class="two">${Calc.earners(H()).map(e => `<label class="field"><span class="label">${esc(e.name)}</span><input id="d-pay-${esc(e.id)}" inputmode="decimal" value="${esc(d.pay[e.id])}"></label>`).join('')}</div>
      <p class="small muted">One-time money for ${D.name(N)} goes under Additional income on the Bills & extras step.</p>`;
  } else {
    const M = draftMonth(d);
    const c = Calc.checklist(H(), M, N, S.purchases);
    const line = (sign, label, amt) => `<div class="line"><span><i class="sign">${sign}</i>${label}</span><b>${money(amt)}</b></div>`;
    body = `<h2>Savings/Excess</h2>
      <div class="line"><span>Checking</span><b>${money(c.est)}</b></div>
      ${c.backIn ? line('+', 'Additional income', c.backIn) : ''}
      ${c.owed ? line('+', 'Still owed for shared bills', c.owed) : ''}
    ${c.heldBack ? line('−', 'Held for shared bills (theirs)', c.heldBack) : ''}
    ${c.nextPay ? line('−', 'Set aside for next month (paychecks)', c.nextPay) : ''}
      ${line('−', `${D.name(N)} bills still to come`, c.billsLeft)}
      ${c.otherLeft ? line('−', 'Other expenses to pay', c.otherLeft) : ''}
      ${line('−', 'Budgets', c.budgetsLeft)}
      <div class="line total-line ${c.excess < 0 ? 'neg' : ''}"><span>Savings/Excess</span><b>${money(c.excess)}</b></div>
      <div class="stack">${moveChoice(c.excess, d)}</div>`;
  }
  return `<header class="hero small-hero"><h1>Set up ${D.name(N)}</h1>${d.redo ? '<div class="hero-sub">Already set up — this will redo it</div>' : ''}</header>
    ${steps}<section class="card setup">${body}</section>
    <div class="row between">${d.step > 0 ? '<button class="btn ghost" data-act="d-back">Back</button>' : '<a class="btn ghost" href="#/review" data-act="d-cancel">Cancel</a>'}
      ${d.step < STEPS.length - 1 ? `<button class="btn" data-act="d-next">Next: ${STEPS[d.step + 1]}</button>` : ''}</div>`;
}

// Last setup step: keep a cushion in checking and suggest moving only what's above it.
function moveChoice(excess, d) {
  const buf = checkingBuffer();
  const above = round2(excess - buf);
  const finish = (label, ghost) => `<button class="btn ${ghost ? 'ghost ' : ''}full" data-act="d-finish" data-mode="none">${label}</button>`;
  const moveBtn = label => `<button class="btn full" data-act="d-finish" data-mode="move">${label}</button>`;
  if (excess < -0.004) return `<p class="small muted">Spending is planned past what’s in checking. Cover it from savings now, or leave it and see how the month goes. Change the amount to what you actually move.</p>
    ${moveForm('setup', excess)}${moveBtn('Finish & save transfer')}${finish('Finish — leave it for now', true)}`;
  if (above > 0.004) return `<p class="small muted">Keep a cushion in checking for surprises. You can move anything above it to savings now — or leave it all in checking.</p>
    <div class="line"><span>Cushion to keep in checking</span><b>${money(buf)}</b></div>
    <div class="line"><span><b>Could move now</b></span></div>
    ${moveForm('setup', above)}${moveBtn('Finish & move to savings')}${finish('Finish — keep it all in checking', true)}`;
  if (d.showMove) return `<p class="small muted">Change the amount to what you actually move.</p>${moveForm('setup', Math.max(0, excess))}${moveBtn('Finish & save transfer')}${finish('Finish — keep it all in checking', true)}`;
  return `<p class="small muted">${excess > 0.004 ? `Your ${money(excess)} excess is under your ${money(buf)} cushion — leave it in checking this month.` : 'Nothing extra to move this month.'}</p>
    ${finish('Finish')}${excess > 0.004 ? '<button class="linkish small" data-act="d-showmove">Move some anyway</button>' : ''}`;
}

async function finishSetup(mode) {
  readDraftInputs();
  const d = S.draft;
  const N = d.ym;
  const M = draftMonth(d);
  const c = Calc.checklist(H(), M, N, S.purchases);
  M.setupAt = Date.now();
  if (mode === 'move') {
    const v = readMove('setup');
    if (!v) { toast('Type the amount you moved'); return; }
    M.moved = v;
    if (bucketsOn() && (H().buckets || []).length && !S.allocTx) {
      openAllocate(v, tx => { S.allocTx = tx; finishSetup(mode); });
      return;
    }
  }
  const R = D.addMonths(N, -1);
  const plans = H().plans || {};
  const actual = Number((H().savings || {}).actual) || 0;
  const pairs = [];
  const nv = x => (num(x) === null ? B.DEL : num(x));
  for (const e of Calc.earners(H())) pairs.push([['plans', N, e.id], nv(d.pay[e.id])]);
  if (!plans[R] || plans[R].endBalance === undefined) pairs.push([['plans', R, 'endBalance'], actual]);
  await B.setMonth(N, M);
  await B.setMonthField(N, ['bills'], {});
  await B.setH(pairs);
  if (M.moved) await setSavings(actual + M.moved, `${D.name(N)} setup`, M.moved > 0 ? 'in' : 'out');
  if (S.allocTx && S.allocTx.length) await addBucketTx(S.allocTx);
  S.allocTx = null;
  S.draft = null;
  location.hash = '#/home';
  if (M.moved > 0) confetti();
  toast(`${D.name(N)} is set up${M.moved > 0 ? ` · ${money(M.moved)} to savings` : M.moved < 0 ? ` · ${money(-M.moved)} from savings` : ''}`);
}

/* ---------- Settings ---------- */

function viewSettings() {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1] || '';
  if (sub === 'setup') return viewSettingsSetup();
  if (sub === 'look') return viewSettingsLook();
  const h = H();
  const catTotal = h.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
  const billTotal = (h.bills || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  return `<header class="hero small-hero ink-title"><a class="back" href="#/home">‹ Home</a><h1>Settings</h1>
    <a class="gear" href="#/settings/look" aria-label="Appearance">${icons.gallery}</a></header>

  ${fold('cats', 'Categories', money(catTotal), `<p class="small muted">Normal monthly budgets. Trim a single month during setup.</p>
    ${h.categories.map((c, i) => `<div class="edit-row">
      <input class="emoji-in" data-ch="cat" data-id="${esc(c.id)}" data-f="emoji" value="${esc(c.emoji || '')}" aria-label="Emoji">
      <input class="grow" data-ch="cat" data-id="${esc(c.id)}" data-f="name" value="${esc(c.name)}" aria-label="Name">
      <input class="mini" data-ch="cat" data-id="${esc(c.id)}" data-f="budget" inputmode="decimal" value="${esc(c.budget)}" aria-label="Budget">
      <button class="x small" data-act="cat-up" data-id="${esc(c.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
      <button class="x small" data-act="cat-del" data-id="${esc(c.id)}" aria-label="Remove">×</button></div>`).join('')}
    <div class="line subtotal"><span>Categories total</span><b>${money(h.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0))}</b></div>
    <div class="add-row"><input id="cat-name" placeholder="New category"><input id="cat-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="cat-add">Add</button></div>`)}

  ${fold('bills', 'Bills', money(billTotal), `<p class="small muted">Automatic payments: due day, name, amount. Schedule a change when an amount is going up or down.</p>
    ${(h.bills || []).map(b => `<div class="bill-edit">
      <div class="edit-row"><input class="mini day-in" data-ch="bill" data-id="${esc(b.id)}" data-f="day" inputmode="numeric" value="${esc(b.day)}" aria-label="Due day">
      <input class="grow" data-ch="bill" data-id="${esc(b.id)}" data-f="name" value="${esc(b.name)}" aria-label="Name">
      <input class="mini" data-ch="bill" data-id="${esc(b.id)}" data-f="amount" inputmode="decimal" value="${esc(b.amount)}" aria-label="Amount">
      <button class="x small" data-act="bill-del" data-id="${esc(b.id)}" aria-label="Remove">×</button></div>
      <div class="line small autopay"><span class="muted">${b.autopay === false ? 'You pay it yourself — check it off on Overview' : 'Autopay — checks itself off on its due day'}</span><button class="switch ${b.autopay === false ? '' : 'on'}" data-act="autopay" data-id="${esc(b.id)}" role="switch" aria-checked="${b.autopay !== false}" aria-label="Autopay"><i></i></button></div>
      ${(b.changes || []).map((ch, i) => `<div class="small muted change">→ ${money(ch.amount)} starting ${D.label(ch.from)} <button class="linkish small" data-act="chg-del" data-id="${esc(b.id)}" data-i="${i}">remove</button></div>`).join('')}
      ${(h.helpers || []).filter(x => x.bill === b.id).map(x => `<div class="edit-row share-edit"><span class="small muted">Shared:</span>
        <input class="grow" data-ch="help" data-id="${esc(x.id)}" data-f="name" value="${esc(x.name)}" aria-label="Who">
        <input class="mini" data-ch="help" data-id="${esc(x.id)}" data-f="amount" inputmode="decimal" value="${esc(x.amount)}" aria-label="Their share">
        <button class="x small" data-act="help-del" data-id="${esc(x.id)}" aria-label="Remove">×</button></div>`).join('')}
      <details class="small"><summary>Add someone’s share</summary><div class="add-row"><input id="help-name-${esc(b.id)}" placeholder="Who"><input id="help-amt-${esc(b.id)}" inputmode="decimal" placeholder="$"><button class="btn small" data-act="help-add" data-id="${esc(b.id)}">Add</button></div><p class="small muted">For family on a shared plan who send you their part each month.</p></details>
      <details class="small"><summary>Schedule a change</summary><div class="add-row"><input type="month" id="chg-m-${esc(b.id)}" value="${D.addMonths(homeYm(), 1)}"><input id="chg-a-${esc(b.id)}" inputmode="decimal" placeholder="New $"><button class="btn small" data-act="chg-add" data-id="${esc(b.id)}">Add</button></div></details>
    </div>`).join('')}
    <div class="line subtotal"><span>Bills total</span><b>${money((h.bills || []).reduce((a, b) => a + (Number(b.amount) || 0), 0))}</b></div>
    <div class="add-row"><input id="bill-day" class="mini" inputmode="numeric" placeholder="Day"><input id="bill-name" placeholder="New bill"><input id="bill-amt" class="mini" inputmode="decimal" placeholder="$"><button class="btn small" data-act="bill-add">Add</button></div>`)}

  ${fold('tags', 'Stores & tags', '', `<h3>Stores</h3><div class="chips">${(h.stores || []).map(s => `<span class="chip on">${esc(s)} <button class="chip-x" data-act="list-del" data-kind="stores" data-v="${esc(s)}" aria-label="Remove">×</button></span>`).join('')}</div>
    <div class="add-row"><input id="stores-new" placeholder="Add a store"><button class="btn small" data-act="list-add" data-kind="stores">Add</button></div>
    <h3>Tags</h3><p class="small muted">For tracking things inside a category — like Diapers (in Twins) or Eating out (in Food).</p>
    <div class="chips">${(h.tags || []).map(s => `<span class="chip on">${esc(s)} <button class="chip-x" data-act="list-del" data-kind="tags" data-v="${esc(s)}" aria-label="Remove">×</button></span>`).join('')}</div>
    <div class="add-row"><input id="tags-new" placeholder="Add a tag"><button class="btn small" data-act="list-add" data-kind="tags">Add</button></div>`)}

  ${monthlyTotalCard()}

  <a class="card menu-row" href="#/settings/setup"><span><b>Setup</b><span class="small muted">Your name, people & income, features, how you track spending, savings goals, household</span></span><span class="chev">›</span></a>`;
}

// A Settings card that opens and closes with the arrow in its header (all start closed when you come into Settings).
function fold(key, title, summary, body) {
  const open = !!S.setOpen[key];
  return `<section class="card fold ${open ? '' : 'shut'}">
    <button class="fold-head" data-act="fold" data-k="${key}" aria-expanded="${open}"><h2>${title}</h2><span class="fold-sum">${open ? '' : summary}</span><span class="fold-arrow">${open ? '▲' : '▼'}</span></button>
    ${open ? body : ''}
  </section>`;
}

function viewSettingsSetup() {
  const h = H();
  const sv = h.savings || {};
  return `<header class="hero small-hero ink-title"><a class="back" href="#/settings">‹ Settings</a><h1>Setup</h1></header>

  <section class="card"><h2>You</h2>
    <label class="field"><span class="label">Your name</span><input data-ch="myname" value="${esc(myName())}"></label>
  </section>
  <section class="card"><h2>People & usual income</h2>
    ${Calc.earners(h).map(e => `<div class="edit-row"><input class="grow" data-ch="earner" data-id="${esc(e.id)}" value="${esc(e.name)}" aria-label="Name">${Calc.earners(h).length > 1 ? `<button class="x small" data-act="person-del" data-id="${esc(e.id)}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
    <button class="linkish small" data-act="person-add">+ Add a person</button>
    <h3>Usual monthly income</h3>
    <div class="two">${Calc.earners(h).map(e => `<label class="field"><span class="label">${esc(e.name)}</span><input data-ch="usual" data-f="${esc(e.id)}" inputmode="decimal" value="${esc((h.usual || {})[e.id])}" placeholder="$"></label>`).join('')}</div>
    <p class="small muted">Used on the Year tab for any month you haven’t filled in (shown as “usual”). Type a real amount on a month and it takes over.</p>
  </section>
  <section class="card"><h2>Features</h2>
    ${[['buckets', 'Savings buckets', 'Give every savings dollar a job: buckets with goals, a % of each month’s extra, and spending history. Shows on the Year tab.'],
      ['overview', 'Overview page', 'Checking, bills and the live Savings/Excess on the $ page. Turn off to keep the $ page to just Budgets.'],
      ['payInChecking', 'Paychecks land in checking', 'For paychecks that go straight into this checking account during the month (they’re for next month). Check each one off on Overview when it arrives so it’s set aside.']].map(([k, l, d]) => {
      const on = k === 'overview' ? overviewOn() : !!feat(k);
      return `<div class="line feature"><span><b>${l}</b><span class="small muted">${d}</span></span><button class="switch ${on ? 'on' : ''}" data-act="feature" data-k="${k}" role="switch" aria-checked="${on}" aria-label="${l}"><i></i></button></div>`;
    }).join('')}
  </section>
  <section class="card"><h2>How we track spending</h2>
    <div class="seg">${[['log', 'Log as we go'], ['import', 'Weekly import']].map(([k, l]) => `<button class="${(h.trackMode || 'log') === k ? 'on' : ''}" data-act="track" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="small muted">${(h.trackMode || 'log') === 'import'
      ? 'Download your Navy Federal transactions (CSV) and tap Import on the $ page. You can still add cash purchases by hand.'
      : 'Tap + Log after each purchase.'}</p>
    ${Object.keys(h.rules || {}).length ? `<details class="small"><summary>Store rules for imports (${Object.keys(h.rules).length})</summary>
      ${Object.entries(h.rules).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])).map(([k, r]) => `<div class="edit-row"><span class="grow">${esc(r.name || k)}${r.tags && r.tags.length ? ` <span class="small muted">· ${r.tags.map(esc).join(', ')}</span>` : ''}</span>
        <select data-ch="rule" data-k="${esc(k)}">${h.categories.map(c => `<option value="${esc(c.id)}" ${r.action === 'cat' && r.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="ask" ${r.action === 'ask' ? 'selected' : ''}>Ask each time</option>${r.action === 'pay' || payInChecking() ? `<option value="pay" ${r.action === 'pay' ? 'selected' : ''}>Paycheck</option>` : ''}<option value="skip" ${r.action === 'skip' ? 'selected' : ''}>Skip</option></select>
        <button class="x small" data-act="rule-del" data-k="${esc(k)}" aria-label="Remove rule">×</button></div>`).join('')}</details>` : ''}
  </section>
  <section class="card"><h2>Savings goals</h2>
    <div class="three">
      <label class="field"><span class="label">Keep in savings</span><input data-ch="goal" data-f="floor" inputmode="decimal" value="${esc(sv.floor)}"></label>
      <label class="field"><span class="label">Minimum</span><input data-ch="goal" data-f="goalMin" inputmode="decimal" value="${esc(sv.goalMin)}"></label>
      <label class="field"><span class="label">Goal</span><input data-ch="goal" data-f="goalMax" inputmode="decimal" value="${esc(sv.goalMax)}"></label>
    </div>
    <p class="small muted">At the end of the year, anything above “keep in savings” can move to the HYSA.</p>
    <label class="field"><span class="label">Cushion to keep in checking</span><input data-ch="goal" data-f="buffer" inputmode="decimal" value="${esc(checkingBuffer())}"></label>
    <p class="small muted">When you set up a month, only the Savings/Excess above this is suggested for moving to savings.</p>
    ${(sv.log || []).length ? `<details class="small"><summary>Savings history</summary>${[...sv.log].reverse().slice(0, 40).map(l => `<div class="line small"><span>${new Date(l.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${esc(l.note || l.kind)}</span><span>${l.kind === 'set' && l.note === 'Starting balance' ? money(l.amount) : (l.amount >= 0 ? '+' : '') + money(l.amount)}</span></div>`).join('')}</details>` : ''}
  </section>
  <section class="card"><h2>Household</h2>
    ${Store.configured ? `<p>Share this code with anyone joining this household (Create account → Join with a code):</p><div class="code">${esc(h.joinCode)}</div><button class="btn ghost small" data-act="copy-code">Copy code</button>` : '<p class="small muted">Sample mode — the join code appears here once Firebase is connected.</p>'}
    <p class="small muted">In the household: ${Object.values(h.people || {}).map(p => esc(p.name)).join(', ')}</p>
  </section>
  ${Store.configured ? `<section class="card"><h2>Account</h2><p class="small muted">Signed in as ${esc(S.user && S.user.email)}</p><button class="btn ghost" data-act="signout">Sign out</button></section>` : ''}
`;
}

function viewSettingsLook() {
  if (B.loadAllWalls && !S.wallsLoaded) {
    S.wallsLoaded = true;
    B.loadAllWalls().then(all => { S.wallpapers = { ...all, ...S.wallpapers }; for (const k in all) S.wallpapers[k] = all[k]; render(); })
      .catch(e => { S.wallsLoaded = false; console.warn('wallpapers', e); });
  }
  const look = H().look || {};
  return `<header class="hero small-hero ink-title"><a class="back" href="#/settings">‹ Settings</a><h1>Appearance</h1></header>

  <section class="card"><h2>Months</h2><p class="small muted">Each month’s color and wallpaper. Tap a picture to change it.</p>
    <div class="month-grid">${D.MONTHS.map((m, i) => {
      const n = i + 1;
      const wp = S.wallpapers[String(n)];
      const col = (look.colors || Looks.colors)[n] || Looks.colors[n];
      return `<div class="mtile">
        <button class="wp" data-act="wall" data-m="${n}" style="${wp ? `background-image:url('${wp}')` : ''};border-color:${col}"><span style="background:${col};color:${onColor(col)}">${m.slice(0, 3)}</span>${wp ? '' : '<em>+ Wallpaper</em>'}</button>
        <div class="row between"><input type="color" data-ch="mcolor" data-m="${n}" value="${col}" aria-label="${m} color">${wp ? `<button class="linkish small" data-act="wall-del" data-m="${n}">remove</button>` : ''}</div>
      </div>`;
    }).join('')}</div>
    <button class="linkish small" data-act="colors-reset">Reset month colors</button>
  </section>

  <section class="card"><h2>Fonts & feel</h2>
    <div class="two">
      <label class="field"><span class="label">Heading font</span><select data-ch="font" data-f="heading">${Looks.headings.map(f => `<option ${f === (look.heading || 'Oswald') ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Body font</span><select data-ch="font" data-f="body">${Looks.bodies.map(f => `<option ${f === (look.body || 'Nunito') ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    </div>
    <p class="font-preview"><span class="h">October</span> <span>Spending money left: $1,250</span></p>
    <label class="field check"><input type="checkbox" data-ch="calm" ${look.calm === false ? '' : 'checked'}> Calm touches & celebrations <span class="small muted">(gentle wording, confetti for wins)</span></label>
    <label class="field"><span class="label">Card see-through <span class="small muted">(lower shows more wallpaper)</span></span><input type="range" min="0.45" max="1" step="0.05" data-ch="glass" value="${esc(look.glass === undefined ? 0.82 : look.glass)}"></label>
  </section>`;
}

// The amounts in Settings added up (bills + category budgets), so there's a
// number to copy into "Expenses" on the Year tab.
function monthlyTotalCard() {
  const h = H();
  const bills = (h.bills || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const cats = h.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
  return `<section class="card"><h2>Total</h2>
    <div class="line"><span>Bills</span><b>${money(bills)}</b></div>
    <div class="line"><span>Categories</span><b>${money(cats)}</b></div>
    <div class="line total-line"><span>Total</span><b>${money(bills + cats)}</b></div>
    <p class="small muted">Everything above in Settings added up. Use it for “Expenses” on the Year tab.</p>
  </section>`;
}

function shrinkImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k);
      cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      let q = 0.78;
      let out = cv.toDataURL('image/jpeg', q);
      while (out.length > 850000 && q > 0.35) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      res(out);
    };
    img.onerror = rej;
    img.src = url;
  });
}

/* ---------- press-and-hold to reorder savings buckets ---------- */

(() => {
  let hold = null;
  const GAP = 10;
  const point = e => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  function begin(item, y) {
    const items = [...item.parentElement.querySelectorAll('.bucket[data-id]')];
    const idx = items.indexOf(item);
    const h = item.getBoundingClientRect().height + GAP;
    S.drag = { item, items, idx, target: idx, startY: y, h };
    item.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(10);
  }
  function move(y) {
    const d = S.drag;
    const dy = y - d.startY;
    d.item.style.transform = `translateY(${dy}px) scale(1.02)`;
    d.target = Math.max(0, Math.min(d.items.length - 1, d.idx + Math.round(dy / d.h)));
    d.items.forEach((el, j) => {
      if (el === d.item) return;
      let shift = 0;
      if (j > d.idx && j <= d.target) shift = -d.h;
      if (j < d.idx && j >= d.target) shift = d.h;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  async function end() {
    const d = S.drag;
    S.drag = null;
    d.items.forEach(el => { el.style.transform = ''; el.classList.remove('dragging'); });
    // Swallow the click that follows the drop so the bucket doesn't open.
    const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
    if (d.target !== d.idx) {
      const list = [...(H().buckets || [])];
      const [moved] = list.splice(d.idx, 1);
      list.splice(d.target, 0, moved);
      await B.setH([[['buckets'], list]]);
    } else render();
  }
  function down(e) {
    const item = e.target.closest('.bucket[data-id]');
    if (!item || (e.button !== undefined && e.button > 0)) return;
    const p = point(e);
    hold = { x: p.clientX, y: p.clientY, timer: setTimeout(() => { begin(item, hold.y); }, 400) };
  }
  function moved(e) {
    if (!hold) return;
    const p = point(e);
    if (S.drag) { e.preventDefault(); move(p.clientY); return; }
    if (Math.abs(p.clientY - hold.y) > 8 || Math.abs(p.clientX - hold.x) > 8) { clearTimeout(hold.timer); hold = null; }
  }
  function up() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold = null;
    if (S.drag) end();
  }
  document.addEventListener('touchstart', down, { passive: true });
  document.addEventListener('touchmove', moved, { passive: false });
  document.addEventListener('touchend', up);
  document.addEventListener('touchcancel', up);
  document.addEventListener('mousedown', e => { if (!('ontouchstart' in window)) down(e); });
  document.addEventListener('mousemove', e => { if (!('ontouchstart' in window)) moved(e); });
  document.addEventListener('mouseup', () => { if (!('ontouchstart' in window)) up(); });
})();

/* ---------- taps ---------- */

const acts = {
  close: () => closeSheet(),
  log: el => openLog({ cat: el.dataset.cat }),
  'edit-p': el => { if (S.sheet === 'soft') { closeSheet(); setTimeout(() => openLog({ id: el.dataset.id }), 200); } else openLog({ id: el.dataset.id }); },
  'l-cat': el => { S.log.cat = el.dataset.v; redrawLog(); },
  'l-store': el => { S.log.store = S.log.store === el.dataset.v ? '' : el.dataset.v; redrawLog(); },
  'l-tag': el => { const t = el.dataset.v; const L = S.log; L.tags = L.tags.includes(t) ? L.tags.filter(x => x !== t) : [...L.tags, t]; redrawLog(); },
  'l-spread': el => { S.log.spread = Number(el.dataset.v); redrawLog(); },
  'l-add': el => {
    const kind = el.dataset.kind;
    syncLog();
    const box = el.parentElement;
    box.insertAdjacentHTML('beforeend', `<span class="add-inline"><input id="l-new" placeholder="${kind === 'stores' ? 'Store name' : 'Tag name'}"><button class="btn small" data-act="l-add-save" data-kind="${kind}">Add</button></span>`);
    el.remove();
    $('#l-new').focus();
  },
  'l-add-save': async el => {
    const kind = el.dataset.kind;
    const v = ($('#l-new').value || '').trim();
    if (!v) return;
    syncLog();
    const list = H()[kind] || [];
    if (!list.includes(v)) { H()[kind] = [...list, v]; await B.setH([[[kind], H()[kind]]]); }
    if (kind === 'stores') S.log.store = v; else if (!S.log.tags.includes(v)) S.log.tags.push(v);
    redrawLog();
  },
  'l-save': () => saveLog(),
  'l-del': async () => {
    if (!(await ask('Delete this purchase?', 'Delete'))) return;
    const id = S.log.id;
    closeSheet();
    await B.deletePurchase(id);
    S.older = S.older.filter(p => p.id !== id); mergePurchases(); render();
    toast('Deleted');
  },

  since: () => { S.sinceOpen = !S.sinceOpen; render(); },
  eye: () => { S.hideDone = !S.hideDone; try { localStorage.setItem('ne-hide', S.hideDone ? '1' : '0'); } catch (e) {} render(); },
  'import-file': () => pickImportFile(),
  // Import mode: a category's purchases this month (tap one to change it).
  'cat-list': el => {
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases).cats.find(x => x.id === el.dataset.cat);
    if (!c) return;
    const list = Calc.spent(S.purchases, ym).list.filter(p => p.cat === c.id);
    S.sheet = 'soft';
    openSheet(`<div class="sheet-head"><h2>${esc(c.emoji || '')} ${esc(c.name)}</h2><button class="x" data-act="close">×</button></div>
      <p class="small muted">${D.name(ym)} · ${money(c.used)} of ${money(c.budget)}${c.over ? ` · over by ${money(c.used - c.budget)}` : ` · ${money(c.left)} left`}</p>
      ${list.length ? list.map(p => purchaseRow(p)).join('') : '<p class="muted">Nothing in this category yet this month.</p>'}
      <p class="small muted">Tap a purchase to change its category, tags or note.</p>`);
  },
  'imp-cancel': () => { S.imp = null; },
  'imp-skipped': () => { S.imp.showSkipped = !S.imp.showSkipped; render(true); },
  'imp-untag': el => { const r = S.imp.rows[el.dataset.i]; r.tags = r.tags.filter(t => t !== el.dataset.v); render(true); },
  'imp-split': el => { const r = S.imp.rows[el.dataset.i]; r.splits = [{ amount: r.amount, cat: r.cat && !['skip', 'uncat'].includes(r.cat) ? r.cat : '' }, { amount: 0, cat: '' }]; render(true); },
  'imp-split-add': el => { S.imp.rows[el.dataset.i].splits.push({ amount: 0, cat: '' }); render(true); },
  'imp-split-del': el => { S.imp.rows[el.dataset.i].splits.splice(Number(el.dataset.j), 1); render(true); },
  'imp-split-off': el => { S.imp.rows[el.dataset.i].splits = null; render(true); },
  'imp-save': () => saveImport(),
  track: async el => {
    const v = el.dataset.v;
    if (v === (H().trackMode || 'log')) return;
    const ok = await ask(v === 'import'
      ? 'Switch to weekly import? + Log becomes Import. Purchases you’ve already logged stay — just don’t import the same days you logged by hand.'
      : 'Switch back to logging as you go? Imported purchases stay.', 'Switch');
    if (ok) await B.setH([[['trackMode'], v]]);
  },
  'rule-del': async el => { const rules = { ...(H().rules || {}) }; delete rules[el.dataset.k]; await B.setH([[['rules'], rules]]); },
  page: el => { S.page = el.dataset.v; try { localStorage.setItem('ne-page', S.page); } catch (e) {} window.scrollTo(0, 0); render(); },
  bill: async el => {
    const ym = homeYm();
    const b = H().bills.find(x => x.id === el.dataset.id);
    const st = Calc.billStatus(S.months[ym], b, ym);
    const paid = !st.paid;
    // Paid-by-hand bills: checked = paid today; unchecked = back to waiting.
    if (b.autopay === false) {
      await B.setMonthField(ym, ['bills', b.id], paid ? { paid: true, at: Date.now(), manual: true } : B.DEL);
      return;
    }
    // Autopay: if the tap lands where the due date would have it anyway, go back
    // to automatic (no "set by hand" note). Otherwise remember it was set by
    // hand, paid on its due date if that's passed (so checking isn't charged twice).
    const auto = Date.now() >= st.due;
    await B.setMonthField(ym, ['bills', b.id], paid === auto ? B.DEL : { paid, at: Math.min(Date.now(), st.due), manual: true });
  },
  'bill-auto': async el => { await B.setMonthField(homeYm(), ['bills', el.dataset.id], B.DEL); },
  'li-toggle': async el => {
    const kind = el.dataset.kind;
    const flag = kind === 'back' || kind === 'incoming' ? 'received' : 'paid';
    await monthList(kind, arr => arr.map(o => (o.id === el.dataset.id ? toggleFlag(o, flag) : o)));
  },
  // Tap an item's name or amount to change it in place.
  'li-edit': el => {
    const { kind, id, f } = el.dataset;
    const o = ((S.months[homeYm()] || {})[kind] || []).find(x => x.id === id);
    if (!o) return;
    el.outerHTML = `<input class="${f === 'amount' ? 'val-in' : 'item-in'}" data-ch="li" data-kind="${kind}" data-id="${esc(id)}" data-f="${f}" ${f === 'amount' ? 'inputmode="decimal"' : ''} value="${esc(o[f])}">`;
    const inp = view.querySelector(`[data-ch="li"][data-id="${id}"][data-f="${f}"]`);
    inp.focus();
    inp.select();
  },
  'li-del': async el => {
    if (!(await ask('Remove this item?', 'Remove'))) return;
    await monthList(el.dataset.kind, arr => arr.filter(o => o.id !== el.dataset.id));
  },
  shares: el => { S.openShares[el.dataset.id] = true; render(); },
  'li-open': el => {
    if (document.activeElement) document.activeElement.blur();
    S.adding = el.dataset.kind || null;
    render();
    if (S.adding) setTimeout(() => { const i = $(`#add-${S.adding}-name`); i && i.focus(); }, 0);
  },
  'li-add': async el => {
    const kind = el.dataset.kind;
    const name = $(`#add-${kind}-name`).value.trim();
    const amount = num($(`#add-${kind}-amt`).value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    S.adding = null;
    await monthList(kind, arr => [...arr, kind === 'back' || kind === 'incoming' ? { id: newId(), name, amount, received: false } : { id: newId(), name, amount, paid: false }]);
  },
  held: async el => { await monthList('held', arr => arr.map(o => (o.id === el.dataset.id ? toggleFlag(o, 'received') : o))); },
  checking: () => {
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases);
    S.sheet = 'checking';
    openSheet(`<div class="sheet-head"><h2>Checking balance</h2><button class="x" data-act="close">×</button></div>
      <p class="muted">What does joint checking show right now?</p>
      <label class="amount"><span>$</span><input id="c-amt" inputmode="decimal" placeholder="${c.est}"></label>
      <p class="small muted">The app estimates ${money(c.est)}. Anything already posted in the bank stays checked; anything still coming stays on the list.</p>
      <div class="row end sheet-foot"><button class="btn" data-act="checking-save">Save</button></div>`);
    setTimeout(() => $('#c-amt').focus(), 250);
  },
  'checking-save': async () => {
    const v = num($('#c-amt').value);
    if (v === null) { toast('Type the balance'); return; }
    closeSheet();
    await B.setMonth(homeYm(), { checking: { amount: v, at: Date.now() } });
    toast('Checking updated');
  },
  mdir: el => {
    const box = el.closest('.move-form');
    box.dataset.dir = el.dataset.v;
    box.querySelectorAll('[data-act="mdir"]').forEach(b => b.classList.toggle('on', b === el));
  },

  // Line the buckets back up with the savings total (the total doesn't change).
  assign: el => {
    const v = Number(el.dataset.v);
    openAllocate(v, async tx => { if (tx.length) { await addBucketTx(tx); toast('Buckets match your savings again'); } }, v > 0 ? 'Assigned from savings' : 'Matched to savings balance');
  },
  'go-savings': () => { location.hash = '#/savings'; },
  bucket: el => { S.bkMode = S.bkMode || 'add'; openBucket(el.dataset.id); },
  'bk-mode': el => { S.bkMode = el.dataset.v; openBucket(el.dataset.id); },
  'bk-save': async el => {
    const id = el.dataset.id;
    const amt = num($('#bk-amt').value);
    if (!amt || amt <= 0) { toast('Type an amount'); return; }
    const note = $('#bk-note').value.trim();
    const date = ($('#bk-date') && $('#bk-date').value) || D.today();
    const actual = Number(H().savings.actual) || 0;
    closeSheet();
    if (S.bkMode === 'move') {
      const to = $('#bk-to') ? $('#bk-to').value : null;
      const toId = to || (H().buckets || []).find(b => b.id !== id)?.id;
      if (!toId) return;
      const pair = newId();
      await addBucketTx([{ b: id, amount: -amt, kind: 'move', pair, note: note || `Moved to ${bucketById(toId).name}` }, { b: toId, amount: amt, kind: 'move', pair, note: note || `Moved from ${bucketById(id).name}` }]);
      toast(`Moved ${money(amt)}`);
    } else if (S.bkMode === 'add') {
      await addBucketTx([{ b: id, amount: amt, kind: 'add', note, date }]);
      await setSavings(actual + amt, note || `Added to ${bucketById(id).name}`, 'in');
      toast(`Added ${money(amt)} to ${bucketById(id).name}`);
    } else {
      await addBucketTx([{ b: id, amount: -amt, kind: 'spend', note, date }]);
      await setSavings(actual - amt, note || `Spent from ${bucketById(id).name}`, 'out');
      toast(`${money(amt)} from ${bucketById(id).name}`);
    }
  },
  // Undo a bucket entry. Spending/adding also changed the savings total, so
  // that's put back too; a move removes both halves.
  'bk-tx-del': async el => {
    const all = H().bucketTx || [];
    const t = all.find(x => x.id === el.dataset.id);
    if (!t) return;
    const what = { spend: 'this spending', add: 'this added money', move: 'this move (both buckets)' }[t.kind] || 'this entry';
    const extra = t.kind === 'spend' ? ` ${money(-t.amount)} goes back into savings.` : t.kind === 'add' ? ` Savings goes down ${money(t.amount)}.` : '';
    if (!(await ask(`Delete ${what}?${extra}`, 'Delete'))) return;
    const gone = t.pair ? all.filter(x => x.pair === t.pair).map(x => x.id) : [t.id];
    await B.setH([[['bucketTx'], all.filter(x => !gone.includes(x.id))]]);
    const actual = Number(H().savings.actual) || 0;
    if (t.kind === 'spend' || t.kind === 'add') await setSavings(round2(actual - t.amount), `Undid: ${t.note || t.kind}`, 'undo');
    toast('Deleted');
    S.bkMode = S.bkMode || 'add';
    setTimeout(() => openBucket(el.dataset.b), 50);
  },
  'bk-del': async el => {
    const b = bucketById(el.dataset.id);
    if (!(await ask(`Remove ${esc(b.name)}? Its balance becomes “Not assigned” savings.`, 'Remove'))) return;
    closeSheet();
    await B.setH([[['buckets'], (H().buckets || []).filter(x => x.id !== b.id)], [['bucketTx'], (H().bucketTx || []).filter(t => t.b !== b.id)]]);
  },
  'bucket-new': async () => {
    const id = newId();
    await B.setH([[['buckets'], [...(H().buckets || []), { id, name: 'New bucket', goal: 0, pct: 0 }]]]);
    S.bkMode = 'add';
    setTimeout(() => openBucket(id), 50);
  },
  'alloc-even': () => {
    const A = S.alloc;
    const list = H().buckets || [];
    if (!list.length) return;
    const rest = round2(Math.abs(A.amount) - Object.values(A.amt).reduce((a, v) => a + (Number(v) || 0), 0));
    if (rest <= 0) return;
    const each = Math.floor((rest / list.length) * 100) / 100;
    list.forEach((b, i) => { A.amt[b.id] = round2((Number(A.amt[b.id]) || 0) + (i === list.length - 1 ? rest - each * (list.length - 1) : each)); });
    redrawAlloc();
  },
  'alloc-save': async () => {
    const A = S.alloc;
    const out = A.amount < 0;
    const tx = [];
    const note = A.note ? { note: A.note } : {};
    for (const id in A.amt) { const v = Number(A.amt[id]) || 0; if (v) tx.push({ b: id, amount: out ? -Math.abs(v) : Math.abs(v), kind: out ? 'cover' : 'fill', ...note }); }
    const done = A.done;
    S.alloc = null;
    closeSheet();
    await done(tx);
  },
  'person-add': async () => { await B.setH([[['earners'], [...Calc.earners(H()), { id: newId(), name: 'New person' }]]]); },
  'person-del': async el => {
    const list = Calc.earners(H());
    if (list.length < 2) return;
    if (!(await ask('Remove this person’s income line?', 'Remove'))) return;
    await B.setH([[['earners'], list.filter(e => e.id !== el.dataset.id)]]);
  },
  feature: async el => {
    const k = el.dataset.k;
    const on = !(k === 'overview' ? overviewOn() : feat(k));
    await B.setH([[['features', k], on]]);
  },
  'setup-file': () => pickSetupFile(async data => { await Demo.loadSetup(data); toast('Setup file loaded'); }),
  yr: el => { S.year = Math.max(firstYear(), (S.year || D.yearOf(homeYm())) + Number(el.dataset.d)); render(); },
  'all-months': el => { for (const ym of el.dataset.yms.split(',')) S.open[ym] = el.dataset.open === '1'; render(); },
  expand: el => { S.open[el.dataset.ym] = el.dataset.open !== '1'; render(); },
  fold: el => { const k = el.dataset.k; S.setOpen[k] = el.getAttribute('aria-expanded') !== 'true'; render(); },
  plan: el => openPlan(el.dataset.ym),
  left: el => {
    const cat = el.dataset.cat;
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases).cats.find(x => x.id === cat);
    el.outerHTML = `<input class="val-in" data-ch="left" data-cat="${esc(cat)}" inputmode="decimal" value="${Math.max(0, c.left)}" placeholder="$" aria-label="Left in ${esc(c.name)}">`;
    const inp = view.querySelector(`.val-in[data-cat="${cat}"]`);
    inp.focus();
    inp.select();
  },
  // Tap a bill's amount on Overview: change it for this month only.
  'bill-amt': el => {
    const ym = homeYm();
    const b = H().bills.find(x => x.id === el.dataset.id);
    const cur = Calc.billAmount(b, ym, S.months[ym]);
    el.outerHTML = `<input class="val-in" data-ch="billamt" data-id="${esc(b.id)}" inputmode="decimal" value="${cur}" aria-label="${esc(b.name)} this month">`;
    const inp = view.querySelector(`.val-in[data-ch="billamt"][data-id="${b.id}"]`);
    inp.focus();
    inp.select();
  },
  'budget-edit': el => {
    const cat = el.dataset.cat;
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases).cats.find(x => x.id === cat);
    el.outerHTML = `<input class="val-in" data-ch="catbudget" data-cat="${esc(cat)}" inputmode="decimal" value="${c.budget}" placeholder="$" aria-label="${esc(c.name)} budget this month">`;
    const inp = view.querySelector(`.val-in[data-ch="catbudget"][data-cat="${cat}"]`);
    inp.focus();
    inp.select();
  },
  inc: el => {
    const { ym, k } = el.dataset;
    const cur = ((H().plans || {})[ym] || {})[k];
    el.outerHTML = `<input class="val-in" data-ch="inc" data-ym="${ym}" data-k="${k}" inputmode="decimal" value="${cur === undefined || cur === null ? '' : cur}" placeholder="$">`;
    const inp = view.querySelector(`.val-in[data-ym="${ym}"][data-k="${k}"]`);
    inp.focus();
    inp.select();
  },
  'p-oadd': () => {
    const name = $('#p-oname').value.trim();
    const amount = num($('#p-oamt').value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    S.plan.other.push({ id: newId(), name, amount });
    $('#p-other').innerHTML = planOtherHtml();
    $('#p-oname').value = ''; $('#p-oamt').value = '';
  },
  'p-odel': el => { S.plan.other = S.plan.other.filter(o => o.id !== el.dataset.id); $('#p-other').innerHTML = planOtherHtml(); },
  'p-save': () => savePlan(),
  savings: () => {
    S.sheet = 'savings';
    openSheet(`<div class="sheet-head"><h2>Savings balance</h2><button class="x" data-act="close">×</button></div>
      <p class="muted">What’s in savings right now?</p>
      <label class="amount"><span>$</span><input id="s-amt" inputmode="decimal" value="${esc(H().savings.actual)}"></label>
      <label class="field"><span class="label">Note <span class="small muted">(optional)</span></span><input id="s-note"></label>
      <div class="row end sheet-foot"><button class="btn" data-act="savings-save">Save</button></div>`);
  },
  'savings-save': async () => {
    const v = num($('#s-amt').value);
    if (v === null) return;
    const note = $('#s-note').value.trim();
    closeSheet();
    await setSavings(v, note || 'Updated balance');
    toast('Savings updated');
  },

  hysa: async el => {
    const v = Math.max(0, num($('#mv-hysa').value) || 0);
    const Y = el.dataset.y;
    const sv = H().savings;
    const floor = Number(sv.floor) || 5000;
    const left = round2((Number(sv.actual) || 0) - v);
    const q = v > 0 ? `Moved ${money(v)} to the HYSA? Savings will be set to ${money(left)}.` : `Close out ${Y} and look at ${Number(Y) + 1}?`;
    if (!(await ask(q, v > 0 ? 'Yes, reset' : 'Yes'))) return;
    await B.setH([[['savings', 'hysa'], round2((Number(sv.hysa) || 0) + v)], [['savings', 'hysaDone', Y], v || 0.01]]);
    if (v > 0) await setSavings(left, `Year-end move to HYSA (${Y})`, 'hysa');
    S.year = Number(Y) + 1;
    location.hash = '#/year';
    if (v > 0) { confetti(); toast(`${money(v)} to the HYSA 🎉 Here’s ${Number(Y) + 1}.`); }
  },

  'bd-m': el => { S.bdYm = D.addMonths(S.bdYm || homeYm(), Number(el.dataset.d)); render(); ensureLoaded(S.bdYm).catch(e => console.warn('older purchases', e)); },
  'bd-tab': el => { S.bdTab = el.dataset.v; render(); },
  'bd-item': el => openItem(el.dataset.key),
  'bd-go': el => { S.bdYm = el.dataset.ym; },
  'chart-tip': el => {
    document.querySelectorAll('.chart .col').forEach(c => c.classList.remove('tip'));
    el.classList.add('tip');
    $('#chart-tip').textContent = el.dataset.tip;
  },

  'd-next': () => { readDraftInputs(); S.draft.step++; window.scrollTo(0, 0); render(); },
  'd-back': () => { readDraftInputs(); S.draft.step--; window.scrollTo(0, 0); render(); },
  'd-cancel': () => { S.draft = null; },
  'd-toggle': el => {
    readDraftInputs();
    const kind = el.dataset.kind;
    const flag = kind === 'back' || kind === 'held' ? 'received' : 'paid';
    S.draft[kind] = S.draft[kind].map(o => (o.id === el.dataset.id ? { ...o, [flag]: !o[flag], [flag + 'At']: Date.now() - 1000 } : o));
    render();
  },
  'd-del': el => { readDraftInputs(); S.draft[el.dataset.kind] = S.draft[el.dataset.kind].filter(o => o.id !== el.dataset.id); render(); },
  'd-add': el => {
    readDraftInputs();
    const kind = el.dataset.kind;
    const name = $(`#d-${kind}-name`).value.trim();
    const amount = num($(`#d-${kind}-amt`).value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    S.draft[kind].push(kind === 'back' ? { id: newId(), name, amount, received: false } : { id: newId(), name, amount, paid: false });
    render();
  },
  'd-in-add': () => { readDraftInputs(); S.draft.incoming.push({ id: newId(), name: `Paycheck ${S.draft.incoming.length + 1}`, amount: 0, received: false }); render(); },
  'd-finish': el => finishSetup(el.dataset.mode),
  'd-showmove': () => { readDraftInputs(); S.draft.showMove = true; render(); },

  'cat-add': async () => {
    const name = $('#cat-name').value.trim();
    if (!name) return;
    const cats = [...H().categories, { id: newId(), name, budget: num($('#cat-amt').value) || 0, emoji: '•' }];
    await B.setH([[['categories'], cats]]);
  },
  'cat-del': async el => {
    const c = catById(el.dataset.id);
    if (!(await ask(`Remove ${esc(c.name)}? Purchases already logged stay in your history.`, 'Remove'))) return;
    await B.setH([[['categories'], H().categories.filter(x => x.id !== c.id)]]);
  },
  'cat-up': async el => {
    const cats = [...H().categories];
    const i = cats.findIndex(x => x.id === el.dataset.id);
    if (i > 0) { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; await B.setH([[['categories'], cats]]); }
  },
  'list-add': async el => {
    const kind = el.dataset.kind;
    const inp = $(`#${kind}-new`);
    const v = inp.value.trim();
    if (!v) return;
    const have = (H()[kind] || []).find(x => x.toLowerCase() === v.toLowerCase());
    if (have) { toast(`“${have}” is already on your ${kind === 'tags' ? 'tags' : 'stores'} list`); inp.value = ''; return; }
    await B.setH([[[kind], [...(H()[kind] || []), v]]]);
    toast(`Added “${v}”`);
  },
  'list-del': async el => { const kind = el.dataset.kind; await B.setH([[[kind], (H()[kind] || []).filter(x => x !== el.dataset.v)]]); },
  'bill-add': async () => {
    const name = $('#bill-name').value.trim();
    const amount = num($('#bill-amt').value);
    const day = Math.min(31, Math.max(1, parseInt($('#bill-day').value, 10) || 1));
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    const bills = [...H().bills, { id: newId(), name, amount, day, changes: [] }].sort((a, b) => a.day - b.day);
    await B.setH([[['bills'], bills]]);
  },
  autopay: async el => {
    const bills = H().bills.map(b => (b.id === el.dataset.id ? { ...b, autopay: b.autopay === false } : b));
    await B.setH([[['bills'], bills]]);
  },
  'bill-del': async el => {
    const b = H().bills.find(x => x.id === el.dataset.id);
    if (!(await ask(`Remove ${esc(b.name)}?`, 'Remove'))) return;
    await B.setH([[['bills'], H().bills.filter(x => x.id !== b.id)]]);
  },
  'chg-add': async el => {
    const id = el.dataset.id;
    const from = $(`#chg-m-${id}`).value;
    const amount = num($(`#chg-a-${id}`).value);
    if (!from || amount === null) { toast('Pick a month and an amount'); return; }
    const bills = H().bills.map(b => (b.id === id ? { ...b, changes: [...(b.changes || []).filter(c => c.from !== from), { from, amount }].sort((a, c) => (a.from < c.from ? -1 : 1)) } : b));
    await B.setH([[['bills'], bills]]);
  },
  'chg-del': async el => {
    const bills = H().bills.map(b => (b.id === el.dataset.id ? { ...b, changes: b.changes.filter((_, i) => i !== Number(el.dataset.i)) } : b));
    await B.setH([[['bills'], bills]]);
  },
  'help-add': async el => {
    const bill = el.dataset.id;
    const name = $(`#help-name-${bill}`).value.trim();
    const amount = num($(`#help-amt-${bill}`).value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    await B.setH([[['helpers'], [...(H().helpers || []), { id: newId(), name, amount, bill }]]]);
    toast('Starts with the next month you set up');
  },
  'help-del': async el => { await B.setH([[['helpers'], (H().helpers || []).filter(x => x.id !== el.dataset.id)]]); },
  wall: el => {
    const f = $('#file');
    f.value = '';
    f.onchange = async () => {
      const file = f.files[0];
      if (!file) return;
      toast('Adding wallpaper…');
      try {
        const data = await shrinkImage(file);
        await B.setWallpaper(el.dataset.m, data);
        S.wallpapers[String(el.dataset.m)] = data;
        applyLook();
        render();
        toast(`${D.MONTHS[el.dataset.m - 1]} wallpaper saved`);
      } catch (e) { console.error(e); toast('Couldn’t use that picture — try another'); }
    };
    f.click();
  },
  'wall-del': async el => { await B.setWallpaper(el.dataset.m, null); delete S.wallpapers[String(el.dataset.m)]; applyLook(); render(); },
  'colors-reset': async () => { await B.setH([[['look', 'colors'], { ...Looks.colors }]]); },
  'copy-code': async () => { try { await navigator.clipboard.writeText(H().joinCode); toast('Code copied'); } catch (e) { toast(H().joinCode); } },
  signout: async () => { if (await ask('Sign out on this device?', 'Sign out')) { await Store.signOut(); location.hash = ''; location.reload(); } },
  'demo-reset': async () => { if (await ask('Reset all sample data?', 'Reset')) Demo.reset(); },
};

document.addEventListener('click', e => {
  if (e.target.closest('input, select, textarea, label')) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = acts[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON' || el.dataset.act !== 'bd-go') e.preventDefault();
  if (el.tagName === 'A' && el.getAttribute('href')) { fn(el, e); location.hash = el.getAttribute('href'); return; }
  Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast('Something went wrong — try again'); });
});

// Settings fields save when you leave them (or pick an option).
const changes = {
  myname: async el => { const v = el.value.trim(); if (v) await B.setH([[['people', me(), 'name'], v]]); },
  cat: async el => {
    const f = el.dataset.f;
    const cats = H().categories.map(c => (c.id === el.dataset.id ? { ...c, [f]: f === 'budget' ? num(el.value) || 0 : el.value.trim() } : c));
    await B.setH([[['categories'], cats]]);
  },
  bill: async el => {
    const f = el.dataset.f;
    const val = f === 'amount' ? num(el.value) || 0 : f === 'day' ? Math.min(31, Math.max(1, parseInt(el.value, 10) || 1)) : el.value.trim();
    const bills = H().bills.map(b => (b.id === el.dataset.id ? { ...b, [f]: val } : b)).sort((a, b) => a.day - b.day);
    await B.setH([[['bills'], bills]]);
  },
  help: async el => {
    const f = el.dataset.f;
    const list = (H().helpers || []).map(x => (x.id === el.dataset.id ? { ...x, [f]: f === 'amount' ? num(el.value) || 0 : el.value } : x));
    await B.setH([[['helpers'], list]]);
  },
  li: async el => {
    const { kind, id, f } = el.dataset;
    const v = f === 'amount' ? num(el.value) : el.value.trim();
    if (v === null || v === '') { render(); return; }
    await monthList(kind, arr => arr.map(o => (o.id === id ? { ...o, [f]: v } : o)));
  },
  billamt: async el => {
    const ym = homeYm();
    const b = H().bills.find(x => x.id === el.dataset.id);
    const v = num(el.value);
    if (v === null) { render(); return; }
    const normal = Calc.billNormal(b, ym);
    await B.setMonthField(ym, ['billAmt', b.id], Math.abs(v - normal) < 0.005 ? B.DEL : v);
    toast(`${b.name}: ${money(v)} for ${D.name(ym)}${Math.abs(v - normal) < 0.005 ? '' : ` (normally ${money(normal)})`}`);
  },
  catbudget: async el => {
    const v = num(el.value);
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases).cats.find(x => x.id === el.dataset.cat);
    if (v === null || v === c.budget) { render(); return; }
    await B.setMonth(ym, { budgets: { [c.id]: v } });
    toast(`${c.name}: ${D.name(ym)} budget ${money(v)} (${v > c.budget ? '+' : '−'}${money(Math.abs(v - c.budget))})`);
  },
  left: async el => {
    const v = num(el.value);
    if (v === null) { render(); return; }
    const ym = homeYm();
    const c = Calc.checklist(H(), S.months[ym], ym, S.purchases).cats.find(x => x.id === el.dataset.cat);
    const budget = round2(c.used + v);
    if (budget === c.budget) { render(); return; }
    await B.setMonth(ym, { budgets: { [c.id]: budget } });
    toast(`${c.name}: ${money(v)} left · ${D.name(ym)} budget ${money(budget)} (${budget > c.budget ? '+' : '−'}${money(Math.abs(budget - c.budget))})`);
  },
  inc: async el => {
    const v = num(el.value);
    await B.setH([[['plans', el.dataset.ym, el.dataset.k], v === null ? B.DEL : v]]);
    toast(`${D.name(el.dataset.ym)} updated`);
  },
  'imp-cat': el => {
    const r = S.imp.rows[el.dataset.i];
    r.cat = el.value;
    if (r.cat === 'skip') r.remember = false;
    render(true);
  },
  'imp-tag': el => { const r = S.imp.rows[el.dataset.i]; if (el.value && !r.tags.includes(el.value)) r.tags.push(el.value); render(true); },
  'imp-bal': el => { S.imp.bal = el.value; },
  'imp-remember': el => { S.imp.rows[el.dataset.i].remember = el.checked; },
  'imp-split-amt': el => { S.imp.rows[el.dataset.i].splits[el.dataset.j].amount = num(el.value) || 0; render(true); },
  'imp-split-tag': el => { S.imp.rows[el.dataset.i].splits[el.dataset.j].tag = el.value; },
  'imp-split-cat': el => { S.imp.rows[el.dataset.i].splits[el.dataset.j].cat = el.value; render(true); },
  rule: async el => {
    const rules = { ...(H().rules || {}) };
    const old = rules[el.dataset.k] || {};
    const v = el.value;
    rules[el.dataset.k] = v === 'skip' ? { ...old, action: 'skip' } : v === 'ask' ? { ...old, action: 'ask' } : v === 'pay' ? { ...old, action: 'pay' } : { ...old, action: 'cat', cat: v };
    await B.setH([[['rules'], rules]]);
  },
  alloc: el => { S.alloc.amt[el.dataset.id] = Math.abs(num(el.value) || 0); redrawAlloc(); },
  'alloc-one': el => {
    if (!el.value) return;
    const A = S.alloc;
    const rest = round2(Math.abs(A.amount) - Object.values(A.amt).reduce((a, v) => a + (Number(v) || 0), 0));
    if (rest > 0) A.amt[el.value] = round2((Number(A.amt[el.value]) || 0) + rest);
    redrawAlloc();
  },
  bk: async el => {
    const f = el.dataset.f;
    const v = ['goal', 'pct', 'monthly'].includes(f) ? (num(el.value) || 0) : el.value.trim();
    await B.setH([[['buckets'], (H().buckets || []).map(b => (b.id === el.dataset.id ? { ...b, [f]: v } : b))]]);
  },
  'bk-bal': async el => {
    const v = num(el.value);
    if (v === null) return;
    const cur = Calc.bucketBalances(H())[el.dataset.id];
    if (Math.abs(v - cur) < 0.005) return;
    await addBucketTx([{ b: el.dataset.id, amount: round2(v - cur), kind: 'adjust' }]);
  },
  earner: async el => {
    const name = el.value.trim();
    if (!name) return;
    await B.setH([[['earners'], Calc.earners(H()).map(e => (e.id === el.dataset.id ? { ...e, name } : e))]]);
  },
  usual: async el => { const v = num(el.value); await B.setH([[['usual', el.dataset.f], v === null ? B.DEL : v]]); },
  goal: async el => { const v = num(el.value); if (v !== null) await B.setH([[['savings', el.dataset.f], v]]); },
  font: async el => { await B.setH([[['look', el.dataset.f], el.value]]); },
  calm: async el => { await B.setH([[['look', 'calm'], el.checked]]); },
  glass: async el => { await B.setH([[['look', 'glass'], Number(el.value)]]); },
  mcolor: async el => { await B.setH([[['look', 'colors', el.dataset.m], el.value]]); },
};
document.addEventListener('change', e => {
  const el = e.target.closest('[data-ch]');
  if (!el || !changes[el.dataset.ch]) return;
  Promise.resolve(changes[el.dataset.ch](el)).catch(err => { console.error(err); toast('Couldn’t save that'); });
});
// Live preview while dragging the see-through slider.
document.addEventListener('input', e => {
  if (e.target.matches('[data-ch="alloc"]') && S.alloc) {
    S.alloc.amt[e.target.dataset.id] = Math.abs(num(e.target.value) || 0);
    const sum = $('#alloc-sum'); if (sum) sum.innerHTML = allocSumHtml();
    const btn = $('#alloc-save');
    if (btn) { btn.textContent = allocSaveLabel(); btn.disabled = S.alloc.amount < 0 && Math.abs(allocLeft()) > 0.004; }
  }
  if (e.target.id === 'mv-hysa') { const l = $('#hysa-left'); if (l) l.textContent = money(Number(e.target.dataset.actual) - Math.max(0, num(e.target.value) || 0)); }
  if (e.target.matches('[data-ch="glass"]')) document.documentElement.style.setProperty('--glass', e.target.value);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'l-amount') { e.preventDefault(); $('#l-note').focus(); }
  if (e.key === 'Enter' && e.target.matches('.val-in, .item-in')) { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape' && e.target.matches('.val-in, .item-in')) { e.target.value = ''; e.target.blur(); render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); acts[e.target.dataset.act](e.target); }
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
});

/* ---------- sign-in (Firebase only) ---------- */

function authScreen(mode = 'in', msg = '') {
  $('#tabs').hidden = true;
  $('#fab').hidden = true;
  const f = {
    in: `<h2>Sign in</h2>
      <label class="field"><span class="label">Email</span><input id="a-email" type="email" autocomplete="email"></label>
      <label class="field"><span class="label">Password</span><input id="a-pw" type="password" autocomplete="current-password"></label>
      <button class="btn full" id="a-go">Sign in</button>
      <p class="center small"><button class="linkish" data-mode="reset">Forgot password?</button></p>
      <p class="center small">New here? <button class="linkish" data-mode="up">Create an account</button></p>`,
    up: `<h2>Create an account</h2>
      <label class="field"><span class="label">Your first name</span><input id="a-name" autocomplete="given-name"></label>
      <label class="field"><span class="label">Email</span><input id="a-email" type="email" autocomplete="email"></label>
      <label class="field"><span class="label">Password <span class="small muted">(at least 6 characters)</span></span><input id="a-pw" type="password" autocomplete="new-password"></label>
      <button class="btn full" id="a-go">Create account</button>
      <p class="center small">Have an account? <button class="linkish" data-mode="in">Sign in</button></p>`,
    reset: `<h2>Reset password</h2>
      <label class="field"><span class="label">Email</span><input id="a-email" type="email" autocomplete="email"></label>
      <button class="btn full" id="a-go">Email me a reset link</button>
      <p class="center small"><button class="linkish" data-mode="in">Back to sign in</button></p>`,
  }[mode];
  view.innerHTML = `<div class="auth"><img class="logo" src="icon-192.png" alt=""><h1>Family Finances</h1><section class="card">${msg ? `<p class="msg">${esc(msg)}</p>` : ''}${f}</section></div>`;
  view.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => authScreen(b.dataset.mode); });
  const nice = e => ({
    'auth/invalid-credential': 'That email and password didn’t match.', 'auth/wrong-password': 'That email and password didn’t match.',
    'auth/user-not-found': 'No account with that email yet.', 'auth/email-already-in-use': 'There’s already an account with that email — sign in instead.',
    'auth/weak-password': 'Pick a password with at least 6 characters.', 'auth/invalid-email': 'That email doesn’t look right.',
    'auth/too-many-requests': 'Too many tries — wait a minute and try again.',
  }[e.code] || e.message);
  $('#a-go').onclick = async () => {
    const email = $('#a-email').value.trim();
    const pw = $('#a-pw') ? $('#a-pw').value : '';
    try {
      if (mode === 'in') await Store.signIn(email, pw);
      else if (mode === 'up') {
        const name = $('#a-name').value.trim();
        if (!name) { authScreen('up', 'Add your name'); return; }
        S.newName = name;
        await Store.signUp(name, email, pw);
      } else { await Store.reset(email); authScreen('in', 'Check your email for a reset link.'); }
    } catch (e) { authScreen(mode, nice(e)); }
  };
}

// Read a setup file (JSON) someone was given to fill in a new household.
function pickSetupFile(cb) {
  const f = $('#file');
  f.value = '';
  f.accept = '.json,application/json';
  f.onchange = async () => {
    const file = f.files[0];
    f.accept = 'image/*';
    if (!file) return;
    try { await cb(JSON.parse(await file.text())); } catch (e) { console.error(e); toast('That setup file couldn’t be read'); }
  };
  f.click();
}

function householdScreen(msg = '') {
  $('#tabs').hidden = true;
  view.innerHTML = `<div class="auth"><img class="logo" src="icon-192.png" alt=""><h1>Welcome, ${esc(S.user.name || S.newName || '')}</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ''}
    <section class="card"><h2>Start a budget</h2><p class="small muted">Starts blank — add your categories, bills and income in Settings. If someone gave you a setup file, load it instead.</p>
      <button class="btn full" id="h-new">Start blank</button><button class="btn full ghost" id="h-file" style="margin-top:8px">Load setup file</button></section>
    <section class="card"><h2>Join with a code</h2><p class="small muted">If the other person already started, enter the code from their Settings.</p>
      <input id="h-code" placeholder="8-letter code" autocapitalize="characters"><button class="btn full ghost" id="h-join">Join</button></section>
    <p class="center small"><button class="linkish" id="h-out">Sign out</button></p></div>`;
  const name = S.user.name || S.newName || 'Me';
  $('#h-new').onclick = async () => { try { const id = await Store.createHousehold(name); openHousehold(id); } catch (e) { console.error(e); householdScreen(e.message); } };
  $('#h-file').onclick = () => pickSetupFile(async data => { try { const id = await Store.createHousehold(name, data); openHousehold(id); } catch (e) { console.error(e); householdScreen(e.message); } });
  $('#h-join').onclick = async () => { try { const id = await Store.joinHousehold($('#h-code').value, name); openHousehold(id); } catch (e) { console.error(e); householdScreen(e.message); } };
  $('#h-out').onclick = () => Store.signOut();
}

/* ---------- boot ---------- */

// Purchases: the live window (last month + this month, plus bulk buys still
// spreading into them) and any older months fetched when Review needs them.
const HISTORY_MONTHS = 17; // a 12-month chart + up to 6-month bulk spreads
S.since = `${D.addMonths(D.curYm(), -1)}-01`;
S.loadedFrom = S.since;
S.live = [];
S.older = [];
function mergePurchases() {
  const ids = new Set(S.live.map(p => p.id));
  S.purchases = S.live.concat(S.older.filter(p => !ids.has(p.id)));
}
// Last month a purchase counts in (bulk buys spread over several months).
const untilOf = p => D.addMonths(D.ymOf(p.date), Math.max(1, Number(p.spread) || 1) - 1);
// Make sure purchases are loaded far enough back to show month ym (and the
// 12-month chart / bulk-buy spreads that reach into it).
async function ensureLoaded(ym) {
  const need = `${D.addMonths(ym, -HISTORY_MONTHS)}-01`;
  if (need >= S.loadedFrom || S.loading) return;
  S.loading = true;
  try {
    const got = await B.loadPurchases(need, S.loadedFrom);
    S.loadedFrom = need;
    S.older = S.older.concat(got);
    mergePurchases();
    render();
  } finally { S.loading = false; }
}

const listeners = {
  since: S.since,
  household: h => { S.H = h; S.gotH = true; maybeRender(); },
  months: m => { S.months = m; S.gotM = true; maybeRender(); },
  purchases: p => { S.live = p; mergePurchases(); S.gotP = true; maybeRender(); },
  wallpapers: w => { S.wallpapers = w; if (S.H) applyLook(); maybeRender(); },
  error: e => { if (e.code === 'permission-denied') toast('You don’t have access to this household.'); },
};
function maybeRender() {
  if (!(S.gotH && S.gotM && S.gotP)) return;
  if (sheetOpen() && S.sheet === 'soft') { S.pending = true; return; }
  render();
}
function openHousehold(id) { S.hid = id; view.innerHTML = '<p class="loading">Loading…</p>'; B.open(id, listeners); }

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

if (Store.configured) {
  Store.onUser(async u => {
    S.user = u;
    if (!u) { S.H = null; authScreen(); return; }
    if (!u.name && S.newName) u.name = S.newName;
    view.innerHTML = '<p class="loading">Loading…</p>';
    try {
      const id = await Store.myHousehold();
      if (id) openHousehold(id); else householdScreen();
    } catch (e) { console.error(e); householdScreen('Couldn’t load your household. Check your connection.'); }
  });
} else {
  S.user = { uid: 'me', name: 'Bella', email: '' };
  Demo.open(listeners);
}

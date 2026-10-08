/* The screens. Data comes in through the listeners in boot(), everything is
   drawn from plain HTML strings, and taps are handled by one delegated
   listener keyed on data-act (clicks) and data-ch (input changes).

   Screens (hash routes): #/habits (📊 → #/breakdown)  #/home ($: budgets + bills)  #/year
                          #/setup/plan + #/setup/start (from the $ page)  #/settings (gear on Home) */

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
const habitsOn = () => feat('habits') !== false;
const onByDefault = k => (k === 'overview' ? overviewOn() : k === 'habits' ? habitsOn() : !!feat(k));
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

// Same dialog with a text box; resolves to the typed text, or null if cancelled.
function askText(text, placeholder = '', ok = 'Add') {
  return new Promise(res => {
    $('#dialog').innerHTML = `<p>${text}</p><input id="dialog-in" placeholder="${esc(placeholder)}" autocapitalize="sentences"><div class="row end" style="margin-top:10px">
      <button class="btn ghost" data-d="0">Cancel</button><button class="btn" data-d="1">${esc(ok)}</button></div>`;
    $('#dialog-wrap').hidden = false;
    const inp = $('#dialog-in');
    setTimeout(() => inp.focus(), 50);
    const done = yes => { $('#dialog-wrap').hidden = true; res(yes ? inp.value.trim() || null : null); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    $('#dialog').onclick = e => { const b = e.target.closest('[data-d]'); if (b) done(b.dataset.d === '1'); };
  });
}

// "+ New tag…" from a tag picker: adds it to the household's tags and returns its name.
async function newTag() {
  const v = await askText('New tag', 'e.g. Birthday');
  if (!v) return null;
  const have = (H().tags || []).find(x => x.toLowerCase() === v.toLowerCase());
  if (have) return have;
  await B.setH([[['tags'], [...(H().tags || []), v]]]);
  return v;
}

/* Date picker drawn by the app (the phone's own one can't be styled): Today /
   Yesterday buttons and a small calendar. A hidden input holds the date, so
   forms read #id.value exactly like before. */
function datePicker(id, value) {
  return `<div class="dp">${dpInner(id, value, D.ymOf(value), false)}</div>`;
}
function dpInner(id, value, view, open) {
  const today = D.today();
  const yest = D.dayStr(new Date(Date.now() - 864e5));
  const nice = x => new Date(`${x}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const other = value !== today && value !== yest;
  let cal = '';
  if (open) {
    const [y, m] = view.split('-').map(Number);
    const blanks = new Date(y, m - 1, 1).getDay();
    const cells = Array.from({ length: blanks }, () => '<span></span>').join('') + Array.from({ length: D.daysIn(view) }, (_, i) => {
      const v = `${view}-${D.pad(i + 1)}`;
      return `<button type="button" class="${v === value ? 'on' : ''} ${v === today ? 'today' : ''}" data-act="dp-day" data-v="${v}" ${v > today ? 'disabled' : ''}>${i + 1}</button>`;
    }).join('');
    cal = `<div class="dp-cal"><div class="dp-head"><button type="button" class="nav" data-act="dp-nav" data-d="-1" aria-label="Previous month">‹</button><b>${D.label(view)}</b>
      <button type="button" class="nav" data-act="dp-nav" data-d="1" aria-label="Next month" ${view >= D.curYm() ? 'disabled' : ''}>›</button></div>
      <div class="dp-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span class="dp-dow">${x}</span>`).join('')}${cells}</div></div>`;
  }
  return `<input type="hidden" id="${id}" value="${esc(value)}" data-view="${view}" data-open="${open ? 1 : 0}">
    <div class="seg dp-seg">${[['Today', today], ['Yesterday', yest]].map(([l, v]) => `<button type="button" class="${value === v ? 'on' : ''}" data-act="dp-pick" data-v="${v}">${l}</button>`).join('')}
      <button type="button" class="${other ? 'on' : ''}" data-act="dp-open">${other ? nice(value) : 'Other day'} ▾</button></div>
    ${other ? '' : `<div class="small muted dp-sel">${nice(value)}</div>`}${cal}`;
}
function dpSet(el, value, view, open) {
  const box = el.closest('.dp');
  const inp = box.querySelector('input[type="hidden"]');
  box.innerHTML = dpInner(inp.id, value ?? inp.value, view ?? inp.dataset.view, open ?? inp.dataset.open === '1');
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
  habits: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8.5 14.5l2 2 4-4"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/><circle cx="17.5" cy="5.5" r="2.5"/><path d="m19.3 7.3 1.9 1.9"/></svg>',
  setup: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10l1.5 1.5L13 8.5M8.5 15.5h7"/></svg>',
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

// Light / dark: each phone picks its own (Light by default, Dark, or Match phone).
const themePref = () => { try { return localStorage.getItem('ne-theme') || 'light'; } catch (e) { return 'light'; } };
const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => themePref() === 'dark' || (themePref() === 'auto' && !!(darkMQ && darkMQ.matches));
function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#1B1815' : '#F6F1EA';
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => { applyTheme(); applyLook(); });

function applyLook() {
  applyTheme();
  if (!H()) return;
  const look = H().look || {};
  const ym = homeYm();
  const accent = monthColor(ym);
  const vars = {
    '--accent': accent,
    '--on-accent': onColor(accent),
    '--accent-ink': onColor(accent) === '#FFFFFF' || isDark() ? accent : `color-mix(in srgb, ${accent} 62%, #2B2522)`,
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

const OLD_ROUTES = { bills: 'home', more: 'home', review: 'habits' };
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
  let r = welcoming() ? 'welcome' : route();
  if (r === 'habits' && !habitsOn()) r = 'breakdown';
  const screens = { welcome: viewWelcome, home: viewHome, year: viewYear, habits: viewHabits, breakdown: viewBreakdown, setup: viewSetup, newyear: viewNewYear, settings: viewSettings, import: viewImport, savings: viewSavings };
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
  if (r === 'welcome') $('#tabs').hidden = true;
  // New person (after first-time setup, or joined with a code): show the tour once.
  if (r !== 'welcome' && !S.tour && !S.tourAsked && ((H().people || {})[me()] || {}).tourPending) { S.tourAsked = true; setTimeout(startTour, 700); }
  if (S.tour) setTimeout(tourDraw, 50);
  const fab = $('#fab');
  fab.hidden = !['home', 'habits', 'breakdown'].includes(r);
  // The tour's Log/Import stop shows both buttons, whatever this household picked.
  const tourBoth = S.tour && S.tour.steps[S.tour.i].showBoth;
  const importing = H().trackMode === 'import' && !tourBoth;
  // Both: + Log stays the main button, with a small Import button beside it.
  let fab2 = $('#fab2');
  if (!fab2) { fab2 = document.createElement('button'); fab2.id = 'fab2'; fab2.className = 'fab fab-mini'; fab2.dataset.act = 'import-file'; fab2.setAttribute('aria-label', 'Import bank transactions'); fab2.innerHTML = '<span>↑</span> Import'; document.body.appendChild(fab2); }
  fab2.hidden = fab.hidden || (H().trackMode !== 'both' && !tourBoth);
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
  const on = id => (r === id || (id === 'home' && ['settings', 'import', 'setup', 'newyear'].includes(r)) || (id === 'year' && r === 'savings') || (id === 'habits' && r === 'breakdown') ? 'on' : '');
  t.innerHTML = (habitsOn() ? `<a href="#/habits" class="${on('habits')}">${icons.habits}<span>Habits</span></a>` : `<a href="#/breakdown" class="${on('breakdown')}">${icons.chart}<span>Breakdown</span></a>`)
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
  // Covers this month: "Covered $45 from Home" on the one that went over,
  // "$45 went to Food" on the one it came from. Tap × to undo.
  const covers = ((S.months[homeYm()] || {}).covers || []).filter(x => x.to === c.id || x.from === c.id);
  const nameOf = id => (catById(id) || {}).name || 'an old category';
  const notes = covers.map(x => `<div class="small muted cover-note">${x.to === c.id ? `Covered ${money(x.amount)} from ${esc(nameOf(x.from))}` : `${money(x.amount)} went to ${esc(nameOf(x.to))}`} <button class="linkish small" data-act="cover-undo" data-id="${esc(x.id)}" aria-label="Undo">undo</button></div>`).join('');
  return `<div class="cat card ${c.over ? 'over' : ''}" role="button" tabindex="0" data-act="${tapAct}" data-cat="${esc(c.id)}">
    <div class="row between"><span class="cat-name">${catBadge(c.id, 30)}${esc(c.name)}</span><span>${right} <span class="muted small of">/ <button class="val-edit small-edit" data-act="budget-edit" data-cat="${esc(c.id)}" aria-label="Change ${esc(c.name)}'s budget this month">${money(c.budget)}</button></span></span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${c.over ? `<div class="cover-row"><button class="btn ghost small" data-act="cover" data-cat="${esc(c.id)}">Cover it ›</button></div>` : ''}${notes}
  </div>`;
}

// "Cover it": move budget from other categories (this month only) to one that
// went over. S.cover = { cat, need, amt: {catId: $} }.
function coverCats() {
  const ym = homeYm();
  return Calc.checklist(H(), S.months[ym], ym, S.purchases).cats;
}
function openCover(catId) {
  const c = coverCats().find(x => x.id === catId);
  if (!c || !c.over) return;
  S.cover = { cat: catId, need: round2(c.used - c.budget), amt: {} };
  S.sheet = 'cover';
  openSheet(coverHtml());
}
function coverTotal() { return round2(Object.values(S.cover.amt).reduce((a, v) => a + (Number(v) || 0), 0)); }
function coverBad() {
  const cats = coverCats();
  return Object.entries(S.cover.amt).some(([id, v]) => v > ((cats.find(x => x.id === id) || {}).left || 0) + 0.004) || coverTotal() > S.cover.need + 0.004;
}
function coverSumHtml() {
  const left = round2(S.cover.need - coverTotal());
  if (coverBad()) return `<div class="alloc-sum over"><b>Too much</b> <span>${coverTotal() > S.cover.need + 0.004 ? `only ${money(S.cover.need)} is needed` : 'more than a category has left'}</span></div>`;
  if (Math.abs(left) <= 0.004) return `<div class="alloc-sum ok"><b>${money(0)}</b> <span>All covered ✓</span></div>`;
  return `<div class="alloc-sum left"><b>${money(left)}</b> <span>${coverTotal() > 0 ? 'still from Savings/Excess' : 'still to cover'}</span></div>`;
}
function coverSaveLabel() {
  const t = coverTotal();
  return t <= 0.004 ? 'Cover' : t < S.cover.need - 0.004 ? `Cover ${money(t)} (rest from Savings/Excess)` : `Cover ${money(t)}`;
}
function coverHtml() {
  const C = S.cover;
  const c = catById(C.cat);
  const others = coverCats().filter(x => x.id !== C.cat && x.left > 0.004);
  return `<div class="sheet-head alloc-head"><h2>Cover ${money(C.need)}</h2><button class="x" data-act="close" aria-label="Close">×</button>
      <div id="cover-sum" class="alloc-pin">${coverSumHtml()}</div></div>
    <p class="small muted">${esc(c ? c.name : '')} went over. Take it from what's left in another category — just for ${D.name(homeYm())}. Tap a name to fill it in.</p>
    ${others.length ? others.map(x => `<div class="line alloc-line"><button class="linkish cover-pick" data-act="cover-fill" data-id="${esc(x.id)}">${catLabel(x)} <span class="small muted">${money(x.left)} left</span></button>
      <input class="mini" data-ch="cover" data-id="${esc(x.id)}" inputmode="decimal" placeholder="$" value="${C.amt[x.id] ? C.amt[x.id] : ''}"></div>`).join('')
      : '<p class="muted">No other category has money left this month, so this comes out of Savings/Excess.</p>'}
    <div class="row between sheet-foot"><button class="linkish small" data-act="close">Leave it — comes out of Savings/Excess</button>
      ${others.length ? `<button class="btn" id="cover-save" data-act="cover-save" ${coverTotal() <= 0.004 || coverBad() ? 'disabled' : ''}>${coverSaveLabel()}</button>` : ''}</div>`;
}
function redrawCover() { const y = $('#sheet').scrollTop; $('#sheet').innerHTML = coverHtml(); $('#sheet').scrollTop = y; }
function refreshCoverSum() {
  const sum = $('#cover-sum'); if (sum) sum.innerHTML = coverSumHtml();
  const btn = $('#cover-save'); if (btn) { btn.textContent = coverSaveLabel(); btn.disabled = coverTotal() <= 0.004 || coverBad(); }
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
    <span class="pamt">${money(p.amount)}${part}${p.bankConfirmed ? '<span class="small muted bank-ok" title="Matched to the bank">✓ bank</span>' : ''}</span>
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
  const prompt = S.tour && S.tour.steps[S.tour.i].showSetup ? { kind: 'plan', ym: D.addMonths(D.curYm(), 1), banner: false } : setupPrompt();
  return `
  <header class="hero home-hero">
    <a class="gear" href="#/settings" aria-label="Settings">${icons.gear}</a>
    ${prompt ? `<a class="gear setup-icon ${prompt.planned ? 'planned' : ''}" href="#/setup/${prompt.kind}" aria-label="${prompt.kind === 'start' ? 'Start' : 'Plan'} ${D.name(prompt.ym)}">${icons.setup}${prompt.planned ? '<i>✓</i>' : ''}</a>` : ''}
    <h1>${D.name(ym)}</h1>
  </header>
  ${newYearCard()}
  ${prompt && prompt.banner ? `<a class="card setup-link setup-banner" href="#/setup/${prompt.kind}"><span class="grow"><b>${prompt.kind === 'start' ? 'Start' : 'Plan'} ${D.name(prompt.ym)}</b><span class="small muted">${prompt.kind === 'plan' ? 'Budgets, bills and paychecks for next month' : `Close out ${D.name(D.addMonths(prompt.ym, -1))} and move your extra to savings`}</span></span><i>›</i></a>` : ''}
  ${overviewOn() ? `<div class="seg page-toggle" role="tablist">${[['overview', 'Overview'], ['budgets', 'Budgets']].map(([k, l]) => `<button role="tab" aria-selected="${S.page === k}" class="${S.page === k ? 'on' : ''}" data-act="page" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
  ${overviewOn() && S.page === 'overview' ? billsSections() : `
  <div class="spend-sum">
    <div><b>${money(Math.max(0, totalB - totalU))}</b> <span class="muted">left to spend</span> <span class="muted small">/ ${money(totalB)}</span></div>
    ${c.uncat > 0.004 ? `<div class="small muted"><button class="linkish small uncat-jump" data-act="to-uncat">${money(c.uncat)} uncategorized</button> — taken from Savings/Excess until you pick a category.</div>` : ''}
    ${['import', 'both'].includes(H().trackMode) ? `<div class="small muted">${(H().imports || {}).through ? `${H().trackMode === 'both' ? 'Last import through' : 'Updated through'} ${D.niceDay(H().imports.through)}` : 'No imports yet'}</div>` : ''}
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
    <p class="small muted">Tap one to pick a category. Until then, these are taken from Savings/Excess.</p>
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
  ${L.id && L.splitGroup ? `<p class="small muted">Part of a ${money(L.splitTotal)} receipt split across categories.</p>` : ''}
  ${!L.id && L.splits ? logSplitHtml(L) : `<div class="field"><span class="label">Category</span><div class="chips">${H().categories.map(c => chip('l-cat', c.id, L.cat === c.id, catLabel(c, 20))).join('')}${chip('l-cat', 'uncat', L.cat === 'uncat' || (L.id && !catById(L.cat)), '❔ Decide later')}</div>
    ${L.id ? '' : '<button type="button" class="linkish small" data-act="l-split">Split between categories</button>'}</div>`}
  <div class="field"><span class="label">Store</span><div class="chips">${(H().stores || []).map(s => chip('l-store', s, L.store === s, esc(s))).join('')}
    <button type="button" class="chip add" data-act="l-add" data-kind="stores">+ New</button></div></div>
  <div class="field"><span class="label">Tags <span class="muted small">(optional — for tracking things like diapers)</span></span><div class="chips">${(H().tags || []).map(t => chip('l-tag', t, L.tags.includes(t), esc(t))).join('')}
    <button type="button" class="chip add" data-act="l-add" data-kind="tags">+ New</button></div></div>
  <div class="field"><span class="label">Date</span>${datePicker('l-date', L.date)}</div>
  <label class="field"><span class="label">Note</span><input id="l-note" placeholder="optional" value="${esc(L.note)}"></label>
  <div class="field"><span class="label">Bulk buy? Spread it over</span><div class="seg">${[1, 2, 3, 4, 6].map(n => `<button type="button" class="${Number(L.spread) === n ? 'on' : ''}" data-act="l-spread" data-v="${n}">${n === 1 ? 'Just this month' : n + ' months'}</button>`).join('')}</div></div>
  <div class="row end sheet-foot">${L.id ? '<button class="btn ghost danger" data-act="l-del">Delete</button>' : ''}<button class="btn" data-act="l-save">${L.id ? 'Save' : 'Log it'}</button></div>`;
}
// One receipt, several categories (Target: diapers for Twins, clothes for Home, groceries).
// Saved as one purchase per category, tied together so an import matches the whole receipt.
function logSplitHtml(L) {
  const total = num(L.amount) || 0;
  return `<div class="field"><span class="label">Split between categories</span>
    ${L.splits.map((sp, j) => `<div class="edit-row"><input class="mini" data-ch="l-split-amt" data-j="${j}" inputmode="decimal" value="${sp.amount}" aria-label="Amount">
      <select data-ch="l-split-cat" data-j="${j}" aria-label="Category">${catOptions(sp.cat)}</select>
      <select class="split-tag" data-ch="l-split-tag" data-j="${j}" aria-label="Tag"><option value="">Tag</option>${(H().tags || []).map(t => `<option ${sp.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__new">+ New tag…</option></select>
      ${j > 1 ? `<button type="button" class="x small" data-act="l-split-del" data-j="${j}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
    <div class="small">${splitSumHtml({ i: 'log', amount: total, splits: L.splits })} · <button type="button" class="linkish small" data-act="l-split-add">+ another</button> · <button type="button" class="linkish small" data-act="l-split-off">undo split</button></div></div>`;
}
const logSplitRow = L => ({ amount: num(L.amount) || 0, splits: L.splits });

function redrawLog() { syncLog(); const y = $('#sheet').scrollTop; $('#sheet').innerHTML = logHtml(); $('#sheet').scrollTop = y; }

async function saveLog() {
  syncLog();
  const L = S.log;
  const amount = num(L.amount);
  if (!amount || amount <= 0) { toast('Add the amount first'); $('#l-amount').focus(); return; }
  if (!L.id && L.splits) { await saveLogSplit(amount); return; }
  if (!L.cat) { toast('Pick a category'); return; }
  const rec = {
    amount, cat: L.cat, store: L.store || '', tags: L.tags || [], note: (L.note || '').trim(),
    date: L.date || D.today(), spread: Number(L.spread) || 1,
    by: L.by || me(), byName: L.byName || myName(), t: L.t || Date.now(),
  };
  rec.until = untilOf(rec);
  if (L.id) rec.id = L.id;
  if (L.src) { rec.src = L.src; rec.key = L.key || ''; }
  if (L.bankConfirmed) rec.bankConfirmed = true;
  if (L.splitGroup) { rec.splitGroup = L.splitGroup; rec.splitTotal = L.splitTotal; }
  const before = Calc.checklist(H(), S.months[D.ymOf(rec.date)], D.ymOf(rec.date), S.purchases).cats.find(c => c.id === rec.cat);
  closeSheet();
  await B.savePurchase(rec);
  if (rec.id && rec.date < S.since) { S.older = S.older.map(p => (p.id === rec.id ? { ...rec } : p)); mergePurchases(); render(); }
  const c = catById(rec.cat);
  if (!c) { toast(`Logged ${money(amount)} · in Uncategorized until you pick a category`); return; }
  const ym = D.ymOf(rec.date);
  const after = Calc.checklist(H(), S.months[ym], ym, S.purchases.filter(p => p.id !== rec.id).concat([{ ...rec, id: rec.id || 'new' }])).cats.find(x => x.id === rec.cat);
  if (after && after.over && !(before && before.over)) toast(calm() ? `${c.name} is ${money(after.used - after.budget)} over — flagged for review. That’s OK.` : `${c.name} is over budget by ${money(after.used - after.budget)}`);
  else if (after) toast(`Logged ${money(amount)} · ${money(Math.max(0, after.left))} left in ${c.name}`);
}

async function saveLogSplit(amount) {
  const L = S.log;
  const parts = L.splits.filter(sp => Number(sp.amount));
  const sum = round2(parts.reduce((a, sp) => a + Number(sp.amount), 0));
  if (Math.abs(sum - amount) > 0.004) { toast(`The split adds up to ${money(sum)} of ${money(amount)}`); return; }
  if (parts.some(sp => !sp.cat)) { toast('Pick a category for each part'); return; }
  const group = newId();
  const base = {
    store: L.store || '', note: (L.note || '').trim(), date: L.date || D.today(), spread: Number(L.spread) || 1,
    by: me(), byName: myName(), t: Date.now(), splitGroup: group, splitTotal: amount,
  };
  base.until = untilOf(base);
  const list = parts.map(sp => ({ ...base, amount: Number(sp.amount), cat: sp.cat, tags: [...new Set([...(L.tags || []), ...(sp.tag ? [sp.tag] : [])])] }));
  closeSheet();
  await B.savePurchases(list);
  toast(`Logged ${money(amount)} across ${list.length} categories`);
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
      ${S.sinceOpen ? `<div class="since">${c.since.map(s => `<div class="line small"><span>${esc(s.what)}${s.kind ? ` <button class="linkish small" data-act="since-pre" data-kind="${s.kind}" data-id="${esc(s.id)}">already in that balance</button>` : ''}</span><span>${s.amount > 0 ? '+' : ''}${money(s.amount)}</span></div>`).join('')}
        <p class="small muted">Something here was already in the balance you typed? Tap “already in that balance” so it isn’t counted twice. (Anything you check off within an hour of typing a balance is counted as already in it.)</p></div>` : ''}` : ''}
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

  <section class="card bills-card">
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
        <span class="grow"><span>${esc(b.name)}${charged}</span>${b.self && !b.paid ? `<span class="small ${b.late ? 'warn' : 'muted'}">${b.late ? `⚠️ due the ${D.ordinal(b.day)}` : 'you pay this one'}</span>` : ''}${b.pre ? `<span class="small muted">already out when you updated checking · <button class="linkish small" data-act="bill-auto" data-id="${esc(b.id)}">undo</button></span>` : ''}${b.manual ? `<span class="small ${b.late ? 'warn' : 'muted'}">${b.late ? '⚠️ unchecked by hand' : 'set by hand'} · <button class="linkish small" data-act="bill-auto" data-id="${esc(b.id)}">back to automatic</button></span>` : ''}</span>
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
// Checking something off within an hour of typing the checking balance (same
// sitting): it's taken as already in that balance, so it isn't added or
// subtracted a second time. Later than that, it's treated as new.
function stampNow() {
  const snap = ((S.months[homeYm()] || {}).checking || {}).at || 0;
  return snap && Date.now() - snap < 36e5 ? snap : Date.now();
}
function toggleFlag(o, flag) {
  const key = flag + 'At';
  if (o[flag]) return { ...o, [flag]: false };
  const snap = ((S.months[homeYm()] || {}).checking || {}).at || 0;
  return { ...o, [flag]: true, [key]: o[key] && o[key] <= snap ? o[key] : stampNow() };
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
  // Additional income (OT, academy pay…) counts in that same month (not a paycheck for next month).
  const elev = (r.extras || []).map(x => line(`<span class="muted">Additional:</span> ${esc(x.name)}`, x.amount)).join('');
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
  S.plan = { ym, other: (p.other || []).map(o => ({ ...o })), extra: Calc.extras(p).map(x => ({ ...x, id: x.id === 'elevate' ? newId() : x.id })) };
  const auto = (() => {
    const M = S.months[ym];
    return (H().bills || []).reduce((s, b) => s + Calc.billAmount(b, ym, M), 0) + (H().categories || []).reduce((s, c) => s + Calc.budgetFor(H(), M, c, ym), 0);
  })();
  const v = x => (x === undefined || x === null ? '' : x);
  S.sheet = 'plan';
  openSheet(`<div class="sheet-head"><h2>${D.label(ym)}</h2><button class="x" data-act="close">×</button></div>
    <div class="two">${Calc.earners(H()).map(e => `<label class="field"><span class="label">${esc(e.name)} income</span><input id="p-pay-${esc(e.id)}" inputmode="decimal" value="${v(p[e.id])}"></label>`).join('')}</div>
    <div class="field"><span class="label">Additional income <span class="muted small">(one-time, this month)</span></span><div id="p-extra">${planListHtml('extra')}</div>
      <div class="add-row"><input id="p-xname" placeholder="e.g. OT"><input id="p-xamt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="p-xadd">Add</button></div></div>
    <p class="small muted">Additional income goes into ${D.name(ym)}’s savings and shows up on its checklist when you set it up — it isn’t next month’s income.</p>
    <label class="field"><span class="label">Expenses <span class="muted small">(bills + budgets ≈ ${money(auto)})</span></span><input id="p-exp" inputmode="decimal" placeholder="${auto}" value="${v(p.expenses)}"></label>
    <div class="field"><span class="label">Other expenses (one-time: travel, Xmas, birthdays…)</span><div id="p-other">${planListHtml('other')}</div>
      <div class="add-row"><input id="p-oname" placeholder="What"><input id="p-oamt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="p-oadd">Add</button></div></div>
    ${S.months[ym] && S.months[ym].setup
      ? `<p class="small muted">${D.name(ym)} is already set up — change its budgets on the Budgets page.</p>`
      : `<div class="field"><span class="label">Budgets for ${D.name(ym)} <span class="muted small">(starts from your normal amounts; used when you set up the month)</span></span>
        ${H().categories.map(c => { const pb = (p.budgets || {})[c.id]; return `<div class="line"><span>${catLabel(c)} <span class="small muted">normally ${money(c.budget)}</span></span><input class="mini" id="p-b-${esc(c.id)}" inputmode="decimal" value="${pb !== undefined && pb !== null ? pb : c.budget}"></div>`; }).join('')}</div>`}
    <label class="field"><span class="label">Added to savings this month <span class="muted small">(leave blank to figure it automatically${y && y.kind === 'auto' ? `: ${money(y.savings)}` : ''})</span></span><input id="p-sav" inputmode="decimal" value="${v(p.savings)}"></label>
    <label class="field"><span class="label">Note</span><input id="p-note" value="${esc(p.note || '')}"></label>
    <div class="row end sheet-foot"><button class="btn" data-act="p-save">Save</button></div>`);
}
const planListHtml = kind => S.plan[kind].map(o => `<div class="line"><span>${esc(o.name)}</span><span><b>${money(o.amount)}</b> <button class="x small" data-act="p-del" data-kind="${kind}" data-id="${esc(o.id)}">×</button></span></div>`).join('') || '<p class="muted small">None</p>';

function planAdd(kind, nameSel, amtSel) {
  const name = $(nameSel).value.trim();
  const amount = num($(amtSel).value);
  if (!name || !amount) { toast('Add a name and an amount'); return; }
  S.plan[kind].push({ id: newId(), name, amount });
  $(`#p-${kind}`).innerHTML = planListHtml(kind);
  $(nameSel).value = ''; $(amtSel).value = '';
}

async function savePlan() {
  const ym = S.plan.ym;
  const old = (H().plans || {})[ym] || {};
  const val = id => { const n = num($(id).value); return n === null ? null : n; };
  const p = {
    ...old,
    ...Object.fromEntries(Calc.earners(H()).map(e => [e.id, val(`#p-pay-${e.id}`)])),
    expenses: val('#p-exp'), savings: val('#p-sav'),
    other: S.plan.other, extra: S.plan.extra, note: $('#p-note').value.trim(),
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
  delete p.elevate; delete p.elevateName; delete p.elevateToSavings;
  closeSheet();
  await B.setH([[['plans', ym], p]]);
  toast(`${D.name(ym)} saved`);
}

// Raises / job changes: a new usual income starting a given month.
function usualChangesHtml(fromYm) {
  const people = Calc.earners(H());
  const nameOf = id => (people.find(e => e.id === id) || {}).name || '?';
  const list = (H().usualChanges || []).filter(c => !fromYm || c.from >= fromYm).sort((a, b) => (a.from < b.from ? -1 : 1));
  return `${list.map(c => `<div class="small muted change">→ ${esc(nameOf(c.earner))} ${money(c.amount)} starting ${D.label(c.from)} <button class="linkish small" data-act="uc-del" data-id="${esc(c.id)}">remove</button></div>`).join('')}
    <details class="small"><summary>Expecting a change? (raise, new job)</summary><div class="add-row">${people.length > 1 ? `<select id="uc-who">${people.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select>` : ''}<input type="month" id="uc-m" value="${fromYm || D.addMonths(homeYm(), 1)}"><input id="uc-a" inputmode="decimal" placeholder="New $"><button class="btn small" data-act="uc-add">Add</button></div></details>`;
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

// December and January: plan the coming year (savings recap / HYSA first), until it's done.
function newYearCard() {
  const m = D.monthNum(D.curYm());
  if (m !== 12 && m !== 1) return '';
  if (m === 12 && new Date().getDate() < setupRemindDay(D.curYm())) return '';
  const Y = nyYear();
  if ((H().nyDone || {})[Y]) return '';
  return `<a class="card setup-link ny-link" href="#/newyear"><span class="grow"><b>Set up ${Y}</b><span class="small muted">${bucketsOn() ? 'Savings recap' : 'Savings recap & HYSA'}, then budgets, bills, income and one-time money for the year</span></span><i>›</i></a>`;
}

// Every purchase ever (search and backups need more than the recent months kept live).
async function loadAllPurchases() {
  const FROM = '2000-01-01';
  while (S.loading) await new Promise(r => setTimeout(r, 200));
  if (S.loadedFrom <= FROM) return;
  S.loading = true;
  try {
    const got = await B.loadPurchases(FROM, S.loadedFrom);
    S.loadedFrom = FROM;
    S.older = S.older.concat(got);
    mergePurchases();
  } finally { S.loading = false; }
}

// Search: every word has to show up somewhere — store, note, tags, category, date or amount.
function searchResultsHtml(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const hay = p => {
    const c = catById(p.cat);
    return [p.store, p.note, ...(p.tags || []), c ? c.name : 'uncategorized', p.date, D.niceDay(p.date), D.name(D.ymOf(p.date)),
      (Number(p.amount) || 0).toFixed(2), money(p.amount)].join(' ').toLowerCase();
  };
  const hits = S.purchases.filter(p => { const h = hay(p); return words.every(w => h.includes(w.replace(/^\$/, ''))); })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = round2(hits.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  return `<section class="card"><div class="row between"><span class="label">${hits.length} purchase${hits.length === 1 ? '' : 's'}</span><b>${money(total)}</b></div>
    ${hits.length ? hits.slice(0, 100).map(p => purchaseRow(p, false)).join('') : '<p class="muted small">Nothing matches.</p>'}
    ${hits.length > 100 ? '<p class="small muted">Showing the newest 100 — add another word to narrow it down.</p>' : ''}
    ${S.loadedFrom > '2000-01-01' ? '<p class="small muted">Loading older purchases…</p>' : ''}</section>`;
}
function refreshSearch() { const box = $('#pq-results'); if (box) box.innerHTML = S.pq ? searchResultsHtml(S.pq) : ''; }

// Chart icons: simple white line icons for categories on the Breakdown page
// (emojis turned white lose their detail). Each category gets one picked from
// its emoji/name, or the one chosen in Settings → Categories (c.icon).
// c.emoji is now only a hint for that automatic pick (not shown).
const CAT_ICONS = {
  cart: ['Groceries', '<circle cx="8" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h2.5l2.6 12a2 2 0 0 0 2 1.6h9a2 2 0 0 0 1.9-1.5L21.5 7H5.4"/>'],
  utensils: ['Eating out', '<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2"/><path d="M17 22V2c-2.5 1-4 3.5-4 7v4h4"/>'],
  coffee: ['Coffee', '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v3M12 2.5v3"/>'],
  house: ['Home', '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9"/>'],
  paw: ['Pets', '<circle cx="5.5" cy="10" r="1.8"/><circle cx="9.3" cy="5.5" r="1.8"/><circle cx="14.7" cy="5.5" r="1.8"/><circle cx="18.5" cy="10" r="1.8"/><path d="M12 11.5c-2.5 0-5 3.3-5 6 0 1.8 1.3 2.8 3 2.8.8 0 1.4-.4 2-.4s1.2.4 2 .4c1.7 0 3-1 3-2.8 0-2.7-2.5-6-5-6z"/>'],
  bottle: ['Baby & kids', '<path d="M10 2.5h4v3.5h-4z"/><path d="M9 6h6l1 3v10.5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9z"/><path d="M8 13h3M8 16.5h3"/>'],
  balloon: ['Activities', '<path d="M12 15.5c-3.3 0-6-3-6-6.5S8.7 2.5 12 2.5s6 3 6 6.5-2.7 6.5-6 6.5z"/><path d="M11 17.5h2l-1-2z"/><path d="M12 17.5c0 2-1.5 2.5-.5 4"/>'],
  fuel: ['Gas', '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V8l-3-3"/>'],
  car: ['Car', '<path d="M5 17h14v-4.5l-2-5a1.5 1.5 0 0 0-1.4-1H8.4a1.5 1.5 0 0 0-1.4 1l-2 5z"/><path d="M5 12.5h14M5 17v2.5M19 17v2.5M8 15h.01M16 15h.01"/>'],
  gift: ['Gifts', '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8v13"/><path d="M12 8C10.5 4 7 3.5 7 6c0 2 3 2 5 2s5 0 5-2c0-2.5-3.5-2-5 2"/>'],
  cake: ['Birthday', '<path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16c1.5 0 2-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1"/><path d="M12 11V7M12 3.5v.01"/>'],
  pill: ['Medical', '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/>'],
  heart: ['Heart', '<path d="M12 20.5 4.2 12.8a4.8 4.8 0 0 1 7.8-5.6 4.8 4.8 0 0 1 7.8 5.6z"/>'],
  shield: ['Insurance', '<path d="M12 21s8-3.5 8-10V5l-8-3-8 3v6c0 6.5 8 10 8 10z"/>'],
  shirt: ['Clothes', '<path d="M8 3 3 6l2 4 2.5-1V21h9V9l2.5 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>'],
  bag: ['Shopping', '<path d="M5 7h14l-1 14H6z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'],
  sparkle: ['Self care', '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 16.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>'],
  scissors: ['Haircuts', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'],
  dumbbell: ['Fitness', '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'],
  ball: ['Sports', '<circle cx="12" cy="12" r="9"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9M3 12h18"/>'],
  book: ['School & books', '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/>'],
  plane: ['Travel', '<path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5v5l-2.5 2V22l4-1 4 1v-1.5l-2.5-2v-5z"/>'],
  tv: ['Streaming', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>'],
  game: ['Games', '<rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 13.5h.01"/>'],
  puzzle: ['Puzzles & toys', '<path d="M15.4 4.4a1 1 0 0 0 1.7-.5 2.5 2.5 0 1 1 3 3 1 1 0 0 0-.5 1.7l1.7 1.7a2.4 2.4 0 0 1 0 3.4l-1.7 1.7a1 1 0 0 1-1.7-.5 2.5 2.5 0 1 0-3 3 1 1 0 0 1 .5 1.7l-1.7 1.7a2.4 2.4 0 0 1-3.4 0l-1.7-1.7a1 1 0 0 0-1.7.5 2.5 2.5 0 1 1-3-3 1 1 0 0 0 .5-1.7l-1.7-1.7a2.4 2.4 0 0 1 0-3.4l1.7-1.7a1 1 0 0 1 1.7.5 2.5 2.5 0 1 0 3-3 1 1 0 0 1-.5-1.7l1.7-1.7a2.4 2.4 0 0 1 3.4 0z"/>'],
  music: ['Music', '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
  phone: ['Phone', '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>'],
  bolt: ['Utilities', '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/>'],
  wrench: ['Repairs', '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'],
  plant: ['Garden', '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 15c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5z"/>'],
  coin: ['Money', '<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.5-1-1.6-1.7-3-1.7-1.8 0-3 .9-3 2.2 0 3 6 1.5 6 4.5 0 1.3-1.3 2.3-3 2.3-1.5 0-2.7-.7-3.1-1.8M12 6v1.5M12 16.5V18"/>'],
  tag: ['Other', '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>'],
  star: ['Star', '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'],
  question: ['Not sorted', '<path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.2c-.9.4-1.5 1.2-1.5 2.1v.7"/><path d="M12 19h.01"/>'],
};
// First match wins, tested against "emoji name"
const CAT_ICON_MATCH = [
  ['utensils', /🍔|🍕|🍽|🍴|🌮|🍟|🥡|eat(ing)? ?out|restaurant|dining|takeout|take-out|fast food/iu],
  ['coffee', /☕|coffee|starbucks/iu],
  ['cart', /🛒|🍎|🥦|🥕|food|grocer/iu],
  ['puzzle', /🧩|🪀|puzzle|toy/iu],
  ['bottle', /👶|🍼|🧸|twin|bab(y|ies)|kid|child|diaper|daycare/iu],
  ['paw', /🐶|🐱|🐾|🐕|🐈|pet|dog|cat\b|vet/iu],
  ['balloon', /🎈|🎉|🎪|activit|fun|party|outing/iu],
  ['fuel', /⛽|\bgas\b|fuel/iu],
  ['car', /🚗|🚙|car\b|auto|transport|parking|toll/iu],
  ['cake', /🎂|🧁|birthday/iu],
  ['gift', /🎁|🎄|gift|christmas|holiday/iu],
  ['pill', /💊|🩺|🏥|🦷|medic|doctor|health|pharm|dental|copay/iu],
  ['heart', /❤|💕|🙏|⛪|giv(e|ing)|church|tithe|donat|charit/iu],
  ['shield', /🛡|insur/iu],
  ['shirt', /👕|👗|👚|👖|cloth/iu],
  ['bag', /🛍|shop|amazon|target/iu],
  ['scissors', /✂|💇|hair/iu],
  ['sparkle', /💅|✨|💄|beauty|self ?care|nail|makeup/iu],
  ['dumbbell', /🏋|💪|gym|fitness|workout/iu],
  ['ball', /⚽|🏀|⚾|🏈|sport/iu],
  ['book', /📚|📖|🎓|✏|book|school|educat|class/iu],
  ['plane', /✈|🏖|🧳|travel|vacation|trip/iu],
  ['tv', /📺|🎬|🍿|stream|movie|netflix|tv\b|subscri/iu],
  ['game', /🎮|🕹|game/iu],
  ['music', /🎵|🎶|🎸|music/iu],
  ['phone', /📱|phone/iu],
  ['bolt', /⚡|💡|util|electric|power/iu],
  ['wrench', /🔧|🛠|🔨|repair|mainten|tool/iu],
  ['plant', /🌱|🪴|🌿|🌷|garden|plant|yard|lawn/iu],
  ['coin', /💵|💰|💲|🐷|money|cash|saving/iu],
  ['house', /🏠|🏡|🏘|home|house/iu],
];
function catIconKey(c) {
  if (!c) return 'question';
  if (c.icon && CAT_ICONS[c.icon]) return c.icon;
  const s = `${c.emoji || ''} ${c.name || ''}`;
  const hit = CAT_ICON_MATCH.find(([, re]) => re.test(s));
  return hit ? hit[0] : 'tag';
}
const catIconSvg = (key, size) => `<svg class="ci" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${CAT_ICONS[key] ? CAT_ICONS[key][1] : CAT_ICONS.tag[1]}</svg>`;
// A category's symbol everywhere: its white line icon in a circle of its color,
// or — if they typed their own emoji (c.customEmoji) — just that emoji, no
// circle (the donut chart gives it a white circle of its own).
function catBadge(key, size = 28) {
  const c = catById(key);
  const dim = `width:${size}px;height:${size}px`;
  if (c && c.customEmoji) return `<span class="cat-badge emo" style="${dim};font-size:${Math.round(size * 0.78)}px">${esc(c.customEmoji)}</span>`;
  return `<span class="cat-badge" style="background:${catColor(key)};${dim}">${catIconSvg(catIconKey(c), Math.round(size * 0.58))}</span>`;
}
const catLabel = (c, size = 22) => `<span class="cat-lab">${catBadge(c.id, size)}<span>${esc(c.name)}</span></span>`;

// Category colors: a muted palette (styles.css --pie-N, softened in dark mode).
// A category uses the color picked in Settings (c.color = palette number), else
// one by its place in the list (first 10 colors). Uncategorized / old are grey.
const PIE_N = 10, PIE_ALL = 14;
function catColor(key) {
  const cats = H().categories || [];
  const i = cats.findIndex(c => c.id === key);
  if (i < 0) return 'var(--pie-none)';
  const pick = cats[i].color;
  return `var(--pie-${Number.isInteger(pick) && pick >= 0 && pick < PIE_ALL ? pick : i % PIE_N})`;
}

// Donut of this month's category spending. Big slices hold their white line
// icon inside; small ones get a thin line out to a colored dot with the icon.
// Tap a slice (or its dot) → the same category sheet as the rows below.
function donutHtml(items, total) {
  const R = 96, r = 60, mid = (R + r) / 2, LR = 128, gap = 0.035;
  const pt = (rad, a) => [rad * Math.sin(a), -rad * Math.cos(a)];
  const f = n => n.toFixed(2);
  const arc = (a0, a1) => {
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
    return `M${f(x0)} ${f(y0)}A${R} ${R} 0 ${big} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r} ${r} 0 ${big} 0 ${f(x3)} ${f(y3)}Z`;
  };
  const pos = (x, y) => `left:${f((x + 150) / 3)}%;top:${f((y + 150) / 3)}%`;
  const slices = items.filter(i => i.amt > 0.004);
  const sum = slices.reduce((a, i) => a + i.amt, 0);
  const center = sum > 0
    ? `<div class="donut-mid"><div class="donut-hole"><b>${money(total)}</b><span class="small muted">spent</span></div></div>`
    : `<div class="donut-mid"><div class="donut-hole"><span class="small muted">Nothing logged yet</span></div></div>`;
  if (!sum) return `<div class="donut"><svg viewBox="-150 -150 300 300" aria-hidden="true"><circle r="${mid}" fill="none" stroke="rgba(var(--ink-rgb), .1)" stroke-width="${R - r}"/></svg>${center}</div>`;
  let a = 0;
  const segs = slices.map(i => {
    const span = (i.amt / sum) * Math.PI * 2;
    const s = { ...i, a0: a, a1: a + span, m: a + span / 2, span, color: catColor(i.key) };
    a += span;
    return s;
  });
  const ceOf = s => { const c = catById(s.key); return c && c.customEmoji; };
  const iconOf = (s, size) => ceOf(s) ? `<span class="e">${esc(ceOf(s))}</span>` : catIconSvg(catIconKey(catById(s.key)), size);
  // Inside if the slice's arc at mid radius has room for an emoji
  segs.forEach(s => { s.inside = segs.length === 1 || s.span * mid >= 30; s.la = s.m; });
  // Spread outside dots apart so neighbors don't overlap
  const out = segs.filter(s => !s.inside);
  const minGap = 26 / LR;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let k = 1; k < out.length; k++) {
      const d = out[k].la - out[k - 1].la;
      if (d < minGap) { const push = (minGap - d) / 2; out[k - 1].la -= push; out[k].la += push; moved = true; }
    }
    if (out.length > 1) { // wrap-around: last vs first
      const d = out[0].la + Math.PI * 2 - out[out.length - 1].la;
      if (d < minGap) { const push = (minGap - d) / 2; out[0].la += push; out[out.length - 1].la -= push; moved = true; }
    }
    if (!moved) break;
  }
  const paths = segs.map(s => {
    const label = `${catById(s.key) ? catById(s.key).name : 'Uncategorized'}: ${money(s.amt)}`;
    const d = segs.length === 1
      ? `M0 ${-R}A${R} ${R} 0 1 1 0 ${R}A${R} ${R} 0 1 1 0 ${-R}ZM0 ${-r}A${r} ${r} 0 1 0 0 ${r}A${r} ${r} 0 1 0 0 ${-r}Z`
      : arc(s.a0 + Math.min(gap, s.span / 4) / 2, s.a1 - Math.min(gap, s.span / 4) / 2);
    const [dx, dy] = pt(5, s.m);
    return `<path class="slice" d="${d}" fill-rule="evenodd" style="fill:${s.color};--dx:${f(dx)}px;--dy:${f(dy)}px" data-act="bd-item" data-key="${esc(s.key)}" role="button" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title></path>`;
  }).join('');
  const lines = out.map(s => {
    const [x0, y0] = pt(R + 3, s.m), [x1, y1] = pt(LR - 11, s.la);
    return `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" style="stroke:${s.color}" stroke-width="1.5" stroke-linecap="round"/>`;
  }).join('');
  const labels = segs.map(s => {
    if (s.inside) { const [x, y] = pt(mid, s.m); return `<span class="donut-emo in ${ceOf(s) ? 'emo' : ''}" style="${pos(x, y)}">${iconOf(s, 22)}</span>`; }
    const [x, y] = pt(LR, s.la);
    return `<button class="donut-emo out ${ceOf(s) ? 'emo' : ''}" style="${pos(x, y)};${ceOf(s) ? `border-color:${s.color}` : `background:${s.color}`}" data-act="bd-item" data-key="${esc(s.key)}" aria-label="${esc(catById(s.key) ? catById(s.key).name : 'Uncategorized')}">${iconOf(s, 14)}</button>`;
  }).join('');
  return `<div class="donut"><svg viewBox="-150 -150 300 300">${lines}${paths}</svg>${labels}${center}</div>`;
}

function viewBreakdown() {
  const ym = S.bdYm || homeYm();
  setTimeout(() => ensureLoaded(ym).catch(e => console.warn('older purchases', e)), 0);
  const s = Calc.spent(S.purchases, ym);
  const tab = S.bdTab;
  let items;
  if (tab === 'cat') {
    items = (H().categories || []).map(c => ({ key: c.id, name: c.name, amt: s.cat[c.id] || 0 }));
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
  const counts = key => s.list.filter(p => (tab === 'cat' ? p.cat === key : tab === 'store' ? (p.store || '') === key : (p.tags || []).includes(key))).length;
  return `<header class="hero small-hero">${habitsOn() ? '<a class="back" href="#/habits">‹ Habits</a>' : ''}<h1>Breakdown</h1></header>
  <div class="psearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><input id="pq" type="search" placeholder="Search purchases" aria-label="Search purchases" value="${esc(S.pq || '')}" autocomplete="off" enterkeyhint="search"></div>
  <div id="pq-results">${S.pq ? searchResultsHtml(S.pq) : ''}</div>
  <div class="row between month-nav"><button class="nav" data-act="bd-m" data-d="-1" aria-label="Previous month">‹</button><h2>${D.name(ym)} ${D.yearOf(ym)}</h2><button class="nav" data-act="bd-m" data-d="1" aria-label="Next month">›</button></div>
  ${tab === 'cat' ? donutHtml(items, s.total) : ''}
  <section class="card">
    ${tab === 'cat' ? '' : `<div class="row between"><span class="label">Spent in ${D.name(ym)}</span><b class="big">${money(s.total)}</b></div>`}
    <div class="seg">${[['cat', 'Categories'], ['store', 'Stores'], ['tag', 'Tags']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="bd-tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${items.length ? items.map(i => `<button class="bd-row" data-act="bd-item" data-key="${esc(i.key)}">
        <span class="row between"><span class="cat-name">${tab === 'cat' ? catBadge(i.key) : ''}${esc(i.name)}${i.amt > 0 && s.total > 0 ? ` <span class="small muted pct">· ${Math.round((i.amt / s.total) * 100) || '<1'}%</span>` : ''}</span><b>${money(i.amt)}</b></span>
        <span class="small muted">${counts(i.key)} purchase${counts(i.key) === 1 ? '' : 's'} · see past months ›</span>
      </button>`).join('') : `<p class="muted">${tab === 'tag' ? 'No tagged purchases this month.' : 'Nothing logged this month.'}</p>`}
  </section>
  <section class="card"><h2>Every purchase</h2>${s.list.length ? s.list.map(p => purchaseRow(p)).join('') : '<p class="muted small">None yet.</p>'}</section>
  ${Store.configured ? '' : '<div class="card"><p class="small muted">Sample mode keeps everything in this browser. Once Firebase is connected, everyone in the household shares the same data.</p><button class="btn ghost small" data-act="demo-reset">Reset sample data</button></div>'}`;
}

// One item (a category, store or tag) over the last 12 months: a simple bar chart
// (single series in the month color, value label on the chosen month only,
// tap a bar for its amount) plus that month's purchases underneath.
function openItem(key) {
  const ym = S.bdYm || homeYm();
  const tab = S.bdTab;
  const c = tab === 'cat' ? catById(key) : null;
  const title = tab === 'cat' ? (c ? c.name : key === 'uncat' ? 'Uncategorized' : 'Old category') : (key || 'No store');
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
        : `<div class="field"><span class="label">Date</span>${datePicker('bk-date', D.today())}</div>`}</div>
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
      await ensureLoaded(D.curYm()).catch(() => {});
      sortRefunds(res.rows);
      for (const r of res.rows) r.firstNeeds =r.status === 'review' && (!r.cat || r.ask || r.venmo || (r.payCandidate && r.reason.endsWith('?')));
      if (H().trackMode === 'both') matchLogged(res.rows);
      S.imp = { name: file.name, rows: res.rows, from: res.from, through: res.through, gap, showSkipped: false };
      location.hash = '#/import';
    } catch (e) { console.error(e); toast(e.message || 'Couldn’t read that file'); }
  };
  f.click();
}

// Bank name vs. a store name: same letters, or a 4+ letter word of the store inside it.
const letters = x => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
function sameStore(store, bankName) {
  const bank = letters(bankName);
  const whole = letters(store);
  if (whole.length >= 4 && bank.includes(whole)) return true;
  return String(store || '').toLowerCase().split(/[^a-z]+/).some(w => w.length >= 4 && bank.includes(w));
}

// Money back from the bank: a refund from a store you've bought from goes back to
// that purchase's category; anything else is Additional income (you can change it).
function sortRefunds(rows) {
  const ids = new Set(H().categories.map(c => c.id));
  const past = S.purchases.filter(p => (Number(p.amount) || 0) > 0 && ids.has(p.cat)).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const r of rows) {
    if (r.kind !== 'refund' || r.status !== 'review' || r.venmo || r.reason.startsWith('From your rule')) continue;
    const hit = past.find(p => p.date <= r.date && sameStore(p.store, r.name))
      || rows.find(x => x !== r && x.kind === 'buy' && x.cat && ids.has(x.cat) && x.ruleKey === r.ruleKey);
    r.ask = false;
    if (hit) {
      r.cat = hit.cat;
      r.reason = `Refund — back to ${catById(hit.cat).name} (last bought there ${D.niceDay(hit.date)})`;
    } else {
      r.cat = 'income';
      r.tags = [];
      r.reason = 'Money in — added to Additional income';
    }
  }
}

// "Both" mode: bank rows that are purchases already logged by hand. Same amount within
// a few days = already logged (it just gets marked bank-confirmed). Same store but a
// different amount (a tip, a pending charge that changed) = asks to update the log.
// Each logged purchase matches at most one bank row.
function matchLogged(rows) {
  const day = d => new Date(`${d}T12:00`).getTime() / 864e5;
  const logs = [];
  const groups = {};
  for (const x of S.purchases.filter(x => x.src !== 'import' && !x.bankConfirmed)) {
    if (!x.splitGroup) { logs.push(x); continue; }
    const g = groups[x.splitGroup] = groups[x.splitGroup] || { id: `g:${x.splitGroup}`, group: x.splitGroup, amount: 0, store: x.store, date: x.date, cat: x.cat };
    g.amount = round2(g.amount + (Number(x.amount) || 0));
  }
  logs.push(...Object.values(groups)); // a split receipt matches the bank charge as a whole
  const used = new Set();
  const taken = new Set();
  const cands = rows.filter(r => r.status === 'review' && !r.payCandidate && !r.billAsk && r.amount);
  const near = (r, x) => { const g = day(r.date) - day(x.date); return g >= -2 && g <= 5; };
  const exact = (r, x) => !used.has(x.id) && !taken.has(r) && Math.abs((Number(x.amount) || 0) - r.amount) < 0.005 && near(r, x);
  const pair = (r, x) => {
    used.add(x.id); taken.add(r);
    Object.assign(r, { status: 'logged', matchId: x.id, reason: `Already logged: ${loggedName(x)} ${money(x.amount)} on ${D.niceDay(x.date)}` });
  };
  // Same day, same amount: a sure match.
  for (const r of cands) { const x = logs.find(x => exact(r, x) && day(r.date) === day(x.date)); if (x) pair(r, x); }
  // A few days apart: only when there's just one way to pair them up, and it's
  // not a place with other same-amount charges in the file (the visit you logged
  // may not have reached the bank yet, and this is an earlier one).
  const repeat = r => rows.some(y => y !== r && Math.abs(y.amount - r.amount) < 0.005 && y.name === r.name);
  for (const x of logs) {
    const rs = cands.filter(r => exact(r, x));
    if (rs.length === 1 && !repeat(rs[0]) && logs.filter(y => exact(rs[0], y)).length === 1) pair(rs[0], x);
  }
  // More than one way (a place you go often): ask which one it is.
  for (const r of cands) {
    const xs = logs.filter(x => exact(r, x));
    if (xs.length) Object.assign(r, { which: xs.map(x => ({ id: x.id, name: loggedName(x), amount: Number(x.amount), date: x.date })), pick: '', firstNeeds: true });
  }
  // Same store, different amount (a tip, a changed charge): closest dates pair first.
  const close = [];
  for (const r of cands) {
    if (taken.has(r) || r.which) continue;
    for (const x of logs) {
      if (used.has(x.id) || x.group || !near(r, x) || Math.sign(Number(x.amount) || 0) !== Math.sign(r.amount) || !sameStore(x.store, r.name)) continue;
      if (Math.abs((Number(x.amount) || 0) - r.amount) > Math.max(5, Math.abs(r.amount) * 0.3)) continue;
      close.push({ r, x, gap: Math.abs(day(r.date) - day(x.date)) });
    }
  }
  for (const { r, x } of close.sort((a, b) => a.gap - b.gap)) {
    if (used.has(x.id) || taken.has(r)) continue;
    used.add(x.id); taken.add(r);
    Object.assign(r, { close: { id: x.id, amount: Number(x.amount), store: x.store || r.name, date: x.date }, closeSame: true, firstNeeds: true });
  }
}
const loggedName = x => x.store || (catById(x.cat) || {}).name || 'purchase';

const catOptions = (sel, withSkip, withIncome) => `<option value="" ${!sel ? 'selected' : ''}>Pick a category…</option>`
  + (withIncome ? `<option value="income" ${sel === 'income' ? 'selected' : ''}>Additional income (not a refund)</option>` : '')
  + H().categories.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc((c.customEmoji ? c.customEmoji + ' ' : '') + c.name)}</option>`).join('')
  + `<option value="uncat" ${sel === 'uncat' ? 'selected' : ''}>Uncategorized (decide later)</option>`
  + (withSkip ? `<option value="skip" ${sel === 'skip' ? 'selected' : ''}>Skip — don’t count it</option>` : '');

// Splitting an imported charge: the last split you haven't typed in takes whatever's left.
function splitFill(r) {
  const free = r.splits.map((sp, j) => j).filter(j => !r.splits[j].touched);
  if (!free.length) return null;
  const j = free[free.length - 1];
  const others = r.splits.reduce((a, sp, k) => a + (k === j ? 0 : Number(sp.amount) || 0), 0);
  r.splits[j].amount = Math.max(0, round2(r.amount - others));
  return j;
}
function splitSumHtml(r) {
  const left = round2(r.amount - r.splits.reduce((a, x) => a + (Number(x.amount) || 0), 0));
  const txt = Math.abs(left) < 0.005 ? `✓ Adds up to ${money(r.amount)}` : left > 0 ? `${money(left)} left to split` : `Over by ${money(-left)}`;
  return `<b id="split-sum-${r.i}" class="${Math.abs(left) < 0.005 ? 'save-good' : 'warn'}">${txt}</b>`;
}

// "Always…" checkbox: remember this store's category and/or tags for next time.
// Starts unchecked, so one-off purchases (Amazon, Target…) don't make a rule.
function rememberHtml(r) {
  if (r.venmo || r.splits || r.cat === 'income') return '';
  if (r.cat === 'skip') return `<label class="small remember"><input type="checkbox" data-ch="imp-remember" data-i="${r.i}" ${r.remember ? 'checked' : ''}> Always skip ${esc(r.name)}</label>`;
  const cat = r.cat && !['skip', 'uncat'].includes(r.cat) ? catById(r.cat) : null;
  if (!cat && !r.tags.length) return '';
  const tags = r.tags.map(esc).join(', ');
  const label = cat && tags ? `Always put ${esc(r.name)} in ${esc(cat.name)} and tag it ${tags}`
    : cat ? `Always put ${esc(r.name)} in ${esc(cat.name)}` : `Always tag ${esc(r.name)} ${tags}`;
  return `<label class="small remember"><input type="checkbox" data-ch="imp-remember" data-i="${r.i}" ${r.remember ? 'checked' : ''}> ${label}</label>`;
}

function impRow(r) {
  if (r.status === 'logged') {
    return `<div class="imp-row logged"><div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${money(r.amount)}</b></div>
      <div class="small muted">✓ ${esc(r.reason)} · <button class="linkish small" data-act="imp-unmatch" data-i="${r.i}">it’s different — add it</button></div></div>`;
  }
  if (r.close && r.closeSame) {
    return `<div class="imp-row needs"><div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${money(r.amount)}</b></div>
      <div class="small muted">Same as your logged ${esc(r.close.store)} ${money(r.close.amount)} on ${D.niceDay(r.close.date)}?</div>
      <div class="imp-ctl"><button class="btn small" disabled>✓ Update it to ${money(r.amount)}</button><button class="btn ghost small" data-act="imp-close" data-i="${r.i}">No, it’s different</button></div></div>`;
  }
  if (r.which && r.pick !== 'new') {
    const others = new Set(S.imp.rows.filter(y => y !== r && y.pick).map(y => y.pick));
    const opts = r.which.filter(x => !others.has(x.id));
    return `<div class="imp-row ${!r.pick ? 'needs' : ''}">
      <div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${money(r.amount)}</b></div>
      <div class="small muted">${opts.length > 1 ? 'Close to a few purchases you logged — is it one of them?' : 'Close to a purchase you logged — is it the same one?'}</div>
      <div class="imp-ctl"><select data-ch="imp-which" data-i="${r.i}" aria-label="Is this one you logged?"><option value="" ${!r.pick ? 'selected' : ''}>Is this one you logged?</option>${opts.map(x => `<option value="${esc(x.id)}" ${r.pick === x.id ? 'selected' : ''}>Yes — ${esc(x.name)} ${money(x.amount)} on ${D.niceDay(x.date)}</option>`).join('')}<option value="new">No — it’s a new purchase</option></select></div>
    </div>`;
  }
  if (r.billAsk) {
    const bills = H().bills || [];
    const guess = bills.find(b => b.id === r.billGuess);
    const ordered = guess ? [guess, ...bills.filter(b => b !== guess)] : bills;
    const picked = r.cat && r.cat.startsWith('bill:') ? bills.find(b => `bill:${b.id}` === r.cat) : null;
    return `<div class="imp-row ${!r.cat ? 'needs' : ''} ${r.cat === 'skip' ? 'skipped' : ''}">
      <div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${money(r.amount)}</b></div>
      <div class="small muted">${esc(r.reason)}</div>
      <div class="imp-ctl"><select data-ch="imp-cat" data-i="${r.i}" aria-label="Which bill?"><option value="" ${!r.cat ? 'selected' : ''}>${guess ? 'Is it?' : 'Which bill?'}</option>${ordered.map(b => `<option value="bill:${esc(b.id)}" ${r.cat === `bill:${b.id}` ? 'selected' : ''}>${b === guess ? `Yes — ${esc(b.name)}` : esc(b.name)}</option>`).join('')}<option value="skip" ${r.cat === 'skip' ? 'selected' : ''}>${guess ? 'No — not a bill, skip it' : 'Not a bill — skip it'}</option></select></div>
      ${r.cat ? `<label class="small remember"><input type="checkbox" data-ch="imp-remember" data-i="${r.i}" ${r.remember ? 'checked' : ''}> ${picked ? `Always match ${esc(r.name)} to ${esc(picked.name)}` : `Always skip ${esc(r.name)}`}</label>` : ''}
    </div>`;
  }
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
  const split = r.splits ? `<div class="splits">${r.splits.map((sp, j) => `<div class="edit-row"><input class="mini" data-ch="imp-split-amt" data-i="${r.i}" data-j="${j}" inputmode="decimal" value="${sp.amount}"><select data-ch="imp-split-cat" data-i="${r.i}" data-j="${j}">${catOptions(sp.cat)}</select><select class="split-tag" data-ch="imp-split-tag" data-i="${r.i}" data-j="${j}" aria-label="Tag"><option value="">Tag</option>${(H().tags || []).map(t => `<option ${sp.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__new">+ New tag…</option></select>${j ? `<button class="x small" data-act="imp-split-del" data-i="${r.i}" data-j="${j}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
      <div class="small">${splitSumHtml(r)} · <button class="linkish small" data-act="imp-split-add" data-i="${r.i}">+ another</button> · <button class="linkish small" data-act="imp-split-off" data-i="${r.i}">undo split</button></div></div>` : '';
  return `<div class="imp-row ${needs ? 'needs' : ''} ${r.cat === 'skip' ? 'skipped' : ''}">
    <div class="row between"><span class="grow"><b>${esc(r.name)}</b> <span class="small muted">${D.niceDay(r.date)}</span></span><b>${r.amount < 0 ? '−' : ''}${money(Math.abs(r.amount))}${r.amount < 0 ? ' <span class="small muted">back</span>' : ''}</b></div>
    <div class="small muted">${esc(r.reason)}${r.which ? ` · new, not one you logged · <button class="linkish small" data-act="imp-which-undo" data-i="${r.i}">undo</button>` : ''}</div>
    ${r.splits ? split : `<div class="imp-ctl"><select data-ch="imp-cat" data-i="${r.i}" aria-label="Category">${catOptions(r.cat, true, r.amount < 0)}</select>
      ${r.cat !== 'skip' && r.cat !== 'income' ? `<select data-ch="imp-tag" data-i="${r.i}" aria-label="Add a tag"><option value="">+ Tag</option>${(H().tags || []).filter(t => !r.tags.includes(t)).map(t => `<option>${esc(t)}</option>`).join('')}<option value="__new">+ New tag…</option></select>
      ${r.amount > 0 ? `<button class="btn ghost small" data-act="imp-split" data-i="${r.i}">Split</button>` : ''}` : ''}</div>`}
    ${tagChips ? `<div class="tags">${tagChips}</div>` : ''}
    ${rememberHtml(r)}
  </div>`;
}

function viewImport() {
  const I = S.imp;
  if (!I) return `<header class="hero small-hero"><a class="back" href="#/home">‹ Home</a><h1>Import</h1></header>
    <section class="card"><p>Download your joint checking transactions from Navy Federal as a <b>CSV</b> (any date range — overlaps are fine), then pick the file.</p>
    <button class="btn full" data-act="import-file">Choose file</button></section>`;
  const logged = I.rows.filter(r => r.status === 'logged');
  const live = I.rows.filter(r => r.status !== 'dup' && r.status !== 'logged');
  const dups = I.rows.length - live.length - logged.length;
  const review = live.filter(r => r.status === 'review');
  const skipped = live.filter(r => r.status === 'skip');
  const first = review.filter(r => r.firstNeeds);
  const rest = review.filter(r => !r.firstNeeds);
  const asking = r => r.which && r.pick !== 'new';
  const open = review.filter(r => asking(r) && !r.pick).length + review.filter(r => !asking(r) && !r.cat && !r.splits && !r.payCandidate && !r.billAsk).length + review.filter(r => r.billAsk && !r.cat).length + review.filter(r => r.payCandidate && !r.cat).length;
  return `<header class="hero small-hero"><a class="back" href="#/home" data-act="imp-cancel">‹ Cancel</a><h1>Import</h1></header>
  <section class="card">
    <div class="line"><span><b>${D.niceDay(I.from)} – ${D.niceDay(I.through)}</b></span><span class="small muted">${esc(I.name)}</span></div>
    <p class="small muted">${review.length} to review${logged.length ? ` · ${logged.length} already logged` : ''} · ${skipped.length} skipped (bills & transfers)${dups ? ` · ${dups} already imported` : ''}</p>
    ${I.gap ? `<p class="msg small">${esc(I.gap)}</p>` : ''}
  </section>
  <section class="card">
    <label class="field"><span class="label">Checking balance right now <span class="small muted">(optional)</span></span>
      <span class="amount move-amt"><span>$</span><input data-ch="imp-bal" inputmode="decimal" value="${esc(I.bal || '')}"></span></label>
    <p class="small muted">Fill this in and Checking on Overview is set to it when you save. Leave it blank to keep the app’s estimate.</p>
  </section>
  ${logged.length ? `<button class="linkish small add-link" data-act="imp-logged">${I.showLogged ? 'Hide' : 'Show'} ${logged.length} already logged ✓</button>${I.showLogged ? logged.map(impRow).join('') : ''}` : ''}
  ${first.length ? `<h2 class="section-title">Needs a look <span class="small muted">${open} left</span></h2>${first.map(impRow).join('')}` : ''}
  ${rest.length ? `<h2 class="section-title">Ready</h2>${rest.map(impRow).join('')}` : ''}
  ${!review.length ? '<p class="muted center">Nothing new to add from this file.</p>' : ''}
  ${skipped.length ? `<button class="linkish small add-link" data-act="imp-skipped">${I.showSkipped ? 'Hide' : 'Show'} ${skipped.length} skipped</button>${I.showSkipped ? skipped.map(impRow).join('') : ''}` : ''}
  ${open ? `<p class="small muted center">${open} without a category will go to Uncategorized (Venmo and unanswered deposits and payments are skipped).</p>` : ''}
  <div class="import-save">
    <button class="btn full" data-act="imp-save">Save ${live.reduce((n, r) => n + (r.payCandidate || r.billAsk || r.cat === 'income' || (r.which && r.pick !== 'new') || (r.close && r.closeSame) || r.cat === 'skip' || (r.venmo && !r.cat && !r.splits) ? 0 : r.splits ? r.splits.filter(x => Number(x.amount)).length : 1), 0)} purchases${live.some(r => r.close && r.closeSame) ? ` + update ${live.filter(r => r.close && r.closeSame).length}` : ''}${live.some(r => r.payCandidate && r.cat === 'pay') ? ` + ${live.filter(r => r.payCandidate && r.cat === 'pay').length} paycheck${live.filter(r => r.payCandidate && r.cat === 'pay').length === 1 ? '' : 's'}` : ''}${live.some(r => r.cat === 'income') ? ` + ${live.filter(r => r.cat === 'income').length} money in` : ''}</button>
  </div>`;
}

async function saveImport() {
  const I = S.imp;
  if (I.rows.some(r => r.status !== 'dup' && r.which && !r.pick)) { toast('Answer “Is this one you logged?” first'); return; }
  const now = Date.now();
  const purchases = [];
  const keysByMonth = {};
  const rules = { ...(H().rules || {}) };
  const pays = [];
  const incomes = [];
  let latest = (H().imports || {}).through || '';
  const confirm = [];
  for (const r of I.rows) {
    if (r.status === 'dup') continue;
    const ym = D.ymOf(r.date);
    (keysByMonth[ym] = keysByMonth[ym] || []).push(r.key);
    if (r.post && r.post > latest) latest = r.post;
    // Already logged by hand: mark it bank-confirmed (and fix the amount if it changed).
    const picked = r.which && r.pick !== 'new' ? r.pick : null;
    if (r.status === 'logged' || (r.close && r.closeSame) || picked) {
      const id = r.matchId || picked || r.close.id;
      const hits = String(id).startsWith('g:') ? S.purchases.filter(x => `g:${x.splitGroup}` === id) : S.purchases.filter(x => x.id === id);
      for (const p of hits) { const { part, ...rest } = p; confirm.push({ ...rest, bankConfirmed: true, ...(r.close ? { amount: r.amount } : {}) }); }
      continue;
    }
    if (r.billAsk) {
      // Picked a bill: it's paid (the bill section below checks it off at the real amount).
      r.billId = r.cat && r.cat.startsWith('bill:') ? r.cat.slice(5) : null;
      r.charged = r.amount;
      if (r.remember && r.billId) rules[r.ruleKey] = { action: 'bill', billId: r.billId, name: r.name };
      else if (r.remember && r.cat === 'skip') rules[r.ruleKey] = { action: 'skip', name: r.name };
      continue;
    }
    if (r.payCandidate) {
      if (r.remember && r.cat) rules[r.ruleKey] = { action: r.cat === 'pay' ? 'pay' : 'skip', name: r.name };
      if (r.cat === 'pay') pays.push(r);
      continue;
    }
    if (r.cat === 'income') { incomes.push(r); continue; }
    if (r.cat === 'skip' || (r.venmo && !r.cat && !r.splits)) {
      if (r.remember && r.cat === 'skip' && !r.ask) rules[r.ruleKey] = { action: 'skip', name: r.name };
      continue;
    }
    const base = {
      store: r.name, note: '', date: r.date, spread: 1, by: 'import', byName: 'Bank', src: 'import',
      key: r.key, t: Math.min(now, new Date(`${r.post || r.date}T12:00`).getTime()), until: D.ymOf(r.date),
    };
    if (r.splits) {
      r.splits.forEach((sp, j) => { const a = Number(sp.amount) || 0; if (a) purchases.push({ ...base, key: `${r.key}:${j}`, amount: a, cat: sp.cat || 'uncat', tags: [...new Set([...r.tags, ...(sp.tag ? [sp.tag] : [])])] }); });
    } else {
      purchases.push({ ...base, amount: r.amount, cat: r.cat || 'uncat', tags: [...r.tags] });
    }
    if (r.remember && !r.venmo && !r.splits) {
      if (r.cat && r.cat !== 'uncat') rules[r.ruleKey] = { action: 'cat', cat: r.cat, tags: [...r.tags], name: r.name };
      else if (r.tags.length) rules[r.ruleKey] = { action: 'ask', tags: [...r.tags], name: r.name };
    }
  }
  if (purchases.length) await B.savePurchases(purchases);
  for (const p of confirm) await B.savePurchase(p);
  // Bills that came through at a different amount: use the real charge for that month.
  const billHits = {};
  const billPosted = {};
  for (const r of I.rows) {
    if (r.status === 'dup' || !r.billId) continue;
    const k = `${D.ymOf(r.date)}|${r.billId}`;
    billHits[k] = round2((billHits[k] || 0) + (Number(r.charged) || 0));
    billPosted[k] = Math.max(billPosted[k] || 0, Math.min(now, new Date(`${r.post || r.date}T12:00`).getTime()));
  }
  // The bank shows it charged: it's paid (as of when it posted), even if its due date hasn't come yet.
  for (const k in billPosted) { const [ym, id] = k.split('|'); await B.setMonthField(ym, ['bills', id], { posted: true, at: billPosted[k] }); }
  for (const k in billHits) {
    const [ym, id] = k.split('|');
    const b = (H().bills || []).find(x => x.id === id);
    if (!b) continue;
    // Shared bills: the charge includes everyone's share; this month's amount is just ours.
    const ours = round2(billHits[k] - Calc.heldFor(S.months[ym], id).reduce((t, h) => t + (Number(h.amount) || 0), 0));
    if (Math.abs(ours - Calc.billNormal(b, ym)) > 0.004) await B.setMonthField(ym, ['billAmt', id], ours);
  }
  // Each paycheck checks off the next one expected that month, with its real
  // amount (overtime and all); if they've all arrived, it's added to the list.
  const byMonth = {};
  for (const r of pays.sort((a, b) => (a.date < b.date ? -1 : 1))) (byMonth[D.ymOf(r.date)] = byMonth[D.ymOf(r.date)] || []).push(r);
  for (const ym in byMonth) {
    const list = [...((S.months[ym] || {}).incoming || [])].map(x => ({ ...x }));
    for (const r of byMonth[ym]) {
      const at = Math.min(now, new Date(`${r.post || r.date}T12:00`).getTime());
      const slot = list.find(x => !x.received);
      if (slot) Object.assign(slot, { amount: r.amount, received: true, receivedAt: at, fromImport: true });
      else list.push({ id: newId(), name: `Paycheck ${list.length + 1}`, amount: r.amount, received: true, receivedAt: at, fromImport: true });
    }
    await B.setMonthField(ym, ['incoming'], list);
    await syncPayPlan(list, ym);
  }
  // Money in that isn't a refund: that month's Additional income, already received.
  const inByMonth = {};
  for (const r of incomes) (inByMonth[D.ymOf(r.date)] = inByMonth[D.ymOf(r.date)] || []).push(r);
  for (const ym in inByMonth) {
    const list = [...((S.months[ym] || {}).back || [])];
    for (const r of inByMonth[ym]) {
      list.push({ id: newId(), name: r.name, amount: Math.abs(r.amount), received: true, receivedAt: Math.min(now, new Date(`${r.post || r.date}T12:00`).getTime()), fromImport: true });
    }
    await B.setMonthField(ym, ['back'], list);
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
  toast(`Imported ${purchases.length} purchase${purchases.length === 1 ? '' : 's'}${pays.length ? ` · ${pays.length} paycheck${pays.length === 1 ? '' : 's'}` : ''}${incomes.length ? ` · ${incomes.length} money in` : ''}${bal !== null ? ` · checking set to ${money(bal)}` : ''}`);
}

/* ---------- Month setup (the Checklist, step by step) ---------- */

const STEPS = ['Look back', 'Checking', 'Bills & extras', 'Budgets', 'Paychecks', 'Savings'];

// Two parts: "Plan" (last week of the month: bills & extras, budgets, paychecks —
// nothing changes about the current month) and "Start" (evening of the last day or
// later: look back, checking balance, last month's open items, what moves to savings).
// Starting a month that was never planned includes the planning steps too.
function startDraft(mode = 'start') {
  const N = nextSetupYm();
  const R = D.addMonths(N, -1);
  const MN = S.months[N];
  const MR = S.months[R] || {};
  const plan = (H().plans || {})[N] || {};
  const d = { ym: N, step: 0, checking: '', mode };
  // Last month's unfinished items only come in when the month actually starts.
  const carriedOther = () => (mode === 'start' ? (MR.other || []).filter(o => !o.paid).map(o => ({ ...o, id: newId(), carried: true })) : []);
  const carriedBack = () => (mode === 'start' ? (MR.back || []).filter(b => !b.received).map(b => ({ ...b, carried: true })) : []);
  if (MN && MN.planned && !MN.setup) {
    d.planned = true;
    d.other = carriedOther().concat((MN.other || []).map(o => ({ ...o })));
    d.back = carriedBack().concat((MN.back || []).map(o => ({ ...o })));
    d.held = (MN.held || []).map(o => ({ ...o }));
    d.budgets = { ...(MN.budgets || {}) };
  } else if (MN && MN.setup) {
    d.redo = true;
    d.other = (MN.other || []).map(o => ({ ...o }));
    d.back = (MN.back || []).map(o => ({ ...o }));
    d.held = (MN.held || []).map(o => ({ ...o }));
    d.budgets = { ...(MN.budgets || {}) };
    d.pre = Object.fromEntries(Object.entries(MN.bills || {}).filter(([, v]) => v && v.pre).map(([k]) => [k, true]));
  } else {
    d.other = carriedOther().concat((plan.other || []).map(o => ({ id: newId(), name: o.name, amount: o.amount, paid: false })));
    d.back = carriedBack();
    for (const x of Calc.extras(plan)) if (Number(x.amount) > 0) d.back.push({ id: newId(), name: x.name, amount: Number(x.amount), received: false });
    d.held = (H().helpers || []).map(h => ({ ...h, received: false }));
    d.budgets = {};
  }
  for (const c of H().categories) if (d.budgets[c.id] === undefined) d.budgets[c.id] = Calc.budgetFor(H(), null, c, N);
  // Starts from the Year tab: the month's own amount, else the usual income.
  d.pay = Object.fromEntries(Calc.earners(H()).map(e => [e.id, plan[e.id] ?? Calc.usualFor(H(), e.id, N) ?? '']));
  // Paid every two weeks into checking: start with two paychecks splitting the
  // planned (or usual) amount; amounts are editable and a third can be added.
  if (payInChecking()) {
    const e = Calc.earners(H())[0];
    const monthly = Number(plan[e.id]) || Number(Calc.usualFor(H(), e.id, N)) || 0;
    const half = round2(monthly / 2);
    d.incoming = MN && (MN.setup || MN.planned) && MN.incoming ? MN.incoming.map(x => ({ ...x }))
      : [{ id: newId(), name: 'Paycheck 1', amount: half, received: false }, { id: newId(), name: 'Paycheck 2', amount: round2(monthly - half), received: false }];
  }
  d.seq = mode === 'plan' ? [2, 3, 4] : d.planned ? [0, 1, 2, 5] : [0, 1, 2, 3, 4, 5];
  d.pos = 0;
  d.step = d.seq[0];
  S.draft = d;
}

// Left blank in setup = use the app's current checking estimate.
function estChecking() { const cur = homeYm(); return Calc.checklist(H(), S.months[cur], cur, S.purchases).est; }

function draftMonth(d) {
  return {
    setup: true, budgets: d.budgets, checking: { amount: num(d.checking) !== null ? num(d.checking) : estChecking(), at: Date.now() }, bills: preBills(d.pre || {}, d.ym),
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
  const mode = location.hash.split('/')[2] === 'plan' ? 'plan' : 'start';
  if (!S.draft || S.draft.mode !== mode) startDraft(mode);
  const d = S.draft;
  const N = d.ym;
  const R = D.addMonths(N, -1);
  const steps = `<div class="steps">${d.seq.map((s, i) => `<span class="${i === d.pos ? 'on' : i < d.pos ? 'done' : ''}"></span>`).join('')}</div>`;
  let body = '';
  if (d.step === 0) {
    const c = Calc.checklist(H(), S.months[R], R, S.purchases);
    const any = c.spent.list.length;
    const under = c.cats.filter(x => !x.over && x.used > 0);
    body = `<h2>How did ${D.name(R)} go?</h2>
      ${any ? c.cats.map(x => `<div class="line ${x.over ? 'over-line' : ''}"><span>${catLabel(x)} ${x.over ? `<span class="small over-txt">${calm() ? 'over by' : 'over'} ${money(x.used - x.budget)}</span>` : x.used > 0 ? `<span class="small good">${money(x.left)} under 🎉</span>` : ''}</span><b>${money(x.used)} <span class="small muted">/ ${money(x.budget)}</span></b></div>`).join('')
        + `<p class="small muted">${c.cats.some(x => x.over) ? (calm() ? 'Anything over is just information — maybe that budget needs a little more room, or it was a one-off month.' : 'Categories over budget are highlighted.') : 'Everything stayed within budget. Nice work.'} <a href="#/breakdown" data-act="bd-go" data-ym="${R}">See the breakdown ›</a></p>`
        : `<p class="muted">Nothing was logged in the app for ${D.name(R)} — that’s fine, this is a fresh start.</p>`}
      `;
    if (under.length && calm() && !d.celebrated) { d.celebrated = true; setTimeout(confetti, 400); }
  } else if (d.step === 1) {
    const cur = homeYm();
    const est = Calc.checklist(H(), S.months[cur], cur, S.purchases).est;
    body = `<h2>Checking balance</h2><p class="muted">What does joint checking show right now?</p>
      <label class="amount"><span>$</span><input id="d-checking" inputmode="decimal" placeholder="${est}" value="${esc(d.checking)}"></label>
      <p class="small muted">The app’s estimate is ${money(est)}.</p>
      ${(H().bills || []).some(b => D.dueTime(N, b.day) > Date.now()) ? `<h3>${D.name(N)} bills</h3><p class="small muted">Any already taken out of that balance (drafted early)? Tap “already came out” so they aren’t counted twice.</p>
        ${(H().bills || []).filter(b => D.dueTime(N, b.day) > Date.now()).map(b => preBillRow(b, N, (d.pre || {})[b.id], 'd-pre')).join('')}` : ''}`;
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
      <h3>Automatic payments</h3>${bills}<p class="small muted">${d.mode === 'plan' ? 'Change bills in Settings.' : 'Check off shared payments that are already in. Change bills in Settings.'}</p>
      <h3>Other expenses</h3><p class="small muted">One-time things this month.${d.mode === 'plan' ? ` Anything still open from ${D.name(R)} gets added when you start ${D.name(N)}.` : ' Check any that are already paid.'}</p>${rows('other', 'paid')}${add('other')}
      <h3>Additional income</h3><p class="small muted">Refunds or extra money you’re expecting this month.</p>${rows('back', 'received')}${add('back')}`;
  } else if (d.step === 3) {
    body = `<h2>Budgets for ${D.name(N)}</h2><p class="muted">Start from your normal amounts. Trim any this month if things are tight — next month goes back to normal.</p>
      ${H().categories.map(c => `<div class="line"><span>${catLabel(c)} <span class="small muted">normally ${money(c.budget)}</span></span><input class="mini" id="d-b-${esc(c.id)}" inputmode="decimal" value="${esc(d.budgets[c.id])}"></div>`).join('')}
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
  const last = d.pos === d.seq.length - 1;
  return `<header class="hero small-hero"><h1>${d.mode === 'plan' ? 'Plan' : 'Start'} ${D.name(N)}</h1>${d.redo ? '<div class="hero-sub">Already started — this will redo it</div>' : d.mode === 'plan' ? `<div class="hero-sub">Nothing changes in ${D.name(R)} until you start ${D.name(N)}</div>` : ''}</header>
    ${steps}<section class="card setup">${body}</section>
    <div class="row between">${d.pos > 0 ? '<button class="btn ghost" data-act="d-back">Back</button>' : '<a class="btn ghost" href="#/home" data-act="d-cancel">Cancel</a>'}
      ${!last ? `<button class="btn" data-act="d-next">Next: ${STEPS[d.seq[d.pos + 1]]}</button>` : d.mode === 'plan' ? '<button class="btn" data-act="d-plan-save">Save plan</button>' : ''}</div>
    ${last && d.mode === 'plan' ? `<p class="center"><button class="linkish small" data-act="d-plan-start">Save & start ${D.name(N)} now</button></p><p class="small muted center">Starting now ends ${D.name(R)} early — new purchases count toward ${D.name(N)}.</p>` : ''}`;
}

// A bill not due yet that already came out of checking (drafted early, or set up the night
// before): marked so it's neither "still to come" nor subtracted again on its due date.
function preBillRow(b, ym, on, act) {
  const due = D.dueTime(ym, b.day) <= Date.now();
  return `<div class="line pre-bill"><span>${D.ordinal(b.day)} · ${esc(b.name)}${due ? ' <span class="small muted">already out</span>' : ''}</span><span class="row gap">${due ? '' : `<button class="share ${on ? 'on' : ''}" data-act="${act}" data-id="${esc(b.id)}" aria-pressed="${!!on}">${on ? '✓' : '○'} already came out</button>`}<b>${money(Calc.billAmount(b, ym))}</b></span></div>`;
}
const preBills = (pre, ym) => Object.fromEntries((H().bills || []).filter(b => pre[b.id] && D.dueTime(ym, b.day) > Date.now()).map(b => [b.id, { pre: true }]));

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

// Save the plan for next month without starting it (the current month carries on as is).
async function savePlanned(startNow) {
  readDraftInputs();
  const d = S.draft;
  const N = d.ym;
  const data = {
    planned: true, plannedAt: Date.now(), budgets: d.budgets,
    other: d.other.filter(o => !o.carried), back: d.back.filter(o => !o.carried), held: d.held,
    ...(d.incoming ? { incoming: d.incoming } : {}),
  };
  await B.setMonth(N, data);
  S.months[N] = { ...(S.months[N] || {}), ...data }; // so "start now" picks up the plan right away
  const nv = x => (num(x) === null ? B.DEL : num(x));
  await B.setH(Calc.earners(H()).map(e => [['plans', N, e.id], nv(d.pay[e.id])]));
  S.draft = null;
  if (startNow) { location.hash = '#/setup/start'; return; }
  location.hash = '#/home';
  toast(`${D.name(N)} is planned — you’ll start it the evening of ${D.name(D.addMonths(N, -1))} ${D.daysIn(D.addMonths(N, -1))}`);
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
    M.movedAt = M.checking.at + 1;
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
  await B.setMonthField(N, ['bills'], M.bills);
  await B.setH(pairs);
  if (M.moved) await setSavings(actual + M.moved, `${D.name(N)} setup`, M.moved > 0 ? 'in' : 'out');
  if (S.allocTx && S.allocTx.length) await addBucketTx(S.allocTx);
  S.allocTx = null;
  S.draft = null;
  location.hash = '#/home';
  if (M.moved > 0) confetti();
  toast(`${D.name(N)} is set up${M.moved > 0 ? ` · ${money(M.moved)} to savings` : M.moved < 0 ? ` · ${money(-M.moved)} from savings` : ''}`);
}

/* ---------- First-time walkthrough (whoever starts a new household) ---------- */

const WZ_STEPS = ['People & income', 'How you’ll use it', 'Budgets', 'Bills', 'Savings', 'Anything else?', 'This month'];
const WZ_CATS = [['Pets', '🐾'], ['Kids', '🧸'], ['Gas', '⛽'], ['Personal', '💅'], ['Gifts', '🎁'], ['Medical', '🩺'], ['Eating out', '🍔']];
const welcoming = () => !!(H() && H().welcomeBy && H().welcomeBy === me());

function viewWelcome() {
  S.wz = S.wz || { step: 0 };
  S.wz.other = S.wz.other || [];
  S.wz.back = S.wz.back || [];
  const st = S.wz.step;
  const h = H();
  const sv = h.savings || {};
  const people = Calc.earners(h);
  const ym = homeYm();
  const sw = (on, act, k, label) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" data-k="${k}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button>`;
  let body = '';
  if (st === 0) {
    body = `<h2>Who earns money in your household?</h2><p class="muted">Add everyone whose paychecks go toward this budget.</p>
      ${people.map(e => `<div class="edit-row"><input class="grow" data-ch="earner" data-id="${esc(e.id)}" value="${esc(e.name)}" aria-label="Name">${people.length > 1 ? `<button class="x small" data-act="person-del" data-id="${esc(e.id)}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
      <button class="linkish small" data-act="person-add">+ Add a person</button>
      <h3>Usual monthly income</h3><p class="small muted">Take-home pay in a normal month. You can plan raises, overtime and one-time money later.</p>
      <div class="two">${people.map(e => `<label class="field"><span class="label">${esc(e.name)}</span><input data-ch="usual" data-f="${esc(e.id)}" inputmode="decimal" value="${esc((h.usual || {})[e.id])}" placeholder="$"></label>`).join('')}</div>`;
  } else if (st === 1) {
    const mode = h.trackMode || 'log';
    body = `<h2>How you’ll use it</h2>
      <h3>Tracking spending</h3>
      <div class="seg">${[['log', 'Log'], ['import', 'Import'], ['both', 'Both']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="wz-track" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="small muted">${trackHelp(mode)}</p>
      <div class="line feature"><span><b>Paychecks land in this checking account</b><span class="small muted">Turn on if paychecks arrive here during the month to pay for next month. You’ll check each one off as it comes in.</span></span>${sw(!!feat('payInChecking'), 'feature', 'payInChecking', 'Paychecks land in checking')}</div>
      <div class="line feature"><span><b>Savings buckets</b><span class="small muted">Give savings jobs — emergency fund, car, vacation — each with its own goal.</span></span>${sw(!!feat('buckets'), 'feature', 'buckets', 'Savings buckets')}</div>
      <p class="small muted">You can change any of these later in Settings → Setup.</p>`;
  } else if (st === 2) {
    const have = new Set(h.categories.map(c => c.name.toLowerCase()));
    const sug = WZ_CATS.filter(([n]) => !have.has(n.toLowerCase()));
    body = `<h2>Monthly budgets</h2><p class="muted">What you plan to spend each month on everyday things (not bills). Change the names and amounts, or remove any you don’t need.</p>
      ${sug.length ? `<div class="chips wz-chips">${sug.map(([n, e]) => `<button class="chip" data-act="wz-cat" data-n="${esc(n)}" data-e="${e}">+ ${e} ${esc(n)}</button>`).join('')}</div>` : ''}
      ${catsEditHtml(false)}`;
  } else if (st === 3) {
    body = `<h2>Bills</h2><p class="muted">Bills that come out of checking every month — rent, insurance, phone, car payment. Add each with its due day.</p>
      ${billsEditHtml(false)}`;
  } else if (st === 4) {
    body = `<h2>Savings</h2>
      <label class="field"><span class="label">How much is in savings right now?</span><input data-ch="wz-sav" inputmode="decimal" value="${esc(sv.actual || '')}" placeholder="$"></label>
      <div class="three">
        <label class="field"><span class="label">Always keep</span><input data-ch="goal" data-f="floor" inputmode="decimal" value="${esc(sv.floor)}"></label>
        <label class="field"><span class="label">Minimum this year</span><input data-ch="goal" data-f="goalMin" inputmode="decimal" value="${esc(sv.goalMin)}"></label>
        <label class="field"><span class="label">Goal this year</span><input data-ch="goal" data-f="goalMax" inputmode="decimal" value="${esc(sv.goalMax)}"></label>
      </div>
      <label class="field"><span class="label">Cushion to keep in checking</span><input data-ch="goal" data-f="buffer" inputmode="decimal" value="${esc(checkingBuffer())}"></label>
      <p class="small muted">Each month, anything above the cushion can move to savings.${bucketsOn() ? ' Set up your buckets anytime from the Year tab → Savings right now.' : ''}</p>`;
  } else if (st === 5) {
    const list = (kind, label) => (S.wz[kind].length ? S.wz[kind].map(o => `<div class="line"><span>${esc(o.name)}</span><span><b>${money(o.amount)}</b> <button class="x small" data-act="wz-x-del" data-kind="${kind}" data-id="${esc(o.id)}" aria-label="Remove">×</button></span></div>`).join('') : `<p class="muted small">${label}</p>`)
      + `<div class="add-row"><input id="wz-${kind}-name" placeholder="${kind === 'other' ? 'e.g. Credit card payment' : 'e.g. Refund'}"><input id="wz-${kind}-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="wz-x-add" data-kind="${kind}">Add</button></div>`;
    body = `<h2>Anything else this month?</h2><p class="muted">One-time things for ${D.name(ym)} that aren’t a regular bill or budget. Only add what hasn’t happened yet — anything already in your checking balance is covered. Skip this if there’s nothing.</p>
      <h3>Other expenses still to pay</h3><p class="small muted">A credit card payment, a trip, a birthday gift…</p>${list('other', 'None')}
      <h3>Money still coming in</h3><p class="small muted">A refund, money someone owes you, extra pay…</p>${list('back', 'None')}`;
  } else {
    body = `<h2>Let’s start ${D.name(ym)}</h2><p class="muted">What does your checking account show right now?</p>
      <label class="amount move-amt"><span>$</span><input id="wz-checking" inputmode="decimal" value="${esc(S.wz.checking || '')}" aria-label="Checking balance"></label>
      <p class="small muted">Bills already due this month are treated as paid. Budgets start at your normal amounts.</p>
      ${(h.bills || []).some(b => D.dueTime(ym, b.day) > Date.now()) ? `<h3>Bills coming up</h3><p class="small muted">Any of these already taken out of that balance? Tap “already came out” so they aren’t counted twice.</p>
        ${(h.bills || []).filter(b => D.dueTime(ym, b.day) > Date.now()).map(b => preBillRow(b, ym, (S.wz.pre || {})[b.id], 'wz-pre')).join('')}` : ''}
      ${Store.configured && h.joinCode ? `<h3>Share with your household</h3><p class="small muted">Anyone joining makes an account, taps “Join with a code” and types:</p><div class="code">${esc(h.joinCode)}</div>` : ''}
      <button class="btn full" data-act="wz-finish">Finish setup</button>`;
  }
  return `<header class="hero small-hero"><h1>Welcome!</h1><div class="hero-sub">Let’s set up your budget · <button class="linkish small" data-act="wz-skip">skip for now</button></div></header>
    <div class="steps">${WZ_STEPS.map((s, i) => `<span class="${i === st ? 'on' : i < st ? 'done' : ''}" title="${s}"></span>`).join('')}</div>
    <section class="card setup">${body}</section>
    <div class="row between">${st > 0 ? '<button class="btn ghost" data-act="wz-back">Back</button>' : '<span></span>'}
      ${st < WZ_STEPS.length - 1 ? `<button class="btn" data-act="wz-next">Next: ${WZ_STEPS[st + 1]}</button>` : ''}</div>`;
}

async function finishWelcome(skipped) {
  const ym = homeYm();
  if (!skipped && !(S.months[ym] && S.months[ym].setup)) {
    const amount = num(S.wz && S.wz.checking);
    const M = {
      setup: true, setupAt: Date.now(), bills: preBills((S.wz && S.wz.pre) || {}, ym), moved: null,
      other: ((S.wz && S.wz.other) || []).map(o => ({ ...o, paid: false })),
      back: ((S.wz && S.wz.back) || []).map(o => ({ ...o, received: false })),
      budgets: Object.fromEntries(H().categories.map(c => [c.id, Number(c.budget) || 0])),
      held: (H().helpers || []).map(x => ({ ...x, received: false })),
      checking: { amount: amount === null ? 0 : amount, at: Date.now() },
      ...(payInChecking() ? { incoming: [] } : {}),
    };
    await B.setMonth(ym, M);
  }
  await B.setH([[['welcomeBy'], B.DEL]]);
  S.wz = null;
  location.hash = '#/home';
  if (!skipped) { confetti(); toast('You’re all set 🎉'); }
}

/* ---------- Habits (no-spend days, streaks, trackers) ---------- */

// What counts as "spending" for habits: chosen categories, tags and stores (bills never count).
// Default: Activities, Home, and anything tagged/categorized Eating out.
function habitCfg() {
  const h = H();
  const hb = h.habits || {};
  const cats = hb.cats || h.categories.filter(c => /activit|^home/i.test(c.name) || /eating out/i.test(c.name)).map(c => c.id);
  const tags = hb.tags || (h.tags || []).filter(t => /eating out/i.test(t));
  return { cats, tags, stores: hb.stores || [], goal: Number(hb.goal) || 0, streakGoal: Number(hb.streakGoal) || 0, trackers: hb.trackers || [], order: hb.order || [] };
}
const habitCounts = (p, cfg) => (Number(p.amount) || 0) > 0 && (cfg.cats.includes(p.cat) || (p.tags || []).some(t => cfg.tags.includes(t))
  || cfg.stores.some(s => String(p.store || '').toLowerCase().includes(s.toLowerCase())));
// Days we can't know yet: import-only households, after the last import.
const habitKnown = day => H().trackMode !== 'import' || ((H().imports || {}).through || '') >= day;

function habitDays(ym, cfg) {
  const today = D.today();
  const start = H().created ? D.dayStr(new Date(H().created)) : '';
  const spentOn = new Set(S.purchases.filter(p => habitCounts(p, cfg)).map(p => p.date));
  return Array.from({ length: D.daysIn(ym) }, (_, i) => {
    const day = `${ym}-${D.pad(i + 1)}`;
    // Before the household started (or in the future): nothing to show yet.
    const st = day > today || day < start ? 'future' : !habitKnown(day) ? 'unknown' : spentOn.has(day) ? 'spent' : 'free';
    return { day, n: i + 1, st };
  });
}
// No-spend days in a row, counting back from today (today counts if nothing yet).
function habitStreak(match) {
  const start = H().created ? D.dayStr(new Date(H().created)) : '2000-01-01';
  const spentOn = new Set(S.purchases.filter(match).map(p => p.date));
  let n = 0;
  let t = new Date(`${D.today()}T12:00`);
  for (;;) {
    const day = D.dayStr(t);
    if (day < start || !habitKnown(day) || spentOn.has(day)) break;
    n++;
    t = new Date(t.getTime() - 864e5);
    if (n > 3660) break;
  }
  return n;
}
function trackerMatch(tr) {
  const v = String(tr.v || '').toLowerCase();
  if (tr.kind === 'tag') return p => (Number(p.amount) || 0) > 0 && (p.tags || []).some(t => t.toLowerCase() === v);
  if (tr.kind === 'cat') return p => (Number(p.amount) || 0) > 0 && p.cat === tr.v;
  return p => (Number(p.amount) || 0) > 0 && String(p.store || '').toLowerCase().includes(v);
}

function viewHabits() {
  setTimeout(() => loadAllPurchases().then(() => { if (route() === 'habits' && !S.habitsLoaded) { S.habitsLoaded = true; render(); } }).catch(e => console.warn('habits', e)), 0);
  const cfg = habitCfg();
  const ym = S.habYm || D.curYm();
  const days = habitDays(ym, cfg);
  const free = days.filter(d => d.st === 'free').length;
  const streak = habitStreak(p => habitCounts(p, cfg));
  const blanks = new Date(D.yearOf(ym), D.monthNum(ym) - 1, 1).getDay();
  const isNow = ym === D.curYm();
  const goal = cfg.goal;
  const hit = goal && free >= goal;
  if (isNow && S.loadedFrom <= '2000-01-01') checkHabitWins(cfg, free, streak);
  return `<header class="hero small-hero"><h1>Habits</h1><a class="gear bd-icon" href="#/breakdown" aria-label="Breakdown and search">${icons.chart}</a></header>
  <section class="card habits-cal">
    <div class="row between month-nav"><button class="nav" data-act="hab-m" data-d="-1" aria-label="Previous month">‹</button><h2>${D.name(ym)} ${D.yearOf(ym)}</h2><button class="nav" data-act="hab-m" data-d="1" aria-label="Next month" ${isNow ? 'disabled' : ''}>›</button></div>
    <div class="hab-stats ${isNow ? '' : 'one'}">
      <div class="hab-tile free"><b>${free}</b><span>no-spend day${free === 1 ? '' : 's'}</span></div>
      ${isNow ? `<div class="hab-tile streak"><b>${streak}${streak >= 3 ? '<i>🔥</i>' : ''}</b><span>day streak</span></div>` : ''}
    </div>
    <div class="hab-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span class="dp-dow">${x}</span>`).join('')}${'<span></span>'.repeat(blanks)}${days.map(d => `<span class="hab-day ${d.st} ${d.day === D.today() ? 'today' : ''}" title="${d.day}">${d.st === 'unknown' ? '?' : d.n}</span>`).join('')}</div>
    ${H().trackMode === 'import' ? '<p class="small muted">“?” days come in with your next import.</p>' : ''}
  </section>
  <div class="section-head-row"><h2 class="section-title">Goals</h2><button class="add-goal" data-act="goal-add" aria-label="Add a goal">+</button></div>
  ${goalCards(cfg, free, streak, isNow)}`;
}

// Comparing with last month (for the lines under each goal).
function monthStats(ym, cfg, upto) {
  const days = habitDays(ym, cfg);
  if (days.every(d => d.st === 'future')) return null; // before the household started
  let free = 0; let best = 0; let run = 0;
  for (const d of days) {
    if (upto && d.n > upto) break;
    if (d.st === 'free') { free++; run++; best = Math.max(best, run); } else run = 0;
  }
  return { free, best };
}
const timesIn = (match, ym) => S.purchases.filter(p => match(p) && D.ymOf(p.date) === ym).length;

// Beat last month? Confetti + a "Good job!" note, once per goal per month (on this device).
function celebrateOnce(key, title, text) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('ne-cele')) || {}; } catch (e) {}
  if (seen[key]) return;
  seen[key] = 1;
  try { localStorage.setItem('ne-cele', JSON.stringify(seen)); } catch (e) {}
  // More than one win at once: show them one after another.
  S.celeQ = (S.celeQ || []).concat({ title, text });
  if (S.celeQ.length === 1) setTimeout(nextCelebration, 600);
}
async function nextCelebration() {
  const c = S.celeQ[0];
  if (!c) return;
  confetti();
  await ask(`<b>Good job! 🎉 ${c.title}</b><br>${c.text}`, 'Thanks!', 'Close');
  S.celeQ.shift();
  if (S.celeQ.length) setTimeout(nextCelebration, 400);
}
function checkHabitWins(cfg, free, streak) {
  const cur = D.curYm();
  const prev = D.addMonths(cur, -1);
  const last = monthStats(prev, cfg);
  if (last && cfg.goal && last.free >= 1 && free > last.free) celebrateOnce(`month:${cur}`, `You beat ${D.name(prev)}’s no-spend days!`, `${free} no-spend days so far — more than all of ${D.name(prev)} (${last.free}).`);
  if (last && cfg.streakGoal && last.best >= 1 && streak > last.best) celebrateOnce(`streak:${cur}`, `You beat ${D.name(prev)}’s no-spend streak!`, `${streak} days in a row — longer than ${D.name(prev)}’s best (${last.best}).`);
  // "Avoid" goals are judged once a month is over: fewer times than the month before.
  const before = D.addMonths(prev, -1);
  if (monthStats(before, cfg)) {
    for (const tr of cfg.trackers) {
      const m = trackerMatch(tr);
      const a = timesIn(m, prev);
      const b = timesIn(m, before);
      if (a < b) celebrateOnce(`trk:${tr.id}:${prev}`, `You beat ${D.name(before)} on “${esc(tr.name)}”!`, `${esc(tr.name.replace(/^No /, ''))} only ${a} time${a === 1 ? '' : 's'} in ${D.name(prev)} — fewer than ${D.name(before)} (${b}).`);
    }
  }
}

// Goal cards: monthly no-spend days, days in a row, and "No ___" streaks. Tap one to edit or remove it.
function goalCards(cfg, free, streak, isNow) {
  const bar = (n, of) => `<div class="bar"><i style="width:${Math.min(100, (n / of) * 100)}%"></i></div>`;
  const prev = D.addMonths(D.curYm(), -1);
  const pName = D.name(prev);
  const dayNum = new Date().getDate();
  const cmp = t => (t ? `<p class="small muted goal-cmp">${t}</p>` : '');
  const lastTo = dayNum >= 3 ? monthStats(prev, cfg, dayNum) : null; // too early in the month to compare
  const lastAll = monthStats(prev, cfg);
  const monthLine = lastTo ? (free === lastTo.free ? `Even with ${pName} by this point` : `${Math.abs(free - lastTo.free)} ${free > lastTo.free ? 'ahead of' : 'behind'} ${pName} by this point`) : '';
  const streakLine = lastAll && dayNum >= 3 ? `${pName}’s best: ${lastAll.best} in a row` : '';
  const cards = [];
  if (cfg.goal) cards.push(`<button class="card goal" data-key="goal" data-act="goal-edit" data-k="goal"><div class="row between"><b>📅 ${cfg.goal} no-spend days a month</b><span class="small ${free >= cfg.goal ? 'save-good' : 'muted'}">${free >= cfg.goal ? 'Reached! 🎉' : `${free} of ${cfg.goal}`}</span></div>${bar(free, cfg.goal)}${cmp(monthLine)}</button>`);
  if (cfg.streakGoal && isNow) cards.push(`<button class="card goal" data-key="streakGoal" data-act="goal-edit" data-k="streakGoal"><div class="row between"><b>🔥 ${cfg.streakGoal} days in a row</b><span class="small ${streak >= cfg.streakGoal ? 'save-good' : 'muted'}">${streak >= cfg.streakGoal ? 'Reached! 🎉' : `${streak} of ${cfg.streakGoal}`}</span></div>${bar(streak, cfg.streakGoal)}${cmp(streakLine)}</button>`);
  for (const tr of cfg.trackers) {
    const m = trackerMatch(tr);
    const last = S.purchases.filter(m).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const n = habitStreak(m);
    cards.push(`<button class="card goal tracker" data-key="trk:${esc(tr.id)}" data-act="goal-edit" data-k="trk" data-id="${esc(tr.id)}"><div class="row between"><span><b>${esc(tr.emoji || '✨')} ${esc(tr.name)}</b><span class="small muted">${last ? `Last: ${D.niceDay(last.date)} · ${money(last.amount)}` : 'Nothing yet'}</span></span><span class="trk-n"><b>${n}</b><span class="small muted">day${n === 1 ? '' : 's'}</span></span></div>${cmp(lastAll && dayNum >= 3 ? `${pName}: ${timesIn(m, prev)} time${timesIn(m, prev) === 1 ? '' : 's'}` : '')}</button>`);
  }
  // Your own order (press and hold a goal to drag it); new goals go to the end.
  const pos = html => { const k = html.match(/data-key="([^"]+)"/)[1]; const i = cfg.order.indexOf(k); return i < 0 ? 999 : i; };
  cards.sort((a, b) => pos(a) - pos(b));
  return cards.join('');
}

async function saveHabits(patch) {
  const c = habitCfg();
  const next = { cats: c.cats, tags: c.tags, stores: c.stores, goal: c.goal, streakGoal: c.streakGoal, trackers: c.trackers, order: c.order, ...patch };
  await B.setH([[['habits'], next]]);
}

function openGoalAdd() {
  S.gadd = S.gadd || { type: 'month' };
  S.sheet = 'goal';
  openSheet(goalAddHtml());
}
function goalAddHtml() {
  const g = S.gadd;
  const cfg = habitCfg();
  const types = [['month', 'Per month'], ['streak', 'In a row'], ['avoid', 'Avoid something']];
  let body = '';
  if (g.type === 'month') body = `<label class="field"><span class="label">How many no-spend days each month?</span><input id="g-n" inputmode="numeric" value="${cfg.goal || ''}" placeholder="e.g. 10"></label>`;
  else if (g.type === 'streak') body = `<label class="field"><span class="label">How many no-spend days in a row?</span><input id="g-n" inputmode="numeric" value="${cfg.streakGoal || ''}" placeholder="e.g. 5"></label>`;
  else {
    const kind = g.kind || 'store';
    const opts = kind === 'store' ? (H().stores || []) : kind === 'tag' ? (H().tags || []) : H().categories.map(x => x.name);
    body = `<div class="field"><span class="label">What do you want to go without?</span>
      <div class="seg">${[['store', 'A store'], ['tag', 'A tag'], ['cat', 'A category']].map(([k, l]) => `<button type="button" class="${kind === k ? 'on' : ''}" data-act="goal-kind" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="chips">${opts.map(x => `<button type="button" class="chip ${g.v === x ? 'on' : ''}" data-act="goal-pick" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      ${kind === 'cat' ? '' : `<input id="hab-v" placeholder="${kind === 'store' ? 'Or type a store, e.g. Amazon' : 'Or type a tag'}" value="${esc(g.v && !opts.includes(g.v) ? g.v : '')}" style="margin-top:8px">`}
      <p class="small muted">Counts the days since you last ${kind === 'store' ? 'shopped there' : 'bought it'}.</p></div>`;
  }
  return `<div class="sheet-head"><h2>Add a goal</h2><button class="x" data-act="close" aria-label="Close">×</button></div>
    <div class="seg goal-types">${types.map(([k, l]) => `<button type="button" class="${g.type === k ? 'on' : ''}" data-act="goal-type" data-v="${k}">${l}</button>`).join('')}</div>
    ${body}
    <div class="row end sheet-foot"><button class="btn" data-act="goal-save">Add goal</button></div>
    <button class="card menu-row goal-menu" data-act="hab-settings"><span><b>What counts as spending</b><span class="small muted">The categories and tags that break a no-spend day</span></span><span class="chev">›</span></button>`;
}
function openGoalEdit(el) {
  const cfg = habitCfg();
  S.gedit = { k: el.dataset.k, id: el.dataset.id };
  S.sheet = 'goal';
  S.hab = JSON.parse(JSON.stringify(cfg));
  openSheet(goalEditHtml());
}
function goalEditHtml() {
  const cfg = habitCfg();
  const { k, id } = S.gedit;
  const tr = k === 'trk' ? cfg.trackers.find(t => t.id === id) : null;
  return `<div class="sheet-head"><h2>${tr ? `${esc(tr.emoji || '✨')} ${esc(tr.name)}` : k === 'goal' ? 'No-spend days a month' : 'Days in a row'}</h2><button class="x" data-act="close" aria-label="Close">×</button></div>
    ${tr ? `<p class="muted">Counting the days since you last bought ${tr.kind === 'cat' ? `anything in ${esc((catById(tr.v) || {}).name || '')}` : esc(tr.v)}.</p>`
      : `<label class="field"><span class="label">${k === 'goal' ? 'No-spend days each month' : 'No-spend days in a row'}</span><input id="g-n" inputmode="numeric" value="${esc(S.gedit.n !== undefined ? S.gedit.n : cfg[k] || '')}"></label>${habitPickHtml()}`}
    <div class="row between sheet-foot"><button class="btn ghost danger" data-act="goal-del">Remove goal</button>${tr ? '' : '<button class="btn" data-act="goal-update">Save</button>'}</div>`;
}

function openHabitSettings() {
  const cfg = habitCfg();
  S.hab = JSON.parse(JSON.stringify(cfg));
  S.sheet = 'hab';
  openSheet(habitSheetHtml());
}
function habitSheetHtml() {
  return `<div class="sheet-head"><h2>What counts as spending</h2><button class="x" data-act="close" aria-label="Close">×</button></div>
    ${habitPickHtml()}
    <div class="row end sheet-foot"><button class="btn" data-act="hab-save">Save</button></div>`;
}
// The categories, tags and stores that break a no-spend day (S.hab draft).
function habitPickHtml() {
  const c = S.hab;
  const chip = (act, v, on, label) => `<button type="button" class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${label}</button>`;
  const stores = [...(H().stores || [])];
  for (const v of c.stores) if (!stores.some(x => x.toLowerCase() === v.toLowerCase())) stores.push(v);
  return `<div class="field"><span class="label">What counts as spending?</span><p class="small muted">Green days on the calendar = nothing bought in these. Bills never count.</p>
      <div class="chips">${H().categories.map(x => chip('hab-cat', x.id, c.cats.includes(x.id), catLabel(x, 20))).join('')}</div>
      <p class="small muted" style="margin-top:8px">Tags</p><div class="chips">${(H().tags || []).map(t => chip('hab-tag', t, c.tags.includes(t), esc(t))).join('') || '<span class="small muted">No tags yet</span>'}</div>
      <p class="small muted" style="margin-top:8px">Stores</p><div class="chips">${stores.map(v => chip('hab-store', v, c.stores.includes(v), esc(v))).join('')}</div>
      <span class="add-inline"><input id="hab-store-new" placeholder="Or type a store, e.g. Amazon"><button class="btn small" data-act="hab-store-add">Add</button></span></div>`;
}
function redrawHab() {
  const y = $('#sheet').scrollTop;
  if (S.sheet === 'goal') { const n = $('#g-n'); if (n) S.gedit.n = n.value; $('#sheet').innerHTML = goalEditHtml(); } else $('#sheet').innerHTML = habitSheetHtml();
  $('#sheet').scrollTop = y;
}

/* ---------- Month-end setup reminder ($ page) ---------- */

// When "Set up next month" shows: the last week as a small icon; from the reminder day
// (last Friday by default for older households, last 3 days for new ones) as a banner.
function setupRemindDay(ym) {
  const mode = H().setupRemind || 'friday';
  const last = D.daysIn(ym);
  if (mode === 'last3') return last - 2;
  if (mode === 'friday') { for (let d = last; d > 0; d--) if (new Date(D.yearOf(ym), D.monthNum(ym) - 1, d).getDay() === 5) return d; }
  const n = Number(mode);
  return n >= 1 ? Math.min(n, last) : last - 2;
}
function setupPrompt() {
  const cur = D.curYm();
  const next = D.addMonths(cur, 1);
  const now = new Date();
  const day = now.getDate();
  const last = D.daysIn(cur);
  if (!(S.months[cur] && S.months[cur].setup)) return { kind: 'start', ym: cur, banner: true };
  if (S.months[next] && S.months[next].setup) return null;
  const planned = !!(S.months[next] && S.months[next].planned);
  if (day === last && now.getHours() >= 18) return { kind: 'start', ym: next, banner: true, planned };
  if (!planned && day >= setupRemindDay(cur)) return { kind: 'plan', ym: next, banner: true };
  if (day > last - 7) return { kind: 'plan', ym: next, banner: false, planned };
  return null;
}

/* ---------- App tour ("How does it work?") ----------
   Dims the screen, spotlights one thing at a time with a short note, and moves
   between pages by itself. Shows once for each new person (after first-time
   setup, or the first time someone who joined with a code opens the app), and
   anytime from Settings. */

function tourSteps() {
  const ov = overviewOn();
  const st = [];
  if (ov) st.push(
    { route: 'home', page: 'overview', sel: '.checking-row', title: 'Checking', text: 'Tap here to type your real balance from your bank app. After that, the app takes out bills on their due dates and purchases you log or import here. Spent something you didn’t put in the app? Update the balance so it stays right.' },
    { route: 'home', page: 'overview', sel: '.checklist .total-line', title: 'Savings/Excess', text: 'What’s truly extra this month — after bills still to come, other expenses and what’s left in your budgets. If it’s negative, that’s how much you’d need to cut back (or move from savings) to break even.' },
    { route: 'home', page: 'overview', sel: '.bills-card', title: 'Automatic payments', text: 'Bills check themselves off on their due date. Tap one if something’s off.' },
  );
  st.push(
    { route: 'home', page: 'budgets', sel: '.spend-sum', title: 'Budgets', text: 'How much is left to spend this month, with a card for each category below. Tap a card to log or see its purchases.' },
    { route: 'home', page: 'budgets', sel: ['#fab', '#fab2'], showBoth: true, title: 'Tracking spending: Log or Import', text: '+ Log: add a purchase right after you buy it (you can split one receipt across categories). Import: download your bank’s transactions as a CSV file weekly (or as often as you like) and the app sorts them for you. Or do both — anything you already logged is matched, never counted twice. Choose in Settings → Setup.' },
    { route: 'home', sel: '.setup-icon', showSetup: true, title: 'Plan & start next month', text: 'In the last week of the month this icon shows up here to plan next month — bills, budgets and paychecks (a banner reminds you after your last payday). Nothing changes this month. Then on the evening of the last day, “Start” the new month: your checking balance and what moves to savings. Anything you planned on the Year tab fills in automatically.' },
    ...(habitsOn() ? [{ route: 'habits', sel: '.habits-cal', title: 'Habits', text: 'Green days are no-spend days — nothing bought in the categories you pick (bills never count). Watch your streak, and tap + under Goals to aim for no-spend days, days in a row, or habits like “No eating out”.' }] : []),
    habitsOn() ? { route: 'habits', sel: '.bd-icon', title: 'Breakdown & search', text: 'Tap here to see where the money went by category, store or tag — and search any purchase ever.' } : { route: 'breakdown', sel: '.psearch', title: 'Breakdown & search', text: 'Where the money went by category, store or tag — and search any purchase ever.' },
    { route: 'year', sel: '.months', title: 'Year', text: 'Your savings projected month by month. Tap a month to plan raises, overtime, Christmas or anything one-time.' },
    { route: 'home', sel: '.home-hero .gear', title: 'Settings', text: 'Categories, bills, income and everything else live here. Want this tour again? Settings → How does it work?' },
  );
  return st;
}

function startTour() {
  S.tour = { i: 0, steps: tourSteps() };
  tourGo();
}

function tourGo() {
  const T = S.tour;
  const st = T.steps[T.i];
  if (st.page) { S.page = st.page; try { localStorage.setItem('ne-page', S.page); } catch (e) {} }
  if (route() !== st.route) location.hash = `#/${st.route}`; else render(true);
  setTimeout(() => {
    const el = $([].concat(st.sel)[0]);
    if (el) el.scrollIntoView({ block: 'center' });
    setTimeout(tourDraw, 250);
  }, 250);
}

function tourDraw() {
  const T = S.tour;
  if (!T) return;
  const st = T.steps[T.i];
  let box = $('#tour');
  if (!box) { box = document.createElement('div'); box.id = 'tour'; document.body.appendChild(box); }
  // One spotlight around everything this stop points at (e.g. both + Log and Import).
  const rects = [].concat(st.sel).map(x => $(x)).filter(x => x && !x.hidden).map(x => x.getBoundingClientRect());
  const r = rects.length ? { top: Math.min(...rects.map(q => q.top)), left: Math.min(...rects.map(q => q.left)), bottom: Math.max(...rects.map(q => q.bottom)), right: Math.max(...rects.map(q => q.right)) } : null;
  if (r) { r.width = r.right - r.left; r.height = r.bottom - r.top; }
  const pad = 8;
  const last = T.i === T.steps.length - 1;
  const spot = r ? `<div class="tour-spot" style="top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '<div class="tour-dim"></div>';
  // Bubble goes below the spotlight if there's room, otherwise above.
  const below = !r || r.bottom + 230 < window.innerHeight;
  const pos = !r ? 'top:30%' : below ? `top:${Math.round(r.bottom + pad + 12)}px` : `bottom:${Math.round(window.innerHeight - r.top + pad + 12)}px`;
  box.innerHTML = `${spot}<div class="tour-bubble" style="${pos}" role="dialog" aria-label="${esc(st.title)}">
    <div class="row between"><b>${esc(st.title)}</b><button class="x small" data-act="tour-end" aria-label="Close tour">×</button></div>
    <p>${esc(st.text)}</p>
    <div class="row between"><span class="steps tour-dots">${T.steps.map((_, i) => `<span class="${i === T.i ? 'on' : i < T.i ? 'done' : ''}"></span>`).join('')}</span>
      <span class="row gap">${T.i ? '<button class="btn ghost small" data-act="tour-back">Back</button>' : ''}<button class="btn small" data-act="${last ? 'tour-end' : 'tour-next'}">${last ? 'Done' : 'Next'}</button></span></div>
  </div>`;
}

async function endTour() {
  S.tour = null;
  const box = $('#tour'); if (box) box.remove();
  if (((H().people || {})[me()] || {}).tourPending) await B.setH([[['people', me(), 'tourPending'], B.DEL]]);
}
window.addEventListener('resize', () => { if (S.tour) tourDraw(); });
window.addEventListener('scroll', () => { if (S.tour) tourDraw(); }, { passive: true });

/* ---------- Set up next year (December / January, from Review) ---------- */

const NY_STEPS = ['Savings recap', 'Budgets', 'Bills', 'Income', 'One-time money', 'Your year'];

// The year being planned: next year in December, this year in January.
function nyYear() {
  const now = D.curYm();
  return D.monthNum(now) === 12 ? D.yearOf(now) + 1 : D.yearOf(now);
}
const nyMonths = Y => Array.from({ length: 12 }, (_, i) => `${Y}-${D.pad(i + 1)}`);

function startNY() {
  const h = H();
  const Y = nyYear();
  const jan = `${Y}-01`;
  const plans = h.plans || {};
  const sv = h.savings || {};
  const extra = Math.max(0, round2((Number(sv.actual) || 0) - (Number(sv.floor) || 5000)));
  const ny = {
    Y, step: 0, moved: extra,
    budgets: Object.fromEntries(h.categories.map(c => [c.id, Number(c.budget) || 0])),
    bills: Object.fromEntries((h.bills || []).map(b => [b.id, Calc.billNormal(b, jan)])),
    billChanges: [],
    usual: Object.fromEntries(Calc.earners(h).map(e => [e.id, Calc.usualFor(h, e.id, jan) ?? ''])),
    usualChanges: [],
    plans: {},
    addMonth: jan, addKind: 'other',
    goals: { goalMin: Number(sv.goalMin) || 5000, goalMax: Number(sv.goalMax) || 10000 },
  };
  for (const ym of nyMonths(Y)) {
    const p = plans[ym] || {};
    ny.plans[ym] = { other: (p.other || []).map(o => ({ ...o, id: o.id || newId() })), extra: Calc.extras(p).map(x => ({ ...x, id: x.id === 'elevate' ? newId() : x.id || newId() })) };
  }
  S.ny = ny;
}

// Last year's one-time items, same months, that aren't already planned.
function nySuggestions(ny) {
  const plans = H().plans || {};
  const out = [];
  for (const ym of nyMonths(ny.Y)) {
    const last = plans[`${ny.Y - 1}-${ym.slice(5)}`] || {};
    const have = k => new Set(ny.plans[ym][k].map(o => String(o.name).trim().toLowerCase()));
    for (const [k, list] of [['other', last.other || []], ['extra', Calc.extras(last)]]) {
      const h = have(k);
      for (const o of list) if (Number(o.amount) && !h.has(String(o.name).trim().toLowerCase())) out.push({ key: `${ym}|${k}|${o.name}`, ym, kind: k, name: o.name, amount: Number(o.amount) });
    }
  }
  return out;
}

// Household with the walkthrough's changes applied, for the projection and for saving.
function nyApplied(ny) {
  const h = JSON.parse(JSON.stringify(H()));
  const jan = `${ny.Y}-01`;
  const addChange = (list, c, same) => [...(list || []).filter(x => !same(x)), c].sort((a, b) => (a.from < b.from ? -1 : 1));
  h.categories = h.categories.map(c => ({ ...c, budget: num(ny.budgets[c.id]) ?? (Number(c.budget) || 0) }));
  h.bills = (h.bills || []).map(b => {
    let changes = b.changes || [];
    const v = num(ny.bills[b.id]);
    if (v !== null && Math.abs(v - Calc.billNormal(b, jan)) > 0.004) changes = addChange(changes, { from: jan, amount: v }, x => x.from === jan);
    for (const c of ny.billChanges.filter(x => x.bill === b.id)) changes = addChange(changes, { from: c.from, amount: c.amount }, x => x.from === c.from);
    return { ...b, changes };
  });
  let uc = h.usualChanges || [];
  for (const e of Calc.earners(h)) {
    const v = num(ny.usual[e.id]);
    const cur = Calc.usualFor(H(), e.id, jan);
    if (v !== null && Math.abs(v - (Number(cur) || 0)) > 0.004) {
      if (cur === undefined || cur === null || cur === '') h.usual = { ...(h.usual || {}), [e.id]: v };
      else uc = addChange(uc, { id: newId(), earner: e.id, from: jan, amount: v }, x => x.earner === e.id && x.from === jan);
    }
  }
  for (const c of ny.usualChanges) uc = addChange(uc, { ...c }, x => x.earner === c.earner && x.from === c.from);
  h.usualChanges = uc;
  h.plans = h.plans || {};
  for (const ym of nyMonths(ny.Y)) {
    const p = { ...(h.plans[ym] || {}), other: ny.plans[ym].other, extra: ny.plans[ym].extra };
    delete p.elevate; delete p.elevateName; delete p.elevateToSavings;
    h.plans[ym] = p;
  }
  h.savings = { ...(h.savings || {}), ...ny.goals };
  if (!bucketsOn()) h.savings.actual = round2((Number(h.savings.actual) || 0) - (num(ny.moved) || 0));
  return h;
}

function readNYInputs() {
  const ny = S.ny;
  const v = sel => { const el = view.querySelector(sel); return el ? el.value : undefined; };
  const m = v('#ny-moved'); if (m !== undefined) ny.moved = m;
  for (const c of H().categories) { const x = v(`#ny-b-${c.id}`); if (x !== undefined) ny.budgets[c.id] = x; }
  for (const b of H().bills || []) { const x = v(`#ny-bill-${b.id}`); if (x !== undefined) ny.bills[b.id] = x; }
  for (const e of Calc.earners(H())) { const x = v(`#ny-u-${e.id}`); if (x !== undefined) ny.usual[e.id] = x; }
  for (const k of ['goalMin', 'goalMax']) { const x = v(`#ny-${k}`); if (x !== undefined && num(x) !== null) ny.goals[k] = num(x); }
  view.querySelectorAll('[data-ny-item]').forEach(el => {
    const [ym, kind, id] = el.dataset.nyItem.split('|');
    const o = ny.plans[ym][kind].find(x => x.id === id);
    if (o && num(el.value) !== null) o.amount = num(el.value);
  });
}

function viewNewYear() {
  if (!S.ny || S.ny.Y !== nyYear()) startNY();
  const ny = S.ny;
  const Y = ny.Y;
  const X = Y - 1;
  const h = H();
  const sv = h.savings || {};
  const actual = Number(sv.actual) || 0;
  const monthOpts = (val, from = 1) => nyMonths(Y).slice(from - 1).map(ym => `<option value="${ym}" ${ym === val ? 'selected' : ''}>${D.name(ym)}</option>`).join('');
  const steps = `<div class="steps">${NY_STEPS.map((s, i) => `<span class="${i === ny.step ? 'on' : i < ny.step ? 'done' : ''}" title="${s}"></span>`).join('')}</div>`;
  let body = '';
  if (ny.step === 0) {
    const added = (sv.log || []).filter(l => new Date(l.t).getFullYear() === X && l.kind !== 'hysa').reduce((a, l) => a + (Number(l.amount) || 0), 0);
    const floor = Number(sv.floor) || 5000;
    const goalMin = Number(sv.goalMin) || 5000;
    const goalMax = Number(sv.goalMax) || 10000;
    const extra = round2(actual - floor);
    body = `<h2>${X} savings recap</h2>
      <div class="line"><span>Savings right now</span><b>${money(actual)}</b></div>
      ${added ? `<div class="line"><span>Added in ${X}</span><b>${added > 0 ? '+' : ''}${money(added)}</b></div>` : ''}
      <p class="small muted">${actual >= goalMax ? `Past your ${money(goalMax)} goal! 🎉` : actual >= goalMin ? `Past your ${money(goalMin)} minimum — ${money(goalMax - actual)} short of the ${money(goalMax)} goal.` : `${money(goalMin - actual)} short of your ${money(goalMin)} minimum.`}</p>
      ${bucketsOn() ? `<h3>Buckets</h3>${(h.buckets || []).map(b => `<div class="line"><span>${esc(b.emoji || '')} ${esc(b.name)}</span><b>${money(Calc.bucketBalances(h)[b.id] || 0)}</b></div>`).join('')}`
        : `<h3>Move to the HYSA</h3>
        <p class="small muted">${extra > 0 ? `${money(extra)} is above the ${money(floor)} you keep in savings. Move it to the HYSA in your bank, then type what you actually moved.` : `Savings is at or under the ${money(floor)} you keep in savings — nothing to move. Type an amount if you moved some anyway.`}</p>
        <label class="amount move-amt"><span>$</span><input id="ny-moved" inputmode="decimal" value="${esc(ny.moved)}" aria-label="Amount moved to HYSA"></label>
        <p class="small muted">Savings will be set to what’s left when you finish.</p>`}`;
  } else if (ny.step === 1) {
    const total = h.categories.reduce((a, c) => a + (num(ny.budgets[c.id]) || 0), 0);
    body = `<h2>Budgets for ${Y}</h2><p class="muted">Normal monthly amounts starting January. Change any that should be different this year.</p>
      ${h.categories.map(c => `<div class="line"><span>${catLabel(c)} <span class="small muted">now ${money(c.budget)}</span></span><input class="mini" id="ny-b-${esc(c.id)}" inputmode="decimal" value="${esc(ny.budgets[c.id])}"></div>`).join('')}
      <div class="line subtotal"><span>Total</span><b>${money(total)}</b></div>`;
  } else if (ny.step === 2) {
    const later = b => [...(b.changes || []).filter(c => c.from > `${Y}-01` && c.from <= `${Y}-12`).map(c => ({ ...c, saved: true })), ...ny.billChanges.filter(c => c.bill === b.id)]
      .sort((a, c) => (a.from < c.from ? -1 : 1));
    body = `<h2>Bills for ${Y}</h2><p class="muted">What each bill will be in January. Know one is changing later in the year? Add it below.</p>
      ${(h.bills || []).map(b => `<div class="line"><span>${esc(b.name)} <span class="small muted">${D.ordinal(b.day)}</span></span><input class="mini" id="ny-bill-${esc(b.id)}" inputmode="decimal" value="${esc(ny.bills[b.id])}"></div>
        ${later(b).map(c => `<div class="small muted change">→ ${money(c.amount)} starting ${D.name(c.from)}${c.saved ? '' : ` <button class="linkish small" data-act="ny-bc-del" data-id="${esc(c.id)}">remove</button>`}</div>`).join('')}`).join('')}
      ${(h.bills || []).length ? `<h3>A change later in ${Y}</h3>
      <div class="add-row ny-add"><select id="ny-bc-bill">${h.bills.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select><select id="ny-bc-m">${monthOpts(`${Y}-02`, 2)}</select><input id="ny-bc-a" inputmode="decimal" placeholder="New $"><button class="btn small" data-act="ny-bc-add">Add</button></div>` : ''}`;
  } else if (ny.step === 3) {
    const people = Calc.earners(h);
    const nameOf = id => (people.find(e => e.id === id) || {}).name || '?';
    const later = [...(h.usualChanges || []).filter(c => c.from > `${Y}-01` && c.from <= `${Y}-12`).map(c => ({ ...c, saved: true })), ...ny.usualChanges].sort((a, b) => (a.from < b.from ? -1 : 1));
    body = `<h2>Usual income in ${Y}</h2><p class="muted">Your usual monthly paychecks starting January. The Year tab uses these for any month you haven’t filled in.</p>
      <div class="two">${people.map(e => `<label class="field"><span class="label">${esc(e.name)}</span><input id="ny-u-${esc(e.id)}" inputmode="decimal" value="${esc(ny.usual[e.id])}" placeholder="$"></label>`).join('')}</div>
      <h3>Expecting a change?</h3><p class="small muted">A raise or a new job starting a certain month.</p>
      ${later.map(c => `<div class="small muted change">→ ${esc(nameOf(c.earner))} ${money(c.amount)} starting ${D.name(c.from)}${c.saved ? '' : ` <button class="linkish small" data-act="ny-uc-del" data-id="${esc(c.id)}">remove</button>`}</div>`).join('')}
      <div class="add-row ny-add">${people.length > 1 ? `<select id="ny-uc-who">${people.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select>` : ''}<select id="ny-uc-m">${monthOpts(`${Y}-02`, 2)}</select><input id="ny-uc-a" inputmode="decimal" placeholder="New $"><button class="btn small" data-act="ny-uc-add">Add</button></div>`;
  } else if (ny.step === 4) {
    const sug = nySuggestions(ny);
    const item = (ym, kind, o) => `<div class="line ny-item"><span><i class="sign">${kind === 'extra' ? '+' : '−'}</i>${esc(o.name)}</span><span class="row gap"><input class="mini" data-ny-item="${ym}|${kind}|${esc(o.id)}" inputmode="decimal" value="${esc(o.amount)}" aria-label="${esc(o.name)} amount"><button class="x small" data-act="ny-del" data-ym="${ym}" data-kind="${kind}" data-id="${esc(o.id)}" aria-label="Remove">×</button></span></div>`;
    body = `<h2>One-time money in ${Y}</h2><p class="muted">Expenses (anniversary, Christmas, trips) and additional income (OT, academy pay) in the months you expect them. Each month’s setup picks these up.</p>
      ${sug.length ? `<h3>From ${X}</h3><p class="small muted">Tap Add on anything that happens again.</p>
        ${sug.map((g, i) => `<div class="line ny-sug"><span><b>${D.short(g.ym)}</b> ${esc(g.name)} <span class="small muted">${g.kind === 'extra' ? 'income' : 'expense'}</span></span><span class="row gap"><b>${money(g.amount)}</b><button class="btn small" data-act="ny-sug" data-i="${i}">Add</button></span></div>`).join('')}` : ''}
      <h3>Add something</h3>
      <div class="ny-pick"><select data-ch="ny-pick" data-f="addMonth">${monthOpts(ny.addMonth)}</select>
        <div class="seg">${[['other', 'Expense'], ['extra', 'Income']].map(([k, l]) => `<button class="${ny.addKind === k ? 'on' : ''}" data-act="ny-kind" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="add-row"><input id="ny-o-name" placeholder="${ny.addKind === 'extra' ? 'e.g. Academy week' : 'e.g. Anniversary'}"><input id="ny-o-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="ny-add">Add</button></div>
      <h3>Your ${Y}</h3>
      ${nyMonths(Y).map(ym => { const p = ny.plans[ym]; const n = p.other.length + p.extra.length; return n ? `<div class="ny-month"><div class="label">${D.name(ym)}</div>${p.other.map(o => item(ym, 'other', o)).join('')}${p.extra.map(o => item(ym, 'extra', o)).join('')}</div>` : ''; }).join('') || '<p class="muted small">Nothing yet.</p>'}`;
  } else {
    const h2 = nyApplied(ny);
    const yr = Calc.year(h2, S.months, Y, S.purchases, homeYm());
    const end = yr.endOfYear;
    const tot = k => nyMonths(Y).reduce((a, ym) => a + ny.plans[ym][k].reduce((s, o) => s + (Number(o.amount) || 0), 0), 0);
    const budgets = h2.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
    const bills = (h2.bills || []).reduce((a, b) => a + Calc.billNormal(b, `${Y}-01`), 0);
    const income = Calc.earners(h2).reduce((a, e) => a + (Number(Calc.usualFor(h2, e.id, `${Y}-01`)) || 0), 0);
    body = `<h2>Your ${Y} at a glance</h2>
      <div class="line"><span>Usual income <span class="small muted">a month</span></span><b>${money(income)}</b></div>
      <div class="line"><span>Bills <span class="small muted">January</span></span><b>${money(bills)}</b></div>
      <div class="line"><span>Budgets <span class="small muted">a month</span></span><b>${money(budgets)}</b></div>
      <div class="line"><span>One-time expenses</span><b>${money(tot('other'))}</b></div>
      <div class="line"><span>Additional income</span><b>${money(tot('extra'))}</b></div>
      <div class="line total-line"><span>Projected savings Dec 31</span><b class="${end !== null && end >= ny.goals.goalMin ? 'save-good' : ''}">${end === null ? '—' : money(end)}</b></div>
      <p class="small muted">${end === null ? 'Add usual income to see a projection.' : end >= ny.goals.goalMax ? 'Past your goal! 🎉' : end >= ny.goals.goalMin ? `Past the minimum — ${money(ny.goals.goalMax - end)} short of the goal.` : `${money(ny.goals.goalMin - end)} short of the minimum.`}</p>
      <h3>Savings goals for ${Y}</h3>
      <div class="two"><label class="field"><span class="label">Minimum</span><input id="ny-goalMin" inputmode="decimal" value="${esc(ny.goals.goalMin)}"></label>
      <label class="field"><span class="label">Goal</span><input id="ny-goalMax" inputmode="decimal" value="${esc(ny.goals.goalMax)}"></label></div>
      <button class="btn full" data-act="ny-finish">Finish & open ${Y}</button>`;
  }
  return `<header class="hero small-hero"><h1>Set up ${Y}</h1></header>
    ${steps}<section class="card setup">${body}</section>
    <div class="row between">${ny.step > 0 ? '<button class="btn ghost" data-act="ny-back">Back</button>' : '<a class="btn ghost" href="#/home" data-act="ny-cancel">Cancel</a>'}
      ${ny.step < NY_STEPS.length - 1 ? `<button class="btn" data-act="ny-next">Next: ${NY_STEPS[ny.step + 1]}</button>` : ''}</div>`;
}

async function finishNY() {
  readNYInputs();
  const ny = S.ny;
  const Y = ny.Y;
  const h2 = nyApplied(ny);
  const moved = bucketsOn() ? 0 : Math.max(0, num(ny.moved) || 0);
  const pairs = [
    [['categories'], h2.categories], [['bills'], h2.bills], [['usual'], h2.usual || {}], [['usualChanges'], h2.usualChanges],
    [['savings', 'goalMin'], ny.goals.goalMin], [['savings', 'goalMax'], ny.goals.goalMax],
    [['savings', 'hysaDone', String(Y - 1)], moved || 0.01], [['nyDone', String(Y)], Date.now()],
  ];
  for (const ym of nyMonths(Y)) pairs.push([['plans', ym], h2.plans[ym]]);
  if (moved) pairs.push([['savings', 'hysa'], round2((Number(H().savings.hysa) || 0) + moved)]);
  await B.setH(pairs);
  if (moved) await setSavings(round2((Number(H().savings.actual) || 0) - moved), `Year-end move to HYSA (${Y - 1})`, 'hysa');
  S.ny = null;
  S.year = Y;
  location.hash = '#/year';
  confetti();
  toast(`${Y} is set up 🎉`);
}

/* ---------- Backup / export ---------- */

// Hand a file to the person: the iPhone share sheet (Save to Files, AirDrop, email) when
// it's available, otherwise a normal download.
async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const csvCell = v => { const t = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function exportCSV() {
  await loadAllPurchases();
  const rows = [['Date', 'Store', 'Category', 'Amount', 'Tags', 'Note', 'Spread (months)', 'Logged by', 'Source', 'Bank confirmed']];
  for (const p of [...S.purchases].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const c = catById(p.cat);
    rows.push([p.date, p.store || '', c ? c.name : 'Uncategorized', (Number(p.amount) || 0).toFixed(2), (p.tags || []).join('; '), p.note || '',
      p.spread || 1, p.byName || '', p.src === 'import' ? 'Imported' : 'Logged', p.bankConfirmed ? 'Yes' : '']);
  }
  await saveFile(`family-finances-purchases-${D.today()}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

async function exportJSON() {
  await loadAllPurchases();
  const data = { app: 'Family Finances', exportedAt: new Date().toISOString(), household: H(), months: S.months, purchases: S.purchases.map(({ part, ...p }) => p) };
  await saveFile(`family-finances-backup-${D.today()}.json`, JSON.stringify(data, null, 1), 'application/json');
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

  ${fold('cats', 'Categories', money(catTotal), `${catsEditHtml()}`)}

  ${fold('bills', 'Bills', money(billTotal), `${billsEditHtml()}`)}

  ${fold('tags', 'Stores & tags', '', `<h3>Stores</h3><div class="chips">${(h.stores || []).map(s => `<span class="chip on">${esc(s)} <button class="chip-x" data-act="list-del" data-kind="stores" data-v="${esc(s)}" aria-label="Remove">×</button></span>`).join('')}</div>
    <div class="add-row"><input id="stores-new" placeholder="Add a store"><button class="btn small" data-act="list-add" data-kind="stores">Add</button></div>
    <h3>Tags</h3><p class="small muted">For tracking things inside a category — like Diapers (in Twins) or Eating out (in Food).</p>
    <div class="chips">${(h.tags || []).map(s => `<span class="chip on">${esc(s)} <button class="chip-x" data-act="list-del" data-kind="tags" data-v="${esc(s)}" aria-label="Remove">×</button></span>`).join('')}</div>
    <div class="add-row"><input id="tags-new" placeholder="Add a tag"><button class="btn small" data-act="list-add" data-kind="tags">Add</button></div>`)}

  ${monthlyTotalCard()}

  <button class="card menu-row" data-act="tour-start"><span><b>How does it work?</b><span class="small muted">A quick tour of each page</span></span><span class="chev">›</span></button>
  <a class="card menu-row" href="#/settings/setup"><span><b>Setup</b><span class="small muted">Your name, people & income, features, how you track spending, savings goals, household</span></span><span class="chev">›</span></a>`;
}

const trackHelp = mode => ({
  log: 'Tap + Log after each purchase. Quick, and you always know where you stand.',
  import: 'Download your bank’s transactions (CSV) every week or so and import them — the app sorts them into categories and learns your stores.',
  both: 'Log purchases as you go, and import your bank file every week or so to catch anything you missed. Purchases you already logged are matched and marked ✓ bank — never added twice.',
}[mode]);

// Category and bill editors (Settings, and the first-time walkthrough).
function catsEditHtml(intro = true) {
  const h = H();
  return `${intro ? '<p class="small muted">Normal monthly budgets. Trim a single month during setup.</p>' : ''}
    ${h.categories.map((c, i) => `<div class="edit-row">
      <button class="cat-ic-btn" data-act="cat-icon" data-id="${esc(c.id)}" aria-label="Icon for ${esc(c.name)}">${catBadge(c.id, 34)}</button>
      <input class="grow" data-ch="cat" data-id="${esc(c.id)}" data-f="name" value="${esc(c.name)}" aria-label="Name">
      <input class="mini" data-ch="cat" data-id="${esc(c.id)}" data-f="budget" inputmode="decimal" value="${esc(c.budget)}" aria-label="Budget">
      <button class="x small" data-act="cat-up" data-id="${esc(c.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
      <button class="x small" data-act="cat-del" data-id="${esc(c.id)}" aria-label="Remove">×</button></div>`).join('')}
    <div class="line subtotal"><span>Categories total</span><b>${money(h.categories.reduce((a, c) => a + (Number(c.budget) || 0), 0))}</b></div>
    <div class="add-row"><input id="cat-name" placeholder="New category"><input id="cat-amt" inputmode="decimal" placeholder="$"><button class="btn small" data-act="cat-add">Add</button></div>`;
}
function billsEditHtml(intro = true) {
  const h = H();
  return `${intro ? '<p class="small muted">Automatic payments: due day, name, amount. Schedule a change when an amount is going up or down.</p>' : ''}
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
    <div class="add-row"><input id="bill-day" class="mini" inputmode="numeric" placeholder="Day"><input id="bill-name" placeholder="New bill"><input id="bill-amt" class="mini" inputmode="decimal" placeholder="$"><button class="btn small" data-act="bill-add">Add</button></div>`;
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
  setTimeout(() => loadAllPurchases().catch(e => console.warn('backup preload', e)), 0);
  return `<header class="hero small-hero ink-title"><a class="back" href="#/settings">‹ Settings</a><h1>Setup</h1>
    <a class="gear" href="#/settings/look" aria-label="Appearance">${icons.gallery}</a></header>

  <section class="card"><h2>You</h2>
    <label class="field"><span class="label">Your name</span><input data-ch="myname" value="${esc(myName())}"></label>
  </section>
  <section class="card"><h2>People & usual income</h2>
    ${Calc.earners(h).map(e => `<div class="edit-row"><input class="grow" data-ch="earner" data-id="${esc(e.id)}" value="${esc(e.name)}" aria-label="Name">${Calc.earners(h).length > 1 ? `<button class="x small" data-act="person-del" data-id="${esc(e.id)}" aria-label="Remove">×</button>` : ''}</div>`).join('')}
    <button class="linkish small" data-act="person-add">+ Add a person</button>
    <h3>Usual monthly income</h3>
    <div class="two">${Calc.earners(h).map(e => `<label class="field"><span class="label">${esc(e.name)}</span><input data-ch="usual" data-f="${esc(e.id)}" inputmode="decimal" value="${esc((h.usual || {})[e.id])}" placeholder="$"></label>`).join('')}</div>
    <p class="small muted">Used on the Year tab for any month you haven’t filled in (shown as “usual”). Type a real amount on a month and it takes over.</p>
    ${usualChangesHtml()}
  </section>
  <section class="card"><h2>Features</h2>
    ${[['buckets', 'Savings buckets', 'Give every savings dollar a job: buckets with goals, a % of each month’s extra, and spending history. Shows on the Year tab.'],
      ['overview', 'Overview page', 'Checking, bills and the live Savings/Excess on the $ page. Turn off to keep the $ page to just Budgets.'],
      ['payInChecking', 'Paychecks land in checking', 'For paychecks that go straight into this checking account during the month (they’re for next month). Check each one off on Overview when it arrives so it’s set aside.'],
      ['habits', 'Habits page', 'No-spend days, streaks and habit trackers. Turn off to make the first tab Breakdown (where your money went, plus search).']].map(([k, l, d]) => {
      const on = onByDefault(k);
      return `<div class="line feature"><span><b>${l}</b><span class="small muted">${d}</span></span><button class="switch ${on ? 'on' : ''}" data-act="feature" data-k="${k}" role="switch" aria-checked="${on}" aria-label="${l}"><i></i></button></div>`;
    }).join('')}
  </section>
  <section class="card"><h2>How we track spending</h2>
    <div class="seg">${[['log', 'Log'], ['import', 'Import'], ['both', 'Both']].map(([k, l]) => `<button class="${(h.trackMode || 'log') === k ? 'on' : ''}" data-act="track" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="small muted">${trackHelp(h.trackMode || 'log')}</p>
    ${Object.keys(h.rules || {}).length ? `<details class="small"><summary>Store rules for imports (${Object.keys(h.rules).length})</summary>
      ${Object.entries(h.rules).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])).map(([k, r]) => `<div class="edit-row"><span class="grow">${esc(r.name || k)}${r.tags && r.tags.length ? ` <span class="small muted">· ${r.tags.map(esc).join(', ')}</span>` : ''}</span>
        <select data-ch="rule" data-k="${esc(k)}">${h.categories.map(c => `<option value="${esc(c.id)}" ${r.action === 'cat' && r.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="ask" ${r.action === 'ask' ? 'selected' : ''}>Ask each time</option>${r.action === 'pay' || payInChecking() ? `<option value="pay" ${r.action === 'pay' ? 'selected' : ''}>Paycheck</option>` : ''}${r.action === 'bill' ? (h.bills || []).map(b => `<option value="bill:${esc(b.id)}" ${r.billId === b.id ? 'selected' : ''}>Bill: ${esc(b.name)}</option>`).join('') : ''}<option value="skip" ${r.action === 'skip' ? 'selected' : ''}>Skip</option></select>
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
  <section class="card"><h2>Month-end reminder</h2>
    <p class="small muted">When the “Plan next month” banner shows on the $ page. (A small 📋 icon is there all of the last week, and “Start next month” shows the evening of the last day.)</p>
    <div class="seg">${[['friday', 'Last Friday'], ['last3', 'Last 3 days'], ['day', 'Pick a day']].map(([k, l]) => { const m = H().setupRemind || 'friday'; const on = k === 'day' ? /^\d+$/.test(m) : m === k; return `<button class="${on ? 'on' : ''}" data-act="remind" data-v="${k === 'day' ? (/^\d+$/.test(m) ? m : '25') : k}">${l}</button>`; }).join('')}</div>
    ${/^\d+$/.test(H().setupRemind || '') ? `<label class="field"><span class="label">Starting on day</span><input data-ch="remind-day" inputmode="numeric" value="${esc(H().setupRemind)}"></label>` : ''}
    <p class="small muted">This month: from ${D.name(D.curYm())} ${D.ordinal(setupRemindDay(D.curYm()))}.</p>
  </section>

  <section class="card"><h2>Backup</h2>
    <p class="small muted">Download a copy of your data to keep in Files, iCloud or email.</p>
    <div class="stack"><button class="btn ghost full" data-act="export-csv">Download purchases (spreadsheet)</button>
    <button class="btn ghost full" data-act="export-json">Download everything (full backup)</button></div>
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
  const tp = themePref();
  return `<header class="hero small-hero ink-title"><a class="back" href="#/settings">‹ Settings</a><h1>Appearance</h1></header>

  <section class="card"><h2>Light or dark</h2>
    <div class="seg">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match phone']].map(([k, l]) => `<button class="${tp === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="small muted">Just for this phone — everyone in the household can pick their own.</p>
  </section>

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

/* ---------- press-and-hold to reorder savings buckets and habit goals ---------- */

(() => {
  let hold = null;
  const GAP = 10;
  const point = e => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  function begin(item, y) {
    const sel = item.matches('.card.goal[data-key]') ? '.card.goal[data-key]' : '.bucket[data-id]';
    const items = [...item.parentElement.querySelectorAll(sel)];
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
    // Swallow the click that follows the drop so the bucket (or goal) doesn't open.
    const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
    if (d.target !== d.idx && d.item.matches('.card.goal[data-key]')) {
      const keys = d.items.map(el => el.dataset.key);
      const [k] = keys.splice(d.idx, 1);
      keys.splice(d.target, 0, k);
      await saveHabits({ order: keys });
    } else if (d.target !== d.idx) {
      const list = [...(H().buckets || [])];
      const [moved] = list.splice(d.idx, 1);
      list.splice(d.target, 0, moved);
      await B.setH([[['buckets'], list]]);
    } else render();
  }
  function down(e) {
    const item = e.target.closest('.bucket[data-id], .card.goal[data-key]');
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
  'l-split': () => { syncLog(); const L = S.log; L.splits = [{ amount: num(L.amount) || 0, cat: L.cat || '' }, { amount: 0, cat: '' }]; splitFill(logSplitRow(L)); redrawLog(); },
  'l-split-add': () => { syncLog(); const L = S.log; L.splits.forEach(sp => { sp.touched = true; }); L.splits.push({ amount: 0, cat: '' }); splitFill(logSplitRow(L)); redrawLog(); },
  'l-split-del': el => { syncLog(); const L = S.log; L.splits.splice(Number(el.dataset.j), 1); splitFill(logSplitRow(L)); redrawLog(); },
  'l-split-off': () => { syncLog(); const L = S.log; L.cat = (L.splits.find(sp => sp.cat) || {}).cat || L.cat; L.splits = null; redrawLog(); },
  'l-del': async () => {
    if (!(await ask('Delete this purchase?', 'Delete'))) return;
    const id = S.log.id;
    closeSheet();
    await B.deletePurchase(id);
    S.older = S.older.filter(p => p.id !== id); mergePurchases(); render();
    toast('Deleted');
  },

  'hab-m': el => { S.habYm = D.addMonths(S.habYm || D.curYm(), Number(el.dataset.d)); render(); },
  'hab-settings': () => { if (sheetOpen()) { closeSheet(); setTimeout(openHabitSettings, 200); } else openHabitSettings(); },
  'hab-cat': el => { const v = el.dataset.v; const c = S.hab; c.cats = c.cats.includes(v) ? c.cats.filter(x => x !== v) : [...c.cats, v]; redrawHab(); },
  'hab-tag': el => { const v = el.dataset.v; const c = S.hab; c.tags = c.tags.includes(v) ? c.tags.filter(x => x !== v) : [...c.tags, v]; redrawHab(); },
  'hab-store': el => { const v = el.dataset.v; const c = S.hab; c.stores = c.stores.includes(v) ? c.stores.filter(x => x !== v) : [...c.stores, v]; redrawHab(); },
  'hab-store-add': () => {
    const v = $('#hab-store-new').value.trim();
    if (!v) { toast('Type a store'); return; }
    const c = S.hab;
    if (!c.stores.some(x => x.toLowerCase() === v.toLowerCase())) c.stores = [...c.stores, v];
    redrawHab();
  },
  'hab-save': async () => { const hb = S.hab; closeSheet(); await saveHabits({ cats: hb.cats, tags: hb.tags, stores: hb.stores }); toast('Saved'); },
  'goal-add': () => openGoalAdd(),
  'goal-type': el => { S.gadd.type = el.dataset.v; $('#sheet').innerHTML = goalAddHtml(); },
  'goal-kind': el => { S.gadd.kind = el.dataset.v; S.gadd.v = ''; $('#sheet').innerHTML = goalAddHtml(); },
  'goal-pick': el => { S.gadd.v = S.gadd.v === el.dataset.v ? '' : el.dataset.v; $('#sheet').innerHTML = goalAddHtml(); },
  'goal-save': async () => {
    const g = S.gadd;
    if (g.type === 'avoid') {
      const kind = g.kind || 'store';
      const raw = (($('#hab-v') && $('#hab-v').value.trim()) || g.v || '').trim();
      if (!raw) { toast(kind === 'store' ? 'Pick or type a store' : kind === 'tag' ? 'Pick or type a tag' : 'Pick a category'); return; }
      const cat = kind === 'cat' ? H().categories.find(x => x.name.toLowerCase() === raw.toLowerCase()) : null;
      if (kind === 'cat' && !cat) { toast('Pick one of your categories'); return; }
      const emoji = kind === 'cat' ? (cat.customEmoji || cat.emoji || '✨') : /eat|food|restaurant/i.test(raw) ? '🍔' : /amazon|target|shop/i.test(raw) ? '🛍️' : /coffee|starbucks/i.test(raw) ? '☕' : '✨';
      closeSheet();
      S.gadd = { type: 'avoid', kind };
      await saveHabits({ trackers: [...habitCfg().trackers, { id: newId(), kind, v: cat ? cat.id : raw, name: `No ${cat ? cat.name : raw}`, emoji }] });
    } else {
      const n = Math.round(num($('#g-n').value) || 0);
      if (n < 1) { toast('Type a number of days'); return; }
      closeSheet();
      await saveHabits(g.type === 'month' ? { goal: n } : { streakGoal: n });
    }
    toast('Goal added');
  },
  'goal-edit': el => openGoalEdit(el),
  'goal-update': async () => { const n = Math.round(num($('#g-n').value) || 0); if (n < 1) { toast('Type a number of days'); return; } const k = S.gedit.k; const hb = S.hab; closeSheet(); await saveHabits({ [k]: n, cats: hb.cats, tags: hb.tags, stores: hb.stores }); },
  'goal-del': async () => {
    const { k, id } = S.gedit;
    if (!(await ask('Remove this goal?', 'Remove'))) return;
    closeSheet();
    await saveHabits(k === 'trk' ? { trackers: habitCfg().trackers.filter(t => t.id !== id) } : { [k]: 0 });
  },
  'remind': async el => { await B.setH([[['setupRemind'], el.dataset.v]]); },
  theme: el => { try { localStorage.setItem('ne-theme', el.dataset.v); } catch (e) {} applyLook(); render(); },
  'tour-start': () => startTour(),
  'tour-next': () => { S.tour.i++; tourGo(); },
  'tour-back': () => { S.tour.i--; tourGo(); },
  'tour-end': async () => { await endTour(); location.hash = '#/home'; render(true); },
  'export-csv': () => exportCSV().catch(e => { console.error(e); toast('Couldn’t make the file'); }),
  'export-json': () => exportJSON().catch(e => { console.error(e); toast('Couldn’t make the file'); }),
  'to-uncat': () => { const c = $('.uncat-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
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
    openSheet(`<div class="sheet-head"><h2 class="cat-name">${catBadge(c.id, 30)}${esc(c.name)}</h2><button class="x" data-act="close">×</button></div>
      <p class="small muted">${D.name(ym)} · ${money(c.used)} of ${money(c.budget)}${c.over ? ` · over by ${money(c.used - c.budget)}` : ` · ${money(c.left)} left`}</p>
      ${list.length ? list.map(p => purchaseRow(p)).join('') : '<p class="muted">Nothing in this category yet this month.</p>'}
      <p class="small muted">Tap a purchase to change its category, tags or note.</p>`);
  },
  'imp-cancel': () => { S.imp = null; },
  'imp-skipped': () => { S.imp.showSkipped = !S.imp.showSkipped; render(true); },
  'imp-untag': el => { const r = S.imp.rows[el.dataset.i]; r.tags = r.tags.filter(t => t !== el.dataset.v); render(true); },
  'imp-split': el => { const r = S.imp.rows[el.dataset.i]; r.splits = [{ amount: r.amount, cat: r.cat && !['skip', 'uncat'].includes(r.cat) ? r.cat : '' }, { amount: 0, cat: '' }]; render(true); },
  'imp-split-add': el => {
    const r = S.imp.rows[el.dataset.i];
    r.splits.forEach(sp => { sp.touched = true; });
    r.splits.push({ amount: 0, cat: '' });
    splitFill(r);
    render(true);
  },
  'imp-split-del': el => { const r = S.imp.rows[el.dataset.i]; r.splits.splice(Number(el.dataset.j), 1); splitFill(r); render(true); },
  'imp-split-off': el => { S.imp.rows[el.dataset.i].splits = null; render(true); },
  'imp-save': () => saveImport(),
  'dp-pick': el => dpSet(el, el.dataset.v, D.ymOf(el.dataset.v), false),
  'dp-day': el => dpSet(el, el.dataset.v, null, false),
  'dp-open': el => { const inp = el.closest('.dp').querySelector('input[type="hidden"]'); dpSet(el, null, D.ymOf(inp.value), inp.dataset.open !== '1'); },
  'dp-nav': el => { const inp = el.closest('.dp').querySelector('input[type="hidden"]'); dpSet(el, null, D.addMonths(inp.dataset.view, Number(el.dataset.d)), true); },
  'imp-logged': () => { S.imp.showLogged = !S.imp.showLogged; render(true); },
  'imp-unmatch': el => { const r = S.imp.rows[Number(el.dataset.i)]; Object.assign(r, { status: 'review', matchId: null, firstNeeds: !r.cat, reason: r.cat ? 'Added even though it looked logged' : 'Pick a category' }); render(true); },
  'imp-which-undo': el => { S.imp.rows[Number(el.dataset.i)].pick = ''; render(true); },
  'imp-close': el => { const r = S.imp.rows[Number(el.dataset.i)]; r.closeSame = false; r.close = null; r.firstNeeds = !r.cat; render(true); },
  track: async el => {
    const v = el.dataset.v;
    if (v === (H().trackMode || 'log')) return;
    const ok = await ask(v === 'import'
      ? 'Switch to import only? + Log becomes Import. Purchases you’ve already logged stay — just don’t import the same days you logged by hand.'
      : v === 'both' ? 'Switch to both? Keep logging with + Log, and import every week or so — anything you already logged is matched, not added twice.'
      : 'Switch back to logging only? Imported purchases stay.', 'Switch');
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
      await B.setMonthField(ym, ['bills', b.id], paid ? { paid: true, at: stampNow(), manual: true } : B.DEL);
      return;
    }
    // Autopay: if the tap lands where the due date would have it anyway, go back
    // to automatic (no "set by hand" note). Otherwise remember it was set by
    // hand, paid on its due date if that's passed (so checking isn't charged twice).
    const auto = Date.now() >= st.due;
    await B.setMonthField(ym, ['bills', b.id], paid === auto ? B.DEL : { paid, at: Math.min(stampNow(), st.due), manual: true });
  },
  // It was already out of (or in) checking when the balance was typed: stop counting it again.
  'since-pre': async el => {
    const { kind, id } = el.dataset;
    const ym = homeYm();
    if (kind === 'bill') { await B.setMonthField(ym, ['bills', id], { pre: true }); return; }
    const at = ((S.months[ym] || {}).checking || {}).at || 0;
    const key = kind === 'other' ? 'paidAt' : 'receivedAt';
    await monthList(kind, arr => arr.map(o => (o.id === id ? { ...o, [key]: at } : o)));
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
    const on = !onByDefault(k);
    await B.setH([[['features', k], on]]);
  },
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
  cover: el => openCover(el.dataset.cat),
  'cover-fill': el => {
    const C = S.cover;
    const x = coverCats().find(k => k.id === el.dataset.id);
    if (!x) return;
    delete C.amt[x.id];
    const rest = round2(C.need - coverTotal());
    if (rest > 0.004) C.amt[x.id] = round2(Math.min(rest, x.left));
    redrawCover();
  },
  'cover-save': async () => {
    const C = S.cover;
    if (!C || coverBad() || coverTotal() <= 0.004) return;
    const total = coverTotal();
    const ym = homeYm();
    const cats = coverCats();
    const bud = id => (cats.find(x => x.id === id) || {}).budget || 0;
    const budgets = { [C.cat]: round2(bud(C.cat) + total) };
    const covers = [...((S.months[ym] || {}).covers || [])];
    for (const [id, v] of Object.entries(C.amt)) {
      if (!(v > 0.004)) continue;
      budgets[id] = round2(bud(id) - v);
      covers.push({ id: newId(), to: C.cat, from: id, amount: round2(v), at: Date.now() });
    }
    closeSheet();
    S.cover = null;
    await B.setMonth(ym, { budgets });
    await B.setMonthField(ym, ['covers'], covers);
    toast(`Covered ${money(total)} for ${(catById(C.cat) || {}).name || 'that category'}`);
  },
  'cover-undo': async el => {
    const ym = homeYm();
    const M = S.months[ym] || {};
    const x = (M.covers || []).find(k => k.id === el.dataset.id);
    if (!x) return;
    const cats = coverCats();
    const bud = id => (cats.find(k => k.id === id) || {}).budget || 0;
    const budgets = { [x.to]: round2(bud(x.to) - x.amount) };
    if (catById(x.from)) budgets[x.from] = round2(bud(x.from) + x.amount);
    await B.setMonth(ym, { budgets });
    await B.setMonthField(ym, ['covers'], (M.covers || []).filter(k => k.id !== x.id));
    toast(`Undid: ${money(x.amount)} back to ${(catById(x.from) || {}).name || 'that category'}`);
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
  'p-oadd': () => planAdd('other', '#p-oname', '#p-oamt'),
  'p-xadd': () => planAdd('extra', '#p-xname', '#p-xamt'),
  'p-del': el => { const k = el.dataset.kind; S.plan[k] = S.plan[k].filter(o => o.id !== el.dataset.id); $(`#p-${k}`).innerHTML = planListHtml(k); },
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


  'bd-m': el => { S.bdYm = D.addMonths(S.bdYm || homeYm(), Number(el.dataset.d)); render(); ensureLoaded(S.bdYm).catch(e => console.warn('older purchases', e)); },
  'bd-tab': el => { S.bdTab = el.dataset.v; render(); },
  'bd-item': el => openItem(el.dataset.key),
  'bd-go': el => { S.bdYm = el.dataset.ym; },
  'chart-tip': el => {
    document.querySelectorAll('.chart .col').forEach(c => c.classList.remove('tip'));
    el.classList.add('tip');
    $('#chart-tip').textContent = el.dataset.tip;
  },

  'd-next': () => { readDraftInputs(); const d = S.draft; d.pos++; d.step = d.seq[d.pos]; window.scrollTo(0, 0); render(); },
  'd-back': () => { readDraftInputs(); const d = S.draft; d.pos--; d.step = d.seq[d.pos]; window.scrollTo(0, 0); render(); },
  'd-plan-save': () => savePlanned(false),
  'd-plan-start': () => savePlanned(true),
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
  'wz-next': () => { const c = $('#wz-checking'); if (c) S.wz.checking = c.value; S.wz.step++; window.scrollTo(0, 0); render(true); },
  'wz-back': () => { const c = $('#wz-checking'); if (c) S.wz.checking = c.value; S.wz.step--; window.scrollTo(0, 0); render(true); },
  'wz-x-add': el => {
    const k = el.dataset.kind;
    const name = $(`#wz-${k}-name`).value.trim();
    const amount = num($(`#wz-${k}-amt`).value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    S.wz[k].push({ id: newId(), name, amount: Math.abs(amount) });
    $(`#wz-${k}-name`).value = ''; $(`#wz-${k}-amt`).value = '';
    render(true);
  },
  'wz-x-del': el => { const k = el.dataset.kind; S.wz[k] = S.wz[k].filter(o => o.id !== el.dataset.id); render(true); },
  'wz-track': async el => { await B.setH([[['trackMode'], el.dataset.v]]); },
  'wz-cat': async el => { await B.setH([[['categories'], [...H().categories, { id: newId(), name: el.dataset.n, emoji: el.dataset.e, budget: 0 }]]]); },
  'wz-finish': () => { S.wz.checking = $('#wz-checking').value; finishWelcome(false); },
  'wz-skip': async () => { if (await ask('Skip setup for now? You can fill everything in later in Settings.', 'Skip')) finishWelcome(true); },
  'ny-next': () => { readNYInputs(); S.ny.step++; window.scrollTo(0, 0); render(); },
  'ny-back': () => { readNYInputs(); S.ny.step--; window.scrollTo(0, 0); render(); },
  'ny-cancel': () => { S.ny = null; },
  'ny-finish': () => finishNY(),
  'ny-kind': el => { readNYInputs(); S.ny.addKind = el.dataset.v; render(true); },
  'ny-add': () => {
    readNYInputs();
    const name = $('#ny-o-name').value.trim();
    const amount = num($('#ny-o-amt').value);
    if (!name || !amount) { toast('Add a name and an amount'); return; }
    S.ny.plans[S.ny.addMonth][S.ny.addKind].push({ id: newId(), name, amount });
    $('#ny-o-name').value = ''; $('#ny-o-amt').value = '';
    render(true);
  },
  'ny-sug': el => {
    readNYInputs();
    const g = nySuggestions(S.ny)[Number(el.dataset.i)];
    if (g) S.ny.plans[g.ym][g.kind].push({ id: newId(), name: g.name, amount: g.amount });
    render(true);
  },
  'ny-del': el => { readNYInputs(); const { ym, kind, id } = el.dataset; S.ny.plans[ym][kind] = S.ny.plans[ym][kind].filter(o => o.id !== id); render(true); },
  'ny-bc-add': () => {
    readNYInputs();
    const amount = num($('#ny-bc-a').value);
    if (amount === null) { toast('Type the new amount'); return; }
    const bill = $('#ny-bc-bill').value; const from = $('#ny-bc-m').value;
    S.ny.billChanges = [...S.ny.billChanges.filter(c => !(c.bill === bill && c.from === from)), { id: newId(), bill, from, amount }];
    $('#ny-bc-a').value = '';
    render(true);
  },
  'ny-bc-del': el => { readNYInputs(); S.ny.billChanges = S.ny.billChanges.filter(c => c.id !== el.dataset.id); render(true); },
  'ny-uc-add': () => {
    readNYInputs();
    const amount = num($('#ny-uc-a').value);
    if (amount === null) { toast('Type the new amount'); return; }
    const earner = $('#ny-uc-who') ? $('#ny-uc-who').value : Calc.earners(H())[0].id; const from = $('#ny-uc-m').value;
    S.ny.usualChanges = [...S.ny.usualChanges.filter(c => !(c.earner === earner && c.from === from)), { id: newId(), earner, from, amount }];
    $('#ny-uc-a').value = '';
    render(true);
  },
  'ny-uc-del': el => { readNYInputs(); S.ny.usualChanges = S.ny.usualChanges.filter(c => c.id !== el.dataset.id); render(true); },
  'd-pre': el => { readDraftInputs(); const d = S.draft; d.pre = d.pre || {}; d.pre[el.dataset.id] = !d.pre[el.dataset.id]; render(true); },
  'wz-pre': el => { const c = $('#wz-checking'); if (c) S.wz.checking = c.value; S.wz.pre = S.wz.pre || {}; S.wz.pre[el.dataset.id] = !S.wz.pre[el.dataset.id]; render(true); },
  'd-showmove': () => { readDraftInputs(); S.draft.showMove = true; render(); },

  'cat-add': async () => {
    const name = $('#cat-name').value.trim();
    if (!name) return;
    const cats = [...H().categories, { id: newId(), name, budget: num($('#cat-amt').value) || 0 }];
    await B.setH([[['categories'], cats]]);
  },
  'cat-del': async el => {
    const c = catById(el.dataset.id);
    if (!(await ask(`Remove ${esc(c.name)}? Purchases already logged stay in your history.`, 'Remove'))) return;
    await B.setH([[['categories'], H().categories.filter(x => x.id !== c.id)]]);
  },
  'cat-icon': el => {
    const c = catById(el.dataset.id);
    if (!c) return;
    const cur = c.icon && CAT_ICONS[c.icon] ? c.icon : '';
    const auto = catIconKey({ ...c, icon: '' });
    S.sheet = 'soft';
    const ce = c.customEmoji || '';
    const autoColor = (H().categories.findIndex(x => x.id === c.id)) % PIE_N;
    const curColor = Number.isInteger(c.color) ? c.color : -1;
    openSheet(`<div class="sheet-head"><h2>Icon & color</h2><button class="x" data-act="close" aria-label="Close">×</button></div>
      <p class="small muted">Shows everywhere ${esc(c.name)} appears.</p>
      <span class="label">Color</span>
      <div class="swatches">${Array.from({ length: PIE_ALL }, (_, n) => `<button class="swatch ${curColor === n ? 'on' : ''}" style="background:var(--pie-${n})" data-act="cat-color" data-id="${esc(c.id)}" data-v="${n}" aria-label="Color ${n + 1}"></button>`).join('')}
        <button class="swatch auto ${curColor < 0 ? 'on' : ''}" style="--sw:var(--pie-${autoColor})" data-act="cat-color" data-id="${esc(c.id)}" data-v="" aria-label="Automatic color"><span class="small">Auto</span></button></div>
      <span class="label">Icon</span>
      <div class="ce-row ${ce ? 'on' : ''}" style="--c:${catColor(c.id)}"><input id="cat-ce" class="emoji-in" value="${esc(ce)}" placeholder="🙂" aria-label="Your own emoji" enterkeyhint="done">
        <span class="grow small">Use your own emoji<span class="muted"> — any emoji from your keyboard, shown in color</span></span>
        <button class="btn small" data-act="cat-ce-save" data-id="${esc(c.id)}">Use</button></div>
      <div class="icon-grid" style="--c:${catColor(c.id)}">
        <button class="icon-pick ${cur || ce ? '' : 'on'}" data-act="cat-icon-pick" data-id="${esc(c.id)}" data-v=""><span class="cat-badge" style="background:var(--c)">${catIconSvg(auto, 20)}</span><span class="small">Automatic</span></button>
        ${Object.keys(CAT_ICONS).filter(k => k !== 'question').map(k => `<button class="icon-pick ${cur === k && !ce ? 'on' : ''}" data-act="cat-icon-pick" data-id="${esc(c.id)}" data-v="${k}"><span class="cat-badge" style="background:var(--c)">${catIconSvg(k, 20)}</span><span class="small">${esc(CAT_ICONS[k][0])}</span></button>`).join('')}
      </div>`);
  },
  'cat-icon-pick': async el => {
    const v = el.dataset.v;
    const cats = H().categories.map(c => {
      if (c.id !== el.dataset.id) return c;
      const { icon, customEmoji, ...rest } = c;
      return v ? { ...rest, icon: v } : rest;
    });
    closeSheet();
    await B.setH([[['categories'], cats]]);
  },
  'cat-color': async el => {
    const v = el.dataset.v;
    const cats = H().categories.map(c => {
      if (c.id !== el.dataset.id) return c;
      const { color, ...rest } = c;
      return v === '' ? rest : { ...rest, color: Number(v) };
    });
    await B.setH([[['categories'], cats]]);
    // Redraw the sheet in the new color once the saved change has come back
    const want = v === '' ? undefined : Number(v);
    for (let i = 0; i < 20 && (catById(el.dataset.id) || {}).color !== want; i++) await new Promise(r => setTimeout(r, 50));
    if (document.querySelector('.swatches')) acts['cat-icon']({ dataset: { id: el.dataset.id } });
  },
  'cat-ce-save': async el => {
    const v = ($('#cat-ce').value || '').trim();
    const cats = H().categories.map(c => {
      if (c.id !== el.dataset.id) return c;
      const { customEmoji, ...rest } = c;
      return v ? { ...rest, customEmoji: [...v].slice(0, 8).join('') } : rest;
    });
    closeSheet();
    await B.setH([[['categories'], cats]]);
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
  'uc-add': async () => {
    const who = $('#uc-who') ? $('#uc-who').value : Calc.earners(H())[0].id;
    const from = $('#uc-m').value;
    const amount = num($('#uc-a').value);
    if (!from || amount === null) { toast('Pick a month and an amount'); return; }
    const list = [...(H().usualChanges || []).filter(c => !(c.earner === who && c.from === from)), { id: newId(), earner: who, from, amount }];
    await B.setH([[['usualChanges'], list]]);
  },
  'uc-del': async el => { await B.setH([[['usualChanges'], (H().usualChanges || []).filter(c => c.id !== el.dataset.id)]]); },
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
    r.remember = false;
    if (r.cat === 'income') r.tags = [];
    render(true);
  },
  'imp-tag': async el => {
    const r = S.imp.rows[el.dataset.i];
    const v = el.value === '__new' ? await newTag() : el.value;
    if (v && !r.tags.includes(v)) r.tags.push(v);
    render(true);
  },
  'imp-which': el => {
    const r = S.imp.rows[el.dataset.i];
    r.pick = el.value;
    // Another charge that could only have been that logged purchase is new.
    const picked = new Set(S.imp.rows.filter(y => y.pick && y.pick !== 'new').map(y => y.pick));
    for (const y of S.imp.rows) if (y.which && !y.pick && y.which.every(x => picked.has(x.id))) y.pick = 'new';
    render(true);
  },
  'imp-bal': el => { S.imp.bal = el.value; },
  'imp-remember': el => { S.imp.rows[el.dataset.i].remember = el.checked; },
  'l-split-amt': el => { const L = S.log; Object.assign(L.splits[el.dataset.j], { amount: num(el.value) || 0, touched: true }); splitFill(logSplitRow(L)); redrawLog(); },
  'l-split-cat': el => { S.log.splits[el.dataset.j].cat = el.value; },
  'l-split-tag': async el => {
    const sp = S.log.splits[el.dataset.j];
    if (el.value === '__new') { const v = await newTag(); if (v) sp.tag = v; redrawLog(); return; }
    sp.tag = el.value;
  },
  'imp-split-amt': el => { const r = S.imp.rows[el.dataset.i]; Object.assign(r.splits[el.dataset.j], { amount: num(el.value) || 0, touched: true }); splitFill(r); render(true); },
  'imp-split-tag': async el => {
    const sp = S.imp.rows[el.dataset.i].splits[el.dataset.j];
    if (el.value === '__new') { const v = await newTag(); if (v) sp.tag = v; render(true); return; }
    sp.tag = el.value;
  },
  'imp-split-cat': el => { S.imp.rows[el.dataset.i].splits[el.dataset.j].cat = el.value; render(true); },
  rule: async el => {
    const rules = { ...(H().rules || {}) };
    const old = rules[el.dataset.k] || {};
    const v = el.value;
    rules[el.dataset.k] = v === 'skip' ? { ...old, action: 'skip' } : v === 'ask' ? { ...old, action: 'ask' } : v === 'pay' ? { ...old, action: 'pay' } : v.startsWith('bill:') ? { ...old, action: 'bill', billId: v.slice(5) } : { ...old, action: 'cat', cat: v };
    await B.setH([[['rules'], rules]]);
  },
  cover: el => { if (S.cover) { S.cover.amt[el.dataset.id] = Math.abs(num(el.value) || 0); refreshCoverSum(); } },
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
  'wz-sav': async el => { const v = num(el.value); if (v !== null) await setSavings(v, 'Starting balance'); },
  'remind-day': async el => { const n = Math.round(num(el.value) || 0); if (n >= 1 && n <= 31) await B.setH([[['setupRemind'], String(n)]]); },
  'ny-pick': el => { S.ny[el.dataset.f] = el.value; },
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
  if (e.target.matches('[data-ch="cover"]') && S.cover) {
    S.cover.amt[e.target.dataset.id] = Math.abs(num(e.target.value) || 0);
    refreshCoverSum();
  }
  if (e.target.id === 'pq') {
    S.pq = e.target.value.trim();
    refreshSearch();
    if (S.pq && S.loadedFrom > '2000-01-01') loadAllPurchases().then(refreshSearch).catch(err => console.warn('search', err));
  }
  // Splitting a logged purchase: same live "what's left" as imports (also when the total changes).
  if ((e.target.matches('[data-ch="l-split-amt"]') || e.target.id === 'l-amount') && S.log && S.log.splits) {
    const L = S.log;
    if (e.target.id === 'l-amount') L.amount = e.target.value;
    else Object.assign(L.splits[e.target.dataset.j], { amount: num(e.target.value) || 0, touched: true });
    const j = splitFill(logSplitRow(L));
    if (j !== null) { const box = $(`#sheet [data-ch="l-split-amt"][data-j="${j}"]`); if (box && box !== e.target) box.value = L.splits[j].amount; }
    const sum = $('#split-sum-log'); if (sum) sum.outerHTML = splitSumHtml({ i: 'log', ...logSplitRow(L) });
  }
  // Splitting an import: show what's left (and fill the next split) while typing.
  if (e.target.matches('[data-ch="imp-split-amt"]') && S.imp) {
    const r = S.imp.rows[e.target.dataset.i];
    Object.assign(r.splits[e.target.dataset.j], { amount: num(e.target.value) || 0, touched: true });
    const j = splitFill(r);
    if (j !== null) { const box = view.querySelector(`[data-ch="imp-split-amt"][data-i="${r.i}"][data-j="${j}"]`); if (box && box !== e.target) box.value = r.splits[j].amount; }
    const sum = $(`#split-sum-${r.i}`); if (sum) sum.outerHTML = splitSumHtml(r);
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

function householdScreen(msg = '') {
  $('#tabs').hidden = true;
  view.innerHTML = `<div class="auth"><img class="logo" src="icon-192.png" alt=""><h1>Welcome, ${esc(S.user.name || S.newName || '')}</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ''}
    <section class="card"><h2>Start a budget</h2><p class="small muted">We’ll walk through your income, budgets, bills and savings — about 5 minutes.</p>
      <button class="btn full" id="h-new">Start a new budget</button></section>
    <section class="card"><h2>Join with a code</h2><p class="small muted">If the other person already started, enter the code from their Settings.</p>
      <input id="h-code" placeholder="8-letter code" autocapitalize="characters"><button class="btn full ghost" id="h-join">Join</button></section>
    <p class="center small"><button class="linkish" id="h-out">Sign out</button></p></div>`;
  const name = S.user.name || S.newName || 'Me';
  $('#h-new').onclick = async () => { try { const id = await Store.createHousehold(name); openHousehold(id); } catch (e) { console.error(e); householdScreen(e.message); } };
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

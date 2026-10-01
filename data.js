/* Dates, money, starting data and every calculation the screens show.
   Nothing here touches the page or the database -- it takes plain objects
   (the household, the month docs, the purchases) and returns numbers.

   Words used throughout:
     ym        a month key, 'YYYY-MM'
     H         the household doc (settings, bills, savings, the year plan)
     M         one month doc (budgets, checking snapshot, bill checkmarks...)
     months    { ym: M }
     purchases [{ id, amount, cat, store, tags, note, date, spread, by, byName, t }] */

const D = (() => {
  const pad = n => String(n).padStart(2, '0');
  const dayStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayStr(new Date());
  const ymOf = s => (typeof s === 'string' ? s : dayStr(s)).slice(0, 7);
  const curYm = () => ymOf(new Date());
  const addMonths = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const SHORT = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const monthNum = ym => Number(ym.slice(5, 7));
  const yearOf = ym => Number(ym.slice(0, 4));
  const name = ym => MONTHS[monthNum(ym) - 1];
  const short = ym => SHORT[monthNum(ym) - 1];
  const label = ym => `${name(ym)} ${yearOf(ym)}`;
  const daysIn = ym => new Date(yearOf(ym), monthNum(ym), 0).getDate();
  // Midnight (this device's time) on day `day` of month ym, clamped to the month.
  const dueTime = (ym, day) => new Date(yearOf(ym), monthNum(ym) - 1, Math.min(day, daysIn(ym))).getTime();
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const niceDay = s => {
    const [y, m, d] = s.split('-').map(Number);
    return `${SHORT[m - 1]} ${d}`;
  };
  const daysLeft = ym => {
    if (ym !== curYm()) return null;
    return daysIn(ym) - new Date().getDate() + 1;
  };
  return { pad, dayStr, today, ymOf, curYm, addMonths, name, short, label, daysIn, dueTime,
    ordinal, niceDay, monthNum, yearOf, daysLeft, MONTHS };
})();

// "$1,234" for whole dollars, "$62.47" when there are cents. `always` forces cents.
function money(n, always) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const neg = v < 0;
  const abs = Math.abs(v);
  const cents = always || abs % 1 !== 0;
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return (neg ? '−$' : '$') + s;
}
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const Looks = {
  // Taken from the month headers in the Joint Account sheet (June and July are new).
  colors: {
    1: '#0B5394', 2: '#B5173B', 3: '#6AA84F', 4: '#741B47', 5: '#45B5C4', 6: '#E69138',
    7: '#3C78D8', 8: '#E8B923', 9: '#E07B6A', 10: '#F28C18', 11: '#9C5B3B', 12: '#A61C1C',
  },
  headings: ['Oswald', 'Bebas Neue', 'Playfair Display', 'Fredoka', 'Josefin Sans', 'Abril Fatface', 'Pacifico', 'Caveat'],
  bodies: ['Nunito', 'DM Sans', 'Lato', 'Quicksand', 'Poppins', 'Source Sans 3'],
};

// What the app starts with: the October checklist, the bills, the year plan
// (Aug-Dec from the 2026 tab) and the category budgets.
function seedHousehold(uid, name) {
  const at = new Date(2026, 8, 30, 15, 0).getTime(); // when the $4,029 balance was checked
  const household = {
    members: { [uid]: true },
    people: { [uid]: { name } },
    joinCode: '',
    created: Date.now(),
    categories: [
      { id: 'food', name: 'Food', budget: 1000, emoji: '🛒' },
      { id: 'home', name: 'Home', budget: 100, emoji: '🏠' },
      { id: 'pets', name: 'Pets', budget: 300, emoji: '🐾' },
      { id: 'activities', name: 'Activities/Other', budget: 200, emoji: '🎈' },
      { id: 'twins', name: 'Twins', budget: 200, emoji: '👶' },
    ],
    stores: ['Aldi', 'Costco', 'Target', 'Publix', 'Amazon', 'Walmart'],
    tags: ['Diapers', 'Wipes', 'Eating out', 'Meal boxes', 'Snacks', 'Millie Moon', 'Medical'],
    bills: [
      { id: 'rent', name: 'Rent - Demaris', amount: 1700, day: 1, changes: [] },
      { id: 'hca', name: 'HCA payment', amount: 75, day: 1, changes: [] },
      { id: 'loans', name: 'Federal Loans', amount: 90, day: 5, changes: [] },
      { id: 'ioniq', name: 'Ioniq payment', amount: 375, day: 5, changes: [] },
      { id: 'santafe', name: 'Santa Fe Payment', amount: 650, day: 11, changes: [] },
      { id: 'spotify', name: 'Spotify Family', amount: 20, day: 11, changes: [] },
      { id: 'statefarm', name: 'State Farm', amount: 161, day: 18, changes: [{ from: '2026-11', amount: 150 }] },
      { id: 'att', name: 'AT&T', amount: 135, day: 24, changes: [{ from: '2026-11', amount: 120 }] },
      { id: 'amazon', name: 'Amazon', amount: 15, day: 25, changes: [] },
    ],
    // Money family sends each month toward a bill; it rides along in checking
    // until that bill is paid.
    helpers: [
      { id: 'demaris', name: 'Demaris', amount: 31, bill: 'att' },
      { id: 'analisa', name: 'Analisa', amount: 102, bill: 'att' },
    ],
    savings: {
      actual: 2500, asOf: '2026-09-30', hysa: 0,
      floor: 5000, goalMin: 5000, goalMax: 10000,
      log: [{ t: at, amount: 2500, kind: 'set', note: 'Starting balance' }],
      hysaDone: {},
    },
    plans: {
      '2026-08': { nick: 3000, bella: 700, expenses: 4700, other: [], note: 'Nick started COFEMS', endBalance: 2500 },
      '2026-09': { nick: 4750, bella: 350, expenses: 4700, other: [{ id: 'o1', name: "Nick's birthday", amount: 200 }], endBalance: 2500 },
      '2026-10': { nick: 4750, bella: 700, expenses: 5000, other: [] },
      '2026-11': { nick: 5750, bella: 700, expenses: 5000, other: [], note: '$1K from training OT' },
      '2026-12': {
        nick: 4750, bella: 700, expenses: 5000, elevate: 3000, elevateToSavings: true,
        other: [{ id: 'o2', name: 'Xmas presents', amount: 1000 }, { id: 'o3', name: 'Personal property', amount: 400 }],
        note: 'Fall academy week',
      },
    },
    usual: { nick: 4750, bella: 700 },
    // Spending: 'log' (log as you go) or 'import' (weekly bank file).
    trackMode: 'log',
    imports: {},
    // Merchant rules for imports, keyed by Imp.keyOf(description).
    rules: {
      'henrico doctors hospital': { action: 'skip', note: 'HCA payment', name: "Henrico Doctors' Hospital" },
      dashpass: { action: 'skip', note: 'canceled', name: 'DashPass' },
      nintendo: { action: 'cat', cat: 'activities', name: 'Nintendo' },
      'hobby lobby': { action: 'cat', cat: 'home', name: 'Hobby Lobby' },
      'mail and more': { action: 'cat', cat: 'activities', name: 'Mail And More' },
      'healthy minds ther': { action: 'ask', tags: ['Medical'], name: 'Healthy Minds Therapy' },
    },
    look: { heading: 'Oswald', body: 'Nunito', colors: { ...Looks.colors }, glass: 0.82, calm: true },
  };
  const months = {
    '2026-10': {
      setup: true, setupAt: at,
      budgets: { food: 1000, home: 50, pets: 80, activities: 50, twins: 70 },
      checking: { amount: 4029, at },
      bills: {},
      other: [
        { id: 'x1', name: 'September AT&T', amount: 303, paid: true, paidAt: at - 1 },
        { id: 'x2', name: 'Demaris food boxes', amount: 151, paid: true, paidAt: at - 1 },
        { id: 'x3', name: 'Venture X', amount: 879, paid: true, paidAt: at - 1 },
        { id: 'x4', name: 'Venture One', amount: 84, paid: false },
      ],
      back: [
        { id: 'b1', name: 'AT&T - Analisa', amount: 50, received: false },
        { id: 'b2', name: 'Chase overpayment (Subaru, Sept)', amount: 613, received: false },
      ],
      held: [
        // They transfer the first week of the month -- not in the $4,029 yet.
        { id: 'demaris', name: 'Demaris', amount: 31, bill: 'att', received: false },
        { id: 'analisa', name: 'Analisa', amount: 102, bill: 'att', received: false },
      ],
      moved: null,
    },
  };
  return { household, months };
}

const Calc = (() => {
  const billAmount = (bill, ym) => {
    let amt = Number(bill.amount) || 0;
    const ch = (bill.changes || []).filter(c => c.from <= ym).sort((a, b) => (a.from < b.from ? -1 : 1));
    if (ch.length) amt = Number(ch[ch.length - 1].amount) || 0;
    return amt;
  };

  // Family help riding along with a bill that month.
  const heldFor = (M, billId) => ((M && M.held) || []).filter(h => h.bill === billId);
  // What actually leaves checking when the bill posts: our part plus theirs.
  const billCharge = (M, bill, ym) => billAmount(bill, ym) + heldFor(M, bill.id).reduce((s, h) => s + (Number(h.amount) || 0), 0);

  // Paid? Automatic by due date, unless someone checked/unchecked it by hand.
  function billStatus(M, bill, ym, now = Date.now()) {
    const due = D.dueTime(ym, bill.day);
    const o = M && M.bills && M.bills[bill.id];
    if (o && o.manual) return { paid: !!o.paid, at: o.at || due, manual: true, due, late: !o.paid && now >= due };
    return { paid: now >= due, at: due, manual: false, due, late: false };
  }

  // A purchase's dollars per month (bulk buys spread evenly over `spread` months).
  function allocations(p) {
    const n = Math.max(1, Number(p.spread) || 1);
    const total = Math.round((Number(p.amount) || 0) * 100);
    const base = Math.floor(total / n);
    const out = [];
    for (let i = 0; i < n; i++) {
      const cents = i === n - 1 ? total - base * (n - 1) : base;
      out.push({ ym: D.addMonths(D.ymOf(p.date), i), amount: cents / 100 });
    }
    return out;
  }

  // Totals for one month: by category, store, tag, plus the purchases touching it.
  function spent(purchases, ym) {
    const r = { total: 0, cat: {}, store: {}, tag: {}, count: {}, list: [] };
    for (const p of purchases) {
      const a = allocations(p).find(x => x.ym === ym);
      if (!a) continue;
      r.total += a.amount;
      r.cat[p.cat] = (r.cat[p.cat] || 0) + a.amount;
      if (p.store) r.store[p.store] = (r.store[p.store] || 0) + a.amount;
      for (const t of p.tags || []) r.tag[t] = (r.tag[t] || 0) + a.amount;
      r.list.push({ ...p, part: a.amount });
    }
    for (const k of ['cat', 'store', 'tag']) for (const x in r[k]) r[k][x] = round2(r[k][x]);
    r.total = round2(r.total);
    r.list.sort((a, b) => (a.date === b.date ? (b.t || 0) - (a.t || 0) : a.date < b.date ? 1 : -1));
    return r;
  }

  // A month's budget for a category: what's saved for that month, else what was
  // planned for it on the Year tab, else the normal amount from Settings.
  const budgetFor = (H, M, cat, ym) => {
    const b = M && M.budgets && M.budgets[cat.id];
    if (b !== undefined && b !== null) return Number(b) || 0;
    const p = ym && ((H.plans || {})[ym] || {}).budgets;
    if (p && p[cat.id] !== undefined && p[cat.id] !== null) return Number(p[cat.id]) || 0;
    return Number(cat.budget) || 0;
  };

  // The checklist math from the sheet, kept live:
  //   checking now + money coming back + family help not in yet
  //   − bills still to come − other expenses still to pay − budget still unspent
  //   = Savings/Excess
  // "Checking now" starts from the last balance typed in and follows along
  // with what's happened since (bills posting, purchases, refunds arriving).
  function checklist(H, M, ym, purchases, now = Date.now()) {
    M = M || {};
    const snap = M.checking || { amount: 0, at: 0 };
    const at = snap.at || 0;
    let est = Number(snap.amount) || 0;
    const since = [];
    // Bills still to come count only OUR part. A shared bill (AT&T) actually
    // charges our part + theirs, so their transfers only matter when the timing
    // doesn't line up: sent but the bill hasn't posted (their money is sitting in
    // checking -> held), or the bill posted but they haven't sent it (-> owed).
    let billsLeft = 0;
    let heldBack = 0;
    let owed = 0;
    const bills = (H.bills || []).map(b => {
      const st = billStatus(M, b, ym, now);
      const charge = billCharge(M, b, ym);
      const ours = billAmount(b, ym);
      if (st.paid && st.at > at) { est -= charge; since.push({ what: b.name, amount: -charge }); }
      if (!st.paid) billsLeft += ours;
      for (const h of heldFor(M, b.id)) {
        if (!st.paid && h.received) heldBack += Number(h.amount) || 0;
        if (st.paid && !h.received) owed += Number(h.amount) || 0;
      }
      return { ...b, ...st, amountNow: ours, charge };
    });
    let otherLeft = 0;
    for (const o of M.other || []) {
      if (o.paid && (o.paidAt || 0) > at) { est -= Number(o.amount) || 0; since.push({ what: o.name, amount: -o.amount }); }
      if (!o.paid) otherLeft += Number(o.amount) || 0;
    }
    let backIn = 0;
    for (const b of M.back || []) {
      if (b.received && (b.receivedAt || 0) > at) { est += Number(b.amount) || 0; since.push({ what: b.name, amount: +b.amount }); }
      if (!b.received) backIn += Number(b.amount) || 0;
    }
    for (const h of M.held || []) {
      if (h.received && (h.receivedAt || 0) > at) { est += Number(h.amount) || 0; since.push({ what: `From ${h.name}`, amount: +h.amount }); }
    }
    let purchased = 0;
    for (const p of purchases) if ((p.t || 0) > at) purchased += Number(p.amount) || 0;
    if (purchased) { est -= purchased; since.push({ what: 'Purchases logged', amount: -purchased }); }
    if (M.moved) { est -= M.moved; since.push({ what: M.moved > 0 ? 'Moved to savings' : 'Taken from savings', amount: -M.moved }); }

    const s = spent(purchases, ym);
    let budgetsLeft = 0;
    const cats = (H.categories || []).map(c => {
      const budget = budgetFor(H, M, c, ym);
      const used = s.cat[c.id] || 0;
      budgetsLeft += Math.max(0, budget - used);
      return { ...c, budget, used, left: round2(budget - used), over: used > budget + 0.004 };
    });
    // Purchases in a category that no longer exists still count as spending.
    const excess = round2(est + backIn + owed - heldBack - billsLeft - otherLeft - budgetsLeft);
    return {
      checking: round2(snap.amount), checkedAt: at, est: round2(est), since,
      backIn: round2(backIn), owed: round2(owed), heldBack: round2(heldBack), billsLeft: round2(billsLeft),
      otherLeft: round2(otherLeft), budgetsLeft: round2(budgetsLeft), excess, bills, cats, spent: s,
    };
  }

  // The month shown on Home: this month -- or next month once it's set up and
  // this one isn't (so October shows up on September 30th).
  function homeMonth(months) {
    const cur = D.curYm();
    const next = D.addMonths(cur, 1);
    if (!(months[cur] && months[cur].setup) && months[next] && months[next].setup) return next;
    return cur;
  }

  // The yearly planner (the 2026 tab), one row per month.
  function year(H, months, Y, purchases, homeYm) {
    const plans = H.plans || {};
    const actual = Number((H.savings || {}).actual) || 0;
    // Paychecks for a month: what's typed in, or the usual amounts from
    // Settings for months from now on that haven't been filled in.
    const usual = H.usual || {};
    const blank = v => v === undefined || v === null || v === '';
    const pay = (ym, k) => {
      const p = plans[ym] || {};
      if (!blank(p[k])) return { v: Number(p[k]) || 0, est: false };
      if (ym >= homeYm && !blank(usual[k])) return { v: Number(usual[k]) || 0, est: true };
      return null;
    };
    const income = ym => {
      const p = plans[ym] || {};
      const n = pay(ym, 'nick');
      const b = pay(ym, 'bella');
      if (!n && !b) return null;
      return (n ? n.v : 0) + (b ? b.v : 0);
    };
    const defaultExpenses = ym => {
      const M = months[ym];
      const bills = (H.bills || []).reduce((s, b) => s + billAmount(b, ym), 0);
      const cats = (H.categories || []).reduce((s, c) => s + budgetFor(H, M, c, ym), 0);
      return bills + cats;
    };
    const rows = [];
    // Walk from the home month forward so balances build on the real savings number.
    let running = null;
    const first = `${Y}-01`;
    // Start the running balance at the home month, even if it's in an earlier year.
    const startYm = homeYm;
    const lastYm = `${Y}-12`;
    const bal = {};
    const savingsOf = {};
    if (startYm <= lastYm) {
      let ym = startYm;
      while (ym <= lastYm) {
        const p = plans[ym] || {};
        const M = months[ym];
        const prevIn = income(D.addMonths(ym, -1));
        const expenses = p.expenses !== undefined && p.expenses !== null && p.expenses !== '' ? Number(p.expenses) : defaultExpenses(ym);
        const other = (p.other || []).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        let sv; let kind;
        if (ym === homeYm && M && M.setup) {
          if (M.moved !== null && M.moved !== undefined) { sv = Number(M.moved); kind = 'moved'; }
          else { sv = checklist(H, M, ym, purchases).excess; kind = 'live'; }
        } else if (p.savings !== undefined && p.savings !== null && p.savings !== '') { sv = Number(p.savings); kind = 'set'; }
        // ElevateEMS pay is additional income in its own month. Once that month
        // is set up it's on the checklist (so it's already in the live number).
        else if (prevIn === null) { sv = Number(p.elevate) || 0; kind = 'noincome'; }
        else { sv = round2(prevIn - expenses - other + (Number(p.elevate) || 0)); kind = 'auto'; }
        if (ym === homeYm) running = actual + (kind === 'moved' ? 0 : sv);
        else running = running + sv;
        bal[ym] = round2(running);
        savingsOf[ym] = { sv: round2(sv), kind, prevIn, expenses: round2(expenses), other: round2(other) };
        ym = D.addMonths(ym, 1);
      }
    }
    for (let m = 1; m <= 12; m++) {
      const ym = `${Y}-${D.pad(m)}`;
      const p = plans[ym] || {};
      const inc = income(ym);
      const past = ym < homeYm;
      const s = savingsOf[ym];
      const prevIn = income(D.addMonths(ym, -1));
      rows.push({
        ym, plan: p, past, current: ym === homeYm,
        nick: (pay(ym, 'nick') || {}).v, bella: (pay(ym, 'bella') || {}).v,
        nickEst: !!(pay(ym, 'nick') || {}).est, bellaEst: !!(pay(ym, 'bella') || {}).est, elevate: Number(p.elevate) || 0, elevateToSavings: p.elevateToSavings !== false,
        total: inc, prevIn,
        expenses: s ? s.expenses : (p.expenses !== undefined && p.expenses !== '' && p.expenses !== null ? Number(p.expenses) : null),
        other: p.other || [],
        savings: s ? s.sv : (p.savings !== undefined && p.savings !== '' ? Number(p.savings) : null),
        kind: s ? s.kind : 'past',
        balance: past ? (p.endBalance !== undefined ? Number(p.endBalance) : null) : (bal[ym] !== undefined ? bal[ym] : null),
        hasData: !!plans[ym] || ym >= homeYm,
      });
    }
    const dec = rows[11];
    return { rows, endOfYear: dec.balance, actual };
  }

  return { billAmount, billCharge, billStatus, allocations, spent, budgetFor, checklist, homeMonth, year, heldFor };
})();

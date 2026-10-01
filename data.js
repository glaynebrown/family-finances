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

// A brand-new household starts blank (a few starter categories, no bills, no
// numbers). Anything personal comes from a setup file the person loads, so no
// one's finances live in this public code.
function seedHousehold(uid, name) {
  const household = {
    members: { [uid]: true },
    people: { [uid]: { name } },
    joinCode: '',
    created: Date.now(),
    earners: [{ id: 'p1', name }],
    categories: [
      { id: 'food', name: 'Food', budget: 0, emoji: '🛒' },
      { id: 'home', name: 'Home', budget: 0, emoji: '🏠' },
      { id: 'fun', name: 'Activities/Other', budget: 0, emoji: '🎈' },
    ],
    stores: ['Aldi', 'Costco', 'Target', 'Walmart', 'Amazon'],
    tags: ['Eating out', 'Medical'],
    bills: [],
    helpers: [],
    savings: { actual: 0, asOf: D.today(), hysa: 0, floor: 5000, goalMin: 5000, goalMax: 10000, log: [], hysaDone: {} },
    plans: {},
    usual: {},
    trackMode: 'log',
    imports: {},
    rules: {},
    features: { buckets: false, overview: true },
    buckets: [],
    bucketTx: [],
    look: { heading: 'Oswald', body: 'Nunito', colors: { ...Looks.colors }, glass: 0.82, calm: true },
  };
  return { household, months: {} };
}

// A setup file (JSON) can fill in a new household: same fields as above, plus
// optional months. Only known fields are taken.
const SETUP_FIELDS = ['earners', 'categories', 'stores', 'tags', 'bills', 'helpers', 'savings', 'plans', 'usual',
  'trackMode', 'rules', 'features', 'buckets', 'bucketTx', 'look'];
function applySetup(seed, file) {
  const out = { household: { ...seed.household }, months: { ...seed.months } };
  for (const k of SETUP_FIELDS) if (file[k] !== undefined) out.household[k] = file[k];
  if (file.months && typeof file.months === 'object') Object.assign(out.months, file.months);
  return out;
}

const Calc = (() => {
  // Who earns paychecks in this household. Households made before this was a
  // setting are Nick + Bella.
  const earners = H => (H.earners && H.earners.length ? H.earners : [{ id: 'nick', name: 'Nick' }, { id: 'bella', name: 'Bella' }]);

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
    // Paychecks that land in checking during the month are next month's money:
    // once one arrives it's set aside so it doesn't look like extra this month.
    let nextPay = 0;
    for (const x of M.incoming || []) {
      if (!x.received) continue;
      if ((x.receivedAt || 0) > at) { est += Number(x.amount) || 0; since.push({ what: x.name || 'Paycheck', amount: +x.amount }); }
      nextPay += Number(x.amount) || 0;
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
    const excess = round2(est + backIn + owed - heldBack - nextPay - billsLeft - otherLeft - budgetsLeft);
    return {
      checking: round2(snap.amount), checkedAt: at, est: round2(est), since,
      backIn: round2(backIn), owed: round2(owed), heldBack: round2(heldBack), nextPay: round2(nextPay), billsLeft: round2(billsLeft),
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
    const people = earners(H);
    const income = ym => {
      const got = people.map(e => pay(ym, e.id)).filter(Boolean);
      if (!got.length) return null;
      return got.reduce((a, g) => a + g.v, 0);
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
        pay: people.map(e => { const g = pay(ym, e.id); return { id: e.id, name: e.name, v: g ? g.v : undefined, est: !!(g && g.est) }; }),
        elevate: Number(p.elevate) || 0, elevateToSavings: p.elevateToSavings !== false,
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

  // Savings buckets: balance = everything added minus everything spent/moved out.
  function bucketBalances(H) {
    const bal = {};
    for (const b of H.buckets || []) bal[b.id] = 0;
    for (const t of H.bucketTx || []) if (bal[t.b] !== undefined) bal[t.b] = round2(bal[t.b] + (Number(t.amount) || 0));
    return bal;
  }
  // Split money going into savings: fixed monthly amounts first, then each
  // bucket's % of what's left -- never past its goal. Whatever can't be placed
  // (full buckets' shares) is returned as `extra` for the person to decide.
  function splitIntoBuckets(H, amount) {
    const bal = bucketBalances(H);
    const room = b => Math.max(0, (Number(b.goal) || 0) - bal[b.id]);
    const add = {};
    let left = round2(amount);
    for (const b of H.buckets || []) {
      const fixed = Math.min(Number(b.monthly) || 0, room(b), left);
      if (fixed > 0) { add[b.id] = round2(fixed); left = round2(left - fixed); }
    }
    const base = left;
    for (const b of H.buckets || []) {
      const pct = Number(b.pct) || 0;
      if (!pct) continue;
      const r = room(b) - (add[b.id] || 0);
      const share = Math.min(round2(base * pct / 100), Math.max(0, r), left);
      if (share > 0) { add[b.id] = round2((add[b.id] || 0) + share); left = round2(left - share); }
    }
    return { add, extra: round2(left), bal };
  }

  return { earners, bucketBalances, splitIntoBuckets, billAmount, billCharge, billStatus, allocations, spent, budgetFor, checklist, homeMonth, year, heldFor };
})();

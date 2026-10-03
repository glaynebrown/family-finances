/* Weekly import of a Navy Federal transactions CSV.

   Reads the file in the browser (nothing is uploaded), works out which rows
   are spending, and suggests a category for each:
     merchant rule (learned from past imports)  >  the bank's own category
   Bills, transfers and anything already imported are skipped. Venmo and
   anything without a guess is left for review.

   Row: { i, key, ruleKey, name, date, post, amount (+ spent, − refund),
          bankCat, kind: 'buy'|'refund'|'transfer', status: 'dup'|'skip'|'review',
          cat ('' = not picked, 'skip', 'uncat' or a category id), tags, ask,
          reason, splits: null | [{ amount, cat }], remember } */

const Imp = (() => {
  // Split CSV text into rows of cells (handles quotes and commas in quotes).
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => c !== '')) rows.push(row);
    return rows;
  }

  const isoDate = s => {
    const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
  };

  // Navy Federal's export columns, by header name.
  function records(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('That file is empty.');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = name => head.indexOf(name);
    const need = ['posting date', 'transaction date', 'amount', 'credit debit indicator', 'description'];
    if (need.some(n => col(n) < 0)) throw new Error('That doesn’t look like a Navy Federal transactions file (CSV).');
    const g = (r, n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
    return rows.slice(1).map(r => ({
      post: isoDate(g(r, 'posting date')) || isoDate(g(r, 'transaction date')),
      date: isoDate(g(r, 'transaction date')) || isoDate(g(r, 'posting date')),
      amount: Math.abs(parseFloat(g(r, 'amount').replace(/[^0-9.\-]/g, '')) || 0),
      credit: /credit/i.test(g(r, 'credit debit indicator')),
      group: g(r, 'type group') || g(r, 'type'),
      desc: g(r, 'description'),
      bankCat: g(r, 'category'),
    })).filter(x => x.date && x.amount);
  }

  // "Debit-Dc 0416 Healthy Minds Ther XX-6940" -> "Healthy Minds Ther"
  const prettyName = d => d.replace(/^debit-dc \d+\s*/i, '').replace(/\s*xx-\d+\s*$/i, '').trim();
  // A stable merchant key for rules: lowercase, no numbers/punctuation, first 3 words.
  const keyOf = d => prettyName(d).toLowerCase()
    .replace(/^adjustment - cr\s*/, '').replace(/^payment to\s*/, '').replace(/['’]/g, '')
    .replace(/[#*]\S*/g, ' ').replace(/\b\d+\b/g, ' ').replace(/[^a-z& ]/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  const words = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean);

  // First guesses from the bank's own category.
  const BANK = {
    groceries: { cat: 'food' },
    'restaurants/dining': { cat: 'food', tags: ['Eating out'] },
    'home improvement': { cat: 'home' },
    'healthcare/medical': { ask: true, tags: ['Medical'] },
  };

  const findRule = (rules, key) => {
    if (rules[key]) return rules[key];
    const k = Object.keys(rules).find(r => key.startsWith(r + ' '));
    return k ? rules[k] : null;
  };
  const ruleKeyFor = (rules, key) => (rules[key] ? key : Object.keys(rules).find(r => key.startsWith(r + ' ')) || key);

  // Matches one of the automatic bills? "Payment to State Farm" matches the
  // State Farm bill by name alone; a plain store name ("Amazon") also has to be
  // within a couple percent of the bill amount, so everyday Amazon orders don't
  // get mistaken for the Amazon bill.
  function billFor(H, rec) {
    const pretty = prettyName(rec.desc);
    const dw = new Set(words(pretty));
    const paymentTo = /^payment to /i.test(pretty);
    for (const b of H.bills || []) {
      const bw = words(b.name).filter(w => !['payment', 'family', '-'].includes(w));
      if (!bw.length || !bw.every(w => dw.has(w))) continue;
      if (paymentTo) return b;
      const amts = [Number(b.amount) || 0, ...(b.changes || []).map(c => Number(c.amount) || 0)];
      if (amts.some(a => Math.abs(a - rec.amount) <= Math.max(0.5, a * 0.02))) return b;
    }
    return null;
  }

  function classify(text, H, months) {
    const rules = H.rules || {};
    const recs = records(text);
    const seen = {};
    const rows = recs.map((rec, i) => {
      const mkey = keyOf(rec.desc);
      const base = `${rec.date}|${rec.amount.toFixed(2)}|${rec.credit ? 'c' : 'd'}|${mkey}`;
      seen[base] = (seen[base] || 0) + 1;
      const key = `${base}#${seen[base]}`;
      const isBuy = /^pos$/i.test(rec.group) && !rec.credit;
      const isRefund = rec.credit && (/^credit$/i.test(rec.group) || /refund|adjust/i.test(rec.bankCat));
      const venmo = /venmo/i.test(rec.desc);
      // Cash pulled from checking: it's spending, but only you know what it was for.
      const atm = !rec.credit && (/atm/i.test(rec.group) || /\batm\b|withdrawal/i.test(rec.desc));
      const row = {
        i, key, ruleKey: ruleKeyFor(rules, mkey), name: prettyName(rec.desc) || rec.desc, date: rec.date, post: rec.post,
        amount: isRefund ? -rec.amount : rec.amount, bankCat: rec.bankCat,
        kind: isBuy ? 'buy' : isRefund ? 'refund' : 'transfer', status: 'review', cat: '', tags: [], ask: false,
        reason: '', splits: null, remember: false, venmo,
      };
      const done = ((months[D.ymOf(rec.date)] || {}).importedKeys || []).includes(key);
      if (done) { row.status = 'dup'; return row; }
      // Paychecks that land in checking (Settings → Features): a deposit that
      // isn't a transfer, refund or Venmo. Asked once, then remembered.
      const deposit = rec.credit && !isRefund && !/transfer (from|to)/i.test(rec.desc) && (/deposit|ach credit|direct dep/i.test(rec.group) || /^deposit\b/i.test(rec.desc));
      if (deposit && (H.features || {}).payInChecking) {
        const pr = findRule(rules, mkey);
        row.payCandidate = true;
        row.amount = rec.amount;
        if (pr && pr.action === 'pay') { row.cat = 'pay'; row.reason = 'Paycheck (from your rule)'; return row; }
        if (pr && pr.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = 'Skipped by your rule'; return row; }
        row.reason = 'Money in — is this a paycheck?';
        row.remember = true;
        return row;
      }
      if (atm) { row.venmo = true; row.reason = 'Cash withdrawal — pick a category or skip'; return row; }
      if (venmo) { row.reason = rec.credit ? 'Venmo in — your call' : 'Venmo — your call'; row.amount = rec.credit ? -rec.amount : rec.amount; return row; }
      if (!isBuy && !isRefund) { row.status = 'skip'; row.cat = 'skip'; row.reason = rec.credit ? 'Money in (transfer/deposit)' : 'Transfer or payment'; return row; }
      const rule = findRule(rules, mkey);
      if (rule && rule.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = rule.note ? `Skipped — ${rule.note}` : 'Skipped by your rule'; return row; }
      const bill = isBuy && billFor(H, rec);
      if (bill && !(rule && rule.action === 'cat')) {
        const amt = Calc.billAmount(bill, D.ymOf(rec.date));
        row.status = 'skip'; row.cat = 'skip'; row.billId = bill.id; row.charged = rec.amount;
        row.reason = `Matches your ${bill.name} bill${Math.abs(amt - rec.amount) > 1 ? ` — charged ${money(rec.amount)} (bill said ${money(amt)}); this month’s amount will be updated` : ''}`;
        return row;
      }
      if (rule && rule.action === 'ask') { row.ask = true; row.tags = [...(rule.tags || [])]; row.reason = 'You pick the category each time'; return row; }
      if (rule && rule.action === 'cat') { row.cat = rule.cat; row.tags = [...(rule.tags || [])]; row.reason = 'From your rule'; return row; }
      const guess = BANK[(rec.bankCat || '').toLowerCase()];
      if (guess && guess.ask) { row.ask = true; row.tags = [...(guess.tags || [])]; row.reason = `${rec.bankCat} — pick a category`; return row; }
      if (guess) { row.cat = guess.cat; row.tags = [...(guess.tags || [])]; row.reason = `Bank says ${rec.bankCat}`; return row; }
      row.reason = rec.bankCat ? `Bank says ${rec.bankCat}` : 'New store';
      return row;
    });
    // Rows the categories list doesn't know (e.g. a deleted category) need a pick.
    const ids = new Set((H.categories || []).map(c => c.id));
    for (const r of rows) if (r.cat && !['skip', 'uncat', 'pay'].includes(r.cat) && !ids.has(r.cat)) { r.cat = ''; }
    const dates = recs.map(r => r.post || r.date).sort();
    return { rows, from: dates[0], through: dates[dates.length - 1] };
  }

  return { classify, keyOf };
})();

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
      // Shared bills (AT&T) charge our part plus everyone else's.
      const shares = (H.helpers || []).filter(h => h.bill === b.id).reduce((t, h) => t + (Number(h.amount) || 0), 0);
      const amts = [Number(b.amount) || 0, ...(b.changes || []).map(c => Number(c.amount) || 0)].flatMap(a => [a, a + shares]);
      if (amts.some(a => Math.abs(a - rec.amount) <= Math.max(0.5, a * 0.02))) return b;
    }
    return null;
  }

  // A shared-bill share still owed that month, closest within 10%.
  function heldGuess(months, rec) {
    let best = null;
    for (const h of (months[D.ymOf(rec.date)] || {}).held || []) {
      const a = Number(h.amount) || 0;
      const gap = Math.abs(a - rec.amount);
      if (!h.received && a > 0 && gap <= a * 0.1 && (!best || gap < best.gap)) best = { h, gap };
    }
    return best && best.h;
  }

  // This month's Additional income not checked off yet, closest within 10%.
  function backGuess(months, rec) {
    let best = null;
    for (const b of (months[D.ymOf(rec.date)] || {}).back || []) {
      const a = Number(b.amount) || 0;
      const gap = Math.abs(a - rec.amount);
      if (!b.received && a > 0 && gap <= a * 0.1 && (!best || gap < best.gap)) best = { b, gap };
    }
    return best && best.b;
  }

  // No name match: a bill within a dollar (or 2%) of the payment that the bank
  // hasn't shown as paid yet that month. Closest amount wins.
  function billByAmount(H, rec, months) {
    const ym = D.ymOf(rec.date);
    const M = months[ym] || {};
    let best = null;
    for (const b of H.bills || []) {
      if ((M.bills || {})[b.id] && M.bills[b.id].posted) continue;
      const a = Calc.billCharge(M, b, ym);
      const gap = Math.abs(a - rec.amount);
      if (a > 0 && gap <= Math.max(1, a * 0.02) && (!best || gap < best.gap)) best = { b, gap };
    }
    return best && best.b;
  }

  function classify(text, H, months) {
    const rules = H.rules || {};
    const recs = records(text);
    const seen = {};
    const rows = recs.map((rec, i) => {
      const mkey = keyOf(rec.desc);
      // Rules for transfers keep the account's last digits ("Transfer From Checking -1526"
      // is one person, -7087 another). Import keys don't, so old imports still match.
      const acct = /^transfer (to|from)/i.test(rec.desc) && (rec.desc.match(/-\s*(\d{3,})\s*$/) || [])[1];
      const rkey = acct ? `${mkey} ${acct}` : mkey;
      const base = `${rec.date}|${rec.amount.toFixed(2)}|${rec.credit ? 'c' : 'd'}|${mkey}`;
      seen[base] = (seen[base] || 0) + 1;
      const key = `${base}#${seen[base]}`;
      const isBuy = /^pos$/i.test(rec.group) && !rec.credit;
      const isRefund = rec.credit && (/^credit$/i.test(rec.group) || /refund|adjust/i.test(rec.bankCat));
      const venmo = /venmo/i.test(rec.desc);
      // Cash pulled from checking: it's spending, but only you know what it was for.
      const atm = !rec.credit && (/atm/i.test(rec.group) || /\batm\b|withdrawal/i.test(rec.desc));
      const row = {
        i, key, ruleKey: ruleKeyFor(rules, rkey), name: prettyName(rec.desc) || rec.desc, date: rec.date, post: rec.post,
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
        const pr = findRule(rules, rkey);
        row.payCandidate = true;
        row.amount = rec.amount;
        row.backGuess = (backGuess(months, rec) || {}).id || '';
        if (pr && pr.action === 'pay') { row.cat = 'pay'; row.reason = 'Paycheck (from your rule)'; return row; }
        if (pr && pr.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = 'Skipped by your rule'; return row; }
        row.reason = 'Money in — is this a paycheck?';
        row.remember = true;
        return row;
      }
      // Other money in (mobile deposit, a check, ACH): one of this month's Additional
      // income items within 10%? Otherwise it's offered as new Additional income.
      const moneyIn = rec.credit && !isRefund && !venmo && !/^transfer$/i.test(rec.group) && !/transfer (from|to)/i.test(rec.desc);
      if (moneyIn) {
        const pr = findRule(rules, rkey);
        if (pr && pr.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = 'Skipped by your rule'; return row; }
        const guess = backGuess(months, rec);
        row.incomeAsk = true;
        row.amount = rec.amount;
        row.backGuess = guess ? guess.id : '';
        row.cat = guess ? '' : 'income';
        row.reason = guess ? `Is this your ${guess.name} (${money(guess.amount)})?` : 'Money in — added to Additional income';
        return row;
      }
      if (atm) { row.venmo = true; row.reason = 'Cash withdrawal — pick a category or skip'; return row; }
      if (venmo) { row.reason = rec.credit ? 'Venmo in — your call' : 'Venmo — your call'; row.amount = rec.credit ? -rec.amount : rec.amount; return row; }
      // Bill payments (card or ACH) are skipped but remembered, so the bill shows as paid.
      const rule0 = findRule(rules, rkey);
      const ruleBill = rule0 && rule0.action === 'bill' && (H.bills || []).find(b => b.id === rule0.billId);
      const bill0 = !rec.credit && (ruleBill || (!(rule0 && rule0.action === 'cat') && billFor(H, rec)));
      const ym = D.ymOf(rec.date);
      const askBill = (guess, reason) => {
        row.billAsk = true;
        row.billGuess = guess ? guess.id : '';
        row.reason = reason || (guess ? `Is this your ${guess.name} bill (${money(Calc.billCharge(months[ym], guess, ym))})?` : 'Money out — a bill, spending, or skip?');
        return row;
      };
      if (bill0) {
        const amt = Calc.billCharge(months[ym], bill0, ym);
        // Way off the usual amount: make sure it really is that bill.
        if (Math.abs(amt - rec.amount) > amt * 0.1) return askBill(bill0, `Looks like your ${bill0.name} bill, but it’s ${money(rec.amount)} (usually ${money(amt)}) — is it?`);
        row.status = 'skip'; row.cat = 'skip'; row.billId = bill0.id; row.charged = rec.amount;
        row.reason = `Matches your ${bill0.name} bill${Math.abs(amt - rec.amount) > 1 ? ` — charged ${money(rec.amount)} (expected ${money(amt)}); this month’s amount will be updated` : ''}`;
        return row;
      }
      // Any other money out (ACH, "Payment to…", a transfer, a check, a fee): a bill
      // (one suggested by amount), spending in a category, or skip. Asked until remembered.
      if (!rec.credit && !isBuy && !(rule0 && (rule0.action === 'cat' || rule0.action === 'ask'))) {
        if (rule0 && rule0.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = rule0.note ? `Skipped — ${rule0.note}` : 'Skipped by your rule'; return row; }
        return askBill(billByAmount(H, rec, months));
      }
      // Transfers in (someone sending a shared-bill share, or your own money moving):
      // a share still owed that month within 10%, Additional income, or skip.
      if (rec.credit && !isRefund) {
        row.incomeAsk = true;
        row.transferIn = true;
        row.amount = rec.amount;
        if (rule0 && rule0.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = 'Skipped by your rule'; return row; }
        const held = ((months[ym] || {}).held || []).filter(h => !h.received);
        const ruled = rule0 && rule0.action === 'held' && held.find(h => h.id === rule0.helperId);
        if (ruled) { row.cat = `held:${ruled.id}`; row.reason = `${ruled.name}’s share (your rule)`; return row; }
        const share = heldGuess(months, rec);
        const back = !share && backGuess(months, rec);
        row.heldGuess = share ? share.id : '';
        row.backGuess = back ? back.id : '';
        row.reason = share ? `Is this ${share.name}’s share (${money(share.amount)})?` : back ? `Is this your ${back.name} (${money(back.amount)})?` : 'Transfer in — a share, Additional income, or your own money moving?';
        return row;
      }
      const rule = rule0;
      if (rule && rule.action === 'skip') { row.status = 'skip'; row.cat = 'skip'; row.reason = rule.note ? `Skipped — ${rule.note}` : 'Skipped by your rule'; return row; }
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
    for (const r of rows) if (r.cat && !['skip', 'uncat', 'pay', 'income'].includes(r.cat) && !r.cat.includes(':') && !ids.has(r.cat)) { r.cat = ''; }
    const dates = recs.map(r => r.post || r.date).sort();
    return { rows, from: dates[0], through: dates[dates.length - 1] };
  }

  return { classify, keyOf };
})();

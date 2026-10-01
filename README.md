# Family Finances

Bella & Nick's budget app: log purchases after the store, watch each category's
money left, tick off bills, and track savings toward the yearly goal.

Plain HTML/JS + Firebase (email/password sign-in + Firestore). Hosted on
GitHub Pages; add it to the iPhone home screen from Safari (Share → Add to Home Screen).

## Files to upload to GitHub
index.html, styles.css, app.js, data.js, store.js, demo.js, firebase-config.js,
sw.js, manifest.json, icon-192.png, icon-512.png, apple-touch-icon.png

(firestore.rules, firebase.json and .firebaserc are for the Firebase CLI — they
don't need to be on GitHub.)

## First run
1. Bella: open the site → Create an account → **Start our budget** (October comes preloaded).
2. Settings → Household shows an 8-letter code.
3. Nick: Create an account → **Join with a code**.

## Screens
- **Home** – this month's categories, money left, recent purchases, + Log.
- **Bills** – the live checklist (checking → Savings/Excess), automatic payments
  (auto-check on the due day; tap to override), other expenses, money back, family help.
- **Year** – the yearly planner: income, expenses, savings per month, balance,
  goal bar ($5K minimum / $10K goal), year-end HYSA move.
- **More** → Set up next month (step by step), Breakdown (category / store / tag
  totals + 12-month history), Settings (categories, stores, tags, bills, look, wallpapers).

Firebase project: nest-egg-a8p2c.

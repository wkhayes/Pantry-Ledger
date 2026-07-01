# Pantry Ledger

An offline-first inventory & shopping list app for tracking groceries (and anything else) across multiple homes. Installs on your Android phone like a normal app.

Your spreadsheet is already loaded in as starting data: **Lake Thunderbird** (from the `LTA` sheet) and **Oak Park** (from the `ROP` sheet), 130 unique items between them.

## What's in this version

- **Multi-location inventory** — Lake Thunderbird and Oak Park are set up out of the box. Add more locations anytime (e.g. "Cabin"), optionally copying an existing location's item list as a starting template (desired quantities, categories, stores — stock starts at 0).
- **Shopping lists** — generated automatically from "desired qty vs. in stock," per location, or combined across any set of locations you toggle on.
- **Defer, don't delete** — tap "Defer" on a list item to snooze it off the active list without losing the need. It shows up in a "Deferred" section and can be restored anytime.
- **Add net-new items** straight from the shopping list or the inventory view, for one or more locations at once.
- **Quick +/- steppers** on every item for fast daily updates as things get eaten or restocked.
- **Last updated tracking** — every item shows whether it was last consumed, restocked, purchased, or deferred, and when.
- **Sort & filter** the shopping list by store, quantity needed, or location — handy for working through one aisle or one stop at a time.
- **Search** across name, category, brand, and store, with tap-to-edit item details (name, category, brand, description, home area, stores, desired/stock per location).
- **Fully offline** — data lives on your device (IndexedDB). No account, no internet required after install.

## Not in this version (planned next)

Sharing the app/list with other people, exporting to Google Drive, multi-device sync, recipes linking items together, item photos, calendar scheduling, multi-stop route planning, and one-off/one-time items and stores. These all need either a backend, a Google account connection, or a native share sheet — the current build is intentionally local-only so it works with zero setup. Happy to scope any of these next.

## Install it on your Android phone

A PWA needs to be served over **HTTPS** (or `localhost`) for the "install as app" and offline features to work — opening the HTML file directly from your Downloads folder won't fully work. Easiest free options:

1. **GitHub Pages** (free, simple):
   - Create a new GitHub repo, upload everything in this folder.
   - Repo Settings → Pages → deploy from the `main` branch, root folder.
   - You'll get a URL like `https://yourname.github.io/pantry-ledger/`.
2. **Netlify Drop** (fastest, no account strictly required):
   - Go to https://app.netlify.com/drop and drag this whole folder in.
   - You'll get a live HTTPS URL instantly.
3. **Vercel**, **Firebase Hosting**, or any static host work the same way — it's just static files.

Once it's hosted:
1. Open the URL on your Android phone in Chrome.
2. Tap the **⋮** menu → **Add to Home screen** (Chrome may also prompt you automatically with "Install app").
3. Launch it from your home screen — it opens full-screen like a native app and works with airplane mode on.

## Folder contents

```
index.html            App shell
styles.css            Visual design
app.js                App logic and rendering
db.js                 IndexedDB storage layer
seed-data.js          Your spreadsheet data, pre-loaded on first launch
manifest.webmanifest  Makes it installable
service-worker.js     Caches the app for offline use
icons/                App icon
```

## Notes on the data

- Items that appeared in both `LTA` and `ROP` sheets were merged into a single item tracked separately per location (so "Dots Pretzels" is one item with its own desired/stock/store for Lake Thunderbird and again for Oak Park).
- A few rows in `ROP` had no store filled in — those import with an empty store list; edit them in-app anytime by tapping the item.
- Blank "In Stock" cells imported as 0.

## If you want changes

This is plain HTML/CSS/JS with no build step — every file is easy to open and hand-edit, and easy for me to extend next round (sharing, Drive export, sync, recipes, photos, calendar, routing, one-off items are all queued up whenever you're ready).

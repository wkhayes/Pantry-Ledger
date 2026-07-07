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

## What's new (round 2)

- **Partial receive** — "Got it" now sits next to an editable quantity box (defaults to the full amount needed). Buy less than planned and the list keeps the remainder as a need instead of clearing it.
- **Expandable rows** — item rows now show just the name and location. Tap the ▾ to reveal category, brand, home area, store(s), and last-update info without cluttering the list.
- **Need is its own column** in the shopping list, between the item name and the action buttons.
- **Sortable column headers** — tap "Item" or "Need"/"Stock" at the top of any list to sort by it; tap again to reverse.
- **Compound filter** — a Filter button opens store, category, and home-area chip pickers plus a minimum-quantity-needed field. All selected criteria must match (AND), and the button shows how many filters are active.
- **"All" location chip** — one tap to select every location at once, in both Inventory and Shopping List. (You'd mentioned wanting something added to the locations toggle but the sentence got cut off before it said what — I took a guess here. Let me know if you meant something else, like a combined vs. per-location display mode.)
- **One-time items** — "+ One-time" on the shopping list adds something that's never tracked in inventory (no desired/stock, no defer). It sits in its own section until you tap "Got it" or "Remove."

## What's new (round 3)

- **Grouped by store** — the shopping list is now organized into collapsible sections, one per store. Tap the ▾/▶ on a section to collapse or expand it.
- **Reorder store sections** — the ▲/▼ buttons on each store header move that section up or down; your order is saved and survives reloads.
- **Sort still works within each group** — tapping "Item" or "Need" in the header sorts inside every store section using the same rule, rather than one global flat order.
- **Multi-store items appear in every relevant store's section** — e.g. an item stocked at both Costco and HyVee shows up under both. Any action (partial receive, defer) updates the single underlying record, so it's reflected instantly in every section it appears in.
- Deferred and one-time items stay as their own flat sections below the store groups, unaffected by grouping/sorting — shout if you'd rather see those grouped by store too.



## What's new (round 4)

- **Full Material Design dark theme** — rebuilt the visual language: dark surfaces built from your primary `#122631`, accents and buttons in your secondary `#5589A6`, white primary text, and `#949494` for secondary/muted text.
- Material-style components throughout: filled/outlined pill buttons, tonal chips, a bottom app-style navigation bar with an active pill indicator, bottom sheets with a drag handle for modals, filled text fields, and elevation shadows on cards.
- A real ripple effect on taps (buttons, chips, tabs, steppers) — implemented in plain CSS/JS, no libraries.
- App icon and browser theme color updated to match the new palette.
- No functional changes in this round — every feature from before works exactly the same, just restyled.

## What's new (round 5)

- **Compact header** — the app name and page title now share one line ("Pantry Ledger — Inventory") at the same small size, cutting the header's height noticeably.
- **Location toggles now look like tabs** — flat text with an underline indicator on the active one(s), sitting on their own row with proper breathing room instead of pill buttons crowding the header bar.

## Updating your deployed copy

Since your repo is already live, just replace the files in your repo with the ones in this folder (same filenames) and push. No new setup needed — the app will pick up the new schema automatically the next time it loads (existing inventory data is preserved).

**Important:** every time app files change, `service-worker.js` needs to change too (even just the `CACHE_NAME` string), or your phone will keep serving the old cached version indefinitely — the browser only checks for service worker updates when that file's contents change. I've bumped it to `pantry-ledger-v5` this round. Any future round I send will bump it again automatically.

If you update the repo and still see old content:
1. Confirm the deploy actually finished (check the Actions tab on GitHub).
2. Fully close the installed app (swipe it away from recent apps, not just back out of it) and reopen — this lets the new service worker take over.
3. If it's still stale, open the site in Chrome, tap ⋮ → Settings → Site settings → your site → Clear & reset, then reinstall.

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

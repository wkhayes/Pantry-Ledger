/* app.js — views: Inventory, Shopping List, Search. Vanilla JS, no build step. */

const state = {
  locations: [],
  items: [],
  oneTimeItems: [],
  activeLocationIds: [],
  view: 'inventory',
  listScope: [],
  invSort: { key: 'category', dir: 'asc' },   // 'category' | 'name' | 'stock'
  listSort: { key: 'name', dir: 'asc' },      // 'name' | 'need'
  invFilter: { stores: [], categories: [], homeAreas: [], minNeed: 0 },
  listFilter: { stores: [], categories: [], homeAreas: [], minNeed: 0 },
  filterDraft: null,
  storeOrder: [],
  collapsedStores: new Set(),
  expanded: new Set(),
  searchQuery: ''
};

const $app = document.getElementById('app');

async function boot() {
  await DB.seedIfEmpty();
  state.locations = await DB.getLocations();
  state.items = await DB.getItems();
  state.oneTimeItems = await DB.getOneTimeItems();
  state.storeOrder = await DB.getSetting('storeOrder', []);
  state.activeLocationIds = state.locations.map(l => l.id);
  state.listScope = [...state.activeLocationIds];
  render();
}

function fmtQty(n) {
  if (n === null || n === undefined) return '0';
  return (Math.round(n * 100) / 100).toString();
}

function needOf(rec) {
  return Math.max(0, roundQty(rec.desiredQty - rec.inStock));
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

function actionLabel(a) {
  return { consumed: 'consumed', restocked: 'restocked', purchased: 'purchased', dismissed: 'deferred', added: 'added' }[a] || '—';
}

function allStoresInScope(locIds) {
  const set = new Set();
  for (const item of state.items) {
    for (const locId of locIds) {
      const rec = item.perLocation[locId];
      if (rec) (rec.stores || []).forEach(s => s && set.add(s));
    }
  }
  return [...set].sort();
}

function allCategoriesInScope(locIds) {
  const set = new Set();
  for (const item of state.items) {
    if (locIds.some(id => item.perLocation[id])) set.add(item.category || 'Uncategorized');
  }
  return [...set].sort();
}

function allHomeAreasInScope(locIds) {
  const set = new Set();
  for (const item of state.items) {
    for (const locId of locIds) {
      const rec = item.perLocation[locId];
      if (rec && rec.homeArea) set.add(rec.homeArea);
    }
  }
  return [...set].sort();
}

function locName(id) {
  const l = state.locations.find(l => l.id === id);
  return l ? l.name : id;
}

function roundQty(n) { return Math.round(n * 100) / 100; }

function matchesFilter(item, rec, filter) {
  if (filter.stores.length && !(rec.stores || []).some(s => filter.stores.includes(s))) return false;
  if (filter.categories.length && !filter.categories.includes(item.category || 'Uncategorized')) return false;
  if (filter.homeAreas.length && !filter.homeAreas.includes(rec.homeArea || '')) return false;
  if (filter.minNeed && needOf(rec) < filter.minNeed) return false;
  return true;
}

function activeFilterCount(filter) {
  return filter.stores.length + filter.categories.length + filter.homeAreas.length + (filter.minNeed ? 1 : 0);
}

/* ---------------- Rendering ---------------- */

function render() {
  $app.innerHTML = `
    ${renderHeader()}
    <main class="view">${
      state.view === 'inventory' ? renderInventory() :
      state.view === 'list' ? renderShoppingList() :
      renderSearch()
    }</main>
    ${renderTabBar()}
    <div id="modal-root"></div>
  `;
  bindGlobalEvents();
}

function renderHeader() {
  const title = state.view === 'inventory' ? 'Inventory' : state.view === 'list' ? 'Shopping List' : 'Search';
  return `
    <header class="topbar">
      <div class="brand">
        <img src="icons/icon-192.png" alt="" class="brand-mark" />
        <span class="brand-name">Pantry Ledger</span>
      </div>
      <h1 class="view-title">${title}</h1>
    </header>
    ${state.view !== 'search' ? renderLocationChips() : ''}
  `;
}

function renderLocationChips() {
  const targetSet = state.view === 'list' ? state.listScope : state.activeLocationIds;
  const allIds = state.locations.map(l => l.id);
  const allOn = allIds.length > 0 && allIds.every(id => targetSet.includes(id));
  const chips = state.locations.map(loc => {
    const on = targetSet.includes(loc.id);
    return `<button class="chip ${on ? 'chip-on' : ''}" data-action="toggle-loc" data-loc="${loc.id}">${escapeHtml(loc.name)}</button>`;
  }).join('');
  return `
    <div class="chip-row">
      <button class="chip chip-all ${allOn ? 'chip-on' : ''}" data-action="toggle-all-loc">All</button>
      ${chips}
      <button class="chip chip-add" data-action="add-location">+ Location</button>
    </div>
  `;
}

function renderTabBar() {
  const tabs = [
    { id: 'inventory', label: 'Inventory', icon: '▦' },
    { id: 'list', label: 'Shopping List', icon: '☰' },
    { id: 'search', label: 'Search', icon: '⌕' }
  ];
  return `
    <nav class="tabbar">
      ${tabs.map(t => `
        <button class="tab ${state.view === t.id ? 'tab-active' : ''}" data-action="set-view" data-view="${t.id}">
          <span class="tab-icon">${t.icon}</span>
          <span class="tab-label">${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function sortHeaderBtn(label, scope, key, currentSort, extraClass) {
  const active = currentSort.key === key;
  const arrow = active ? (currentSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<button class="col-header ${extraClass || ''} ${active ? 'col-header-active' : ''}" data-action="sort-col" data-scope="${scope}" data-key="${key}">${label}${arrow}</button>`;
}

function filterButtonHtml(scope, filter) {
  const n = activeFilterCount(filter);
  return `<button class="btn btn-ghost btn-filter" data-action="open-filter" data-scope="${scope}">Filter${n ? ` (${n})` : ''}</button>`;
}

function expandToggleBtn(key) {
  const open = state.expanded.has(key);
  return `<button class="expand-toggle ${open ? 'expand-toggle-open' : ''}" data-action="toggle-expand" data-key="${key}" aria-label="Details">${open ? '▲' : '▼'}</button>`;
}

function detailsPanel(item, rec, locId) {
  return `
    <div class="row-details">
      <div class="detail-grid">
        <div class="detail-label">Category</div><div class="detail-value">${escapeHtml(item.category || 'Uncategorized')}</div>
        <div class="detail-label">Brand</div><div class="detail-value">${escapeHtml(item.brand || '—')}</div>
        <div class="detail-label">Home area</div><div class="detail-value">${escapeHtml(rec.homeArea || '—')}</div>
        <div class="detail-label">Store(s)</div><div class="detail-value">${(rec.stores || []).map(s => escapeHtml(s)).join(', ') || '—'}</div>
        <div class="detail-label">Last update</div><div class="detail-value">${actionLabel(rec.lastAction)} · ${timeAgo(rec.lastUpdated)}</div>
        ${item.description ? `<div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(item.description)}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm detail-edit-btn" data-action="open-item" data-item="${item.id}">Edit item</button>
    </div>
  `;
}

function renderInventory() {
  const locIds = state.activeLocationIds.length ? state.activeLocationIds : state.locations.map(l => l.id);
  if (!locIds.length) return emptyState('No locations yet', 'Add a location to start tracking inventory.', 'add-location', 'Add Location');

  let rows = [];
  for (const item of state.items) {
    for (const locId of locIds) {
      const rec = item.perLocation[locId];
      if (!rec) continue;
      if (!matchesFilter(item, rec, state.invFilter)) continue;
      rows.push({ item, locId, rec });
    }
  }

  if (!rows.length) {
    const msg = activeFilterCount(state.invFilter) ? 'No items match your filters.' : 'Add your first item to this location.';
    return controlsBar('inv') + emptyState('No items found', msg, 'open-add-item', 'Add Item');
  }

  const { key, dir } = state.invSort;
  const mul = dir === 'asc' ? 1 : -1;
  if (key === 'name') {
    rows.sort((a, b) => mul * a.item.name.localeCompare(b.item.name));
  } else if (key === 'stock') {
    rows.sort((a, b) => mul * (a.rec.inStock - b.rec.inStock));
  } else {
    rows.sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));
  }

  let body;
  if (key === 'category') {
    let lastCategory = null;
    body = rows.map(({ item, locId, rec }) => {
      const catHeader = item.category !== lastCategory ? (() => { lastCategory = item.category; return `<div class="cat-header">${escapeHtml(item.category)}</div>`; })() : '';
      return catHeader + inventoryRowHtml(item, locId, rec, locIds);
    }).join('');
  } else {
    body = rows.map(({ item, locId, rec }) => inventoryRowHtml(item, locId, rec, locIds)).join('');
  }

  const headerRow = `
    <div class="col-headers">
      ${sortHeaderBtn('Item', 'inv', 'name', state.invSort, 'col-header-name')}
      ${sortHeaderBtn('Stock', 'inv', 'stock', state.invSort, 'col-header-need')}
      <span class="col-header-spacer"></span>
    </div>
  `;

  return controlsBar('inv') + `<div class="list">${headerRow}${body}</div>`;
}

function inventoryRowHtml(item, locId, rec, locIds) {
  const key = `${item.id}::${locId}`;
  const open = state.expanded.has(key);
  return `
    <div class="item-row">
      <div class="row-name-col" data-action="toggle-expand" data-key="${key}">
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${locIds.length > 1 ? `<div class="chip-inline"><span class="tag tag-loc">${escapeHtml(locName(locId))}</span></div>` : ''}
      </div>
      <div class="row-stepper-col">
        <div class="stepper">
          <button class="step-btn" data-action="adjust" data-item="${item.id}" data-loc="${locId}" data-delta="-1">−</button>
          <span class="qty-display"><span class="qty-mono">${fmtQty(rec.inStock)}</span><span class="qty-sep">/</span><span class="qty-mono qty-desired">${fmtQty(rec.desiredQty)}</span></span>
          <button class="step-btn" data-action="adjust" data-item="${item.id}" data-loc="${locId}" data-delta="1">+</button>
        </div>
      </div>
      ${expandToggleBtn(key)}
    </div>
    ${open ? detailsPanel(item, rec, locId) : ''}
  `;
}

function computeShoppingList() {
  const locIds = state.listScope.length ? state.listScope : state.locations.map(l => l.id);
  const needed = [];
  const deferred = [];
  for (const item of state.items) {
    for (const locId of locIds) {
      const rec = item.perLocation[locId];
      if (!rec) continue;
      const need = needOf(rec);
      if (need > 0) {
        const row = { item, locId, rec, need };
        if (rec.deferredAt) deferred.push(row); else needed.push(row);
      }
    }
  }
  return { needed, deferred, locIds };
}

function sortListRows(rows) {
  const { key, dir } = state.listSort;
  const mul = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === 'need') return mul * (a.need - b.need);
    return mul * a.item.name.localeCompare(b.item.name);
  });
}

function controlsBar(scope) {
  const filter = scope === 'inv' ? state.invFilter : state.listFilter;
  return `
    <div class="toolbar toolbar-wrap">
      ${filterButtonHtml(scope, filter)}
      <button class="btn btn-primary" data-action="open-add-item" ${scope === 'list' ? 'data-target-list="1"' : ''}>+ Add Item</button>
      ${scope === 'list' ? `<button class="btn btn-ghost" data-action="open-add-onetime">+ One-time</button>` : ''}
    </div>
  `;
}

function renderShoppingList() {
  if (!state.locations.length) return emptyState('No locations yet', 'Add a location first.', 'add-location', 'Add Location');

  const { needed, deferred, locIds } = computeShoppingList();
  let filtered = needed.filter(r => matchesFilter(r.item, r.rec, state.listFilter));
  filtered = sortListRows(filtered);

  const oneTimeRows = state.oneTimeItems.filter(ot => !ot.locationIds.length || ot.locationIds.some(id => locIds.includes(id)));

  const controls = controlsBar('list');

  if (!filtered.length && !deferred.length && !oneTimeRows.length) {
    const msg = activeFilterCount(state.listFilter) ? 'No items match your filters.' : 'Nothing needed for this scope right now.';
    return controls + emptyState('All stocked up', msg, null, null);
  }

  const NO_STORE = 'No store';

  function storesForRow(rec) {
    const stores = (rec.stores || []).filter(Boolean);
    if (state.listFilter.stores.length) {
      const matched = stores.filter(s => state.listFilter.stores.includes(s));
      return matched.length ? matched : (stores.length ? [] : [NO_STORE]);
    }
    return stores.length ? stores : [NO_STORE];
  }

  const groups = {};
  for (const row of filtered) {
    for (const s of storesForRow(row.rec)) {
      (groups[s] = groups[s] || []).push(row);
    }
  }
  const groupNames = Object.keys(groups);
  ensureStoreOrder(groupNames);
  const orderedNames = state.storeOrder.filter(n => groups[n]);
  state._visibleStoreOrder = orderedNames;

  const headerRow = filtered.length ? `
    <div class="col-headers">
      ${sortHeaderBtn('Item', 'list', 'name', state.listSort, 'col-header-name')}
      ${sortHeaderBtn('Need', 'list', 'need', state.listSort, 'col-header-need')}
      <span class="col-header-spacer"></span>
    </div>
  ` : '';

  const groupsHtml = orderedNames.map((storeName, idx) => {
    const rows = groups[storeName];
    const collapsed = state.collapsedStores.has(storeName);
    const canUp = idx > 0;
    const canDown = idx < orderedNames.length - 1;
    const rowsHtml = rows.map(({ item, locId, rec, need }) => shoppingRowHtml(item, locId, rec, need, locIds)).join('');
    return `
      <div class="store-group">
        <div class="store-group-header">
          <button class="store-collapse-btn" data-action="toggle-store" data-store="${escapeHtml(storeName)}">${collapsed ? '▶' : '▼'}</button>
          <span class="store-group-name" data-action="toggle-store" data-store="${escapeHtml(storeName)}">${escapeHtml(storeName)} <span class="store-count">${rows.length}</span></span>
          <div class="store-move-btns">
            <button class="move-btn" data-action="move-store" data-store="${escapeHtml(storeName)}" data-dir="up" ${canUp ? '' : 'disabled'}>▲</button>
            <button class="move-btn" data-action="move-store" data-store="${escapeHtml(storeName)}" data-dir="down" ${canDown ? '' : 'disabled'}>▼</button>
          </div>
        </div>
        ${collapsed ? '' : rowsHtml}
      </div>
    `;
  }).join('');

  const deferredHtml = deferred.length ? `
    <div class="cat-header cat-header-muted">Deferred (${deferred.length})</div>
    ${deferred.map(({ item, locId, rec, need }) => `
      <div class="item-row item-row-2line item-row-muted">
        <div class="row-top">
          <div class="row-name-col">
            <div class="item-name">${escapeHtml(item.name)}</div>
          </div>
          <div class="row-need-col"><span class="need-badge need-badge-muted">${fmtQty(need)}</span></div>
        </div>
        <div class="row-bottom">
          <div class="chip-inline">
            ${locIds.length > 1 ? `<span class="tag tag-loc">${escapeHtml(locName(locId))}</span>` : ''}
            <span class="updated">deferred ${timeAgo(rec.deferredAt)}</span>
          </div>
          <div class="row-actions-col">
            <button class="btn btn-ghost btn-sm" data-action="undefer" data-item="${item.id}" data-loc="${locId}">Restore</button>
          </div>
        </div>
      </div>
    `).join('')}
  ` : '';

  const oneTimeHtml = oneTimeRows.length ? `
    <div class="cat-header">One-time (${oneTimeRows.length})</div>
    ${oneTimeRows.map(ot => `
      <div class="item-row item-row-2line">
        <div class="row-top">
          <div class="row-name-col">
            <div class="item-name">${escapeHtml(ot.name)}</div>
          </div>
          <div class="row-need-col">—</div>
        </div>
        <div class="row-bottom">
          <div class="chip-inline">
            ${ot.category ? `<span class="tag">${escapeHtml(ot.category)}</span>` : ''}
            ${ot.store ? `<span class="tag tag-store">${escapeHtml(ot.store)}</span>` : ''}
          </div>
          <div class="row-actions-col">
            <button class="btn btn-primary btn-sm" data-action="onetime-got" data-id="${ot.id}">Got it</button>
            <button class="btn btn-ghost btn-sm" data-action="onetime-remove" data-id="${ot.id}">Remove</button>
          </div>
        </div>
      </div>
    `).join('')}
  ` : '';

  return controls + `<div class="list">${headerRow}${groupsHtml}${deferredHtml}${oneTimeHtml}</div>`;
}

function shoppingRowHtml(item, locId, rec, need, locIds) {
  const key = `${item.id}::${locId}`;
  const open = state.expanded.has(key);
  return `
    <div class="item-row item-row-2line">
      <div class="row-top">
        <div class="row-name-col" data-action="toggle-expand" data-key="${key}">
          <div class="item-name">${escapeHtml(item.name)}</div>
        </div>
        <div class="row-need-col"><span class="need-badge">${fmtQty(need)}</span></div>
        ${expandToggleBtn(key)}
      </div>
      <div class="row-bottom">
        <div class="chip-inline">${locIds.length > 1 ? `<span class="tag tag-loc">${escapeHtml(locName(locId))}</span>` : ''}</div>
        <div class="row-actions-col">
          <input type="number" class="qty-input" min="0" step="0.5" value="${fmtQty(need)}" data-qty-for="${item.id}::${locId}" />
          <button class="btn btn-primary btn-sm" data-action="receive" data-item="${item.id}" data-loc="${locId}">Got it</button>
          <button class="btn btn-ghost btn-sm" data-action="defer" data-item="${item.id}" data-loc="${locId}">Defer</button>
        </div>
      </div>
    </div>
    ${open ? detailsPanel(item, rec, locId) : ''}
  `;
}

function ensureStoreOrder(names) {
  let changed = false;
  for (const n of names) {
    if (!state.storeOrder.includes(n)) { state.storeOrder.push(n); changed = true; }
  }
  if (changed) DB.setSetting('storeOrder', state.storeOrder);
}

function moveStoreInVisibleOrder(name, dir) {
  const visible = state._visibleStoreOrder || [];
  const idx = visible.indexOf(name);
  if (idx < 0) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= visible.length) return;
  const newVisible = visible.slice();
  [newVisible[idx], newVisible[targetIdx]] = [newVisible[targetIdx], newVisible[idx]];
  const visibleSet = new Set(newVisible);
  const queue = [...newVisible];
  state.storeOrder = state.storeOrder.map(n => visibleSet.has(n) ? queue.shift() : n);
  DB.setSetting('storeOrder', state.storeOrder);
  render();
}

function renderSearch() {
  const q = state.searchQuery.trim().toLowerCase();
  const results = q ? state.items.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q) ||
    (item.brand || '').toLowerCase().includes(q) ||
    Object.values(item.perLocation).some(rec => (rec.stores || []).some(s => s.toLowerCase().includes(q)))
  ) : [];

  const resultsHtml = results.map(item => {
    const locSummary = Object.entries(item.perLocation).map(([locId, rec]) =>
      `${escapeHtml(locName(locId))}: ${fmtQty(rec.inStock)}/${fmtQty(rec.desiredQty)}`
    ).join(' · ');
    return `
      <div class="item-row" data-action="open-item" data-item="${item.id}">
        <div class="item-main">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            <span class="tag">${escapeHtml(item.category)}</span>
            ${item.brand ? `<span class="tag">${escapeHtml(item.brand)}</span>` : ''}
            <span class="updated">${locSummary}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="search-bar">
      <input type="search" class="text-input" placeholder="Search by name, category, brand, or store…" value="${escapeHtml(state.searchQuery)}" data-action="search-input" />
    </div>
    ${q && !results.length ? emptyState('No matches', `Nothing found for "${escapeHtml(state.searchQuery)}".`, null, null) : ''}
    <div class="list">${resultsHtml}</div>
  `;
}

function emptyState(title, body, action, actionLabelText) {
  return `
    <div class="empty-state">
      <div class="empty-title">${title}</div>
      <div class="empty-body">${body}</div>
      ${action ? `<button class="btn btn-primary" data-action="${action}">${actionLabelText}</button>` : ''}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- Modals ---------------- */

function openModal(html) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-sheet" data-stop="1">${html}</div>
    </div>
  `;
  bindGlobalEvents();
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  state.filterDraft = null;
}

function openAddLocationModal() {
  const options = state.locations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  openModal(`
    <h2 class="modal-title">Add a Location</h2>
    <label class="field-label">Name</label>
    <input class="text-input" id="new-loc-name" placeholder="e.g. Lake House" />
    ${state.locations.length ? `
      <label class="field-label">Start from</label>
      <select class="select select-block" id="new-loc-copy">
        <option value="">Empty — no items</option>
        ${options}
      </select>
      <div class="field-hint">Copying brings over item names, categories, desired quantities and stores — stock starts at 0.</div>
    ` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-location">Add Location</button>
    </div>
  `);
}

function openItemModal(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const locEntries = state.locations.map(loc => {
    const rec = item.perLocation[loc.id];
    return { loc, rec };
  });

  openModal(`
    <h2 class="modal-title">Edit Item</h2>
    <label class="field-label">Name</label>
    <input class="text-input" id="edit-name" value="${escapeHtml(item.name)}" />
    <div class="field-row">
      <div class="field-col">
        <label class="field-label">Category</label>
        <input class="text-input" id="edit-category" value="${escapeHtml(item.category)}" />
      </div>
      <div class="field-col">
        <label class="field-label">Brand</label>
        <input class="text-input" id="edit-brand" value="${escapeHtml(item.brand || '')}" />
      </div>
    </div>
    <label class="field-label">Description</label>
    <textarea class="text-input" id="edit-description" rows="2">${escapeHtml(item.description || '')}</textarea>

    <div class="modal-subhead">Per location</div>
    ${locEntries.map(({ loc, rec }) => `
      <div class="loc-block">
        <div class="loc-block-title">${escapeHtml(loc.name)} ${rec ? '' : '<span class="tag">not tracked here</span>'}</div>
        ${rec ? `
          <div class="field-row">
            <div class="field-col"><label class="field-label">Desired</label><input class="text-input" type="number" step="0.5" min="0" data-loc-field="desiredQty" data-loc="${loc.id}" value="${rec.desiredQty}" /></div>
            <div class="field-col"><label class="field-label">In stock</label><input class="text-input" type="number" step="0.5" min="0" data-loc-field="inStock" data-loc="${loc.id}" value="${rec.inStock}" /></div>
          </div>
          <div class="field-row">
            <div class="field-col"><label class="field-label">Home area</label><input class="text-input" data-loc-field="homeArea" data-loc="${loc.id}" value="${escapeHtml(rec.homeArea || '')}" placeholder="Fridge, Pantry…" /></div>
            <div class="field-col"><label class="field-label">Store(s)</label><input class="text-input" data-loc-field="stores" data-loc="${loc.id}" value="${escapeHtml((rec.stores || []).join(', '))}" placeholder="HyVee, Costco" /></div>
          </div>
        ` : `<button class="btn btn-ghost btn-sm" data-action="track-here" data-item="${item.id}" data-loc="${loc.id}">+ Track at ${escapeHtml(loc.name)}</button>`}
      </div>
    `).join('')}

    <div class="modal-actions modal-actions-split">
      <button class="btn btn-danger" data-action="delete-item" data-item="${item.id}">Delete</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" data-action="save-item" data-item="${item.id}">Save</button>
      </div>
    </div>
  `);
}

function openAddItemModal(forList) {
  const locOptions = state.locations.map(l => `
    <label class="checkbox-row">
      <input type="checkbox" value="${l.id}" class="new-item-loc" ${state.activeLocationIds.includes(l.id) || (forList && state.listScope.includes(l.id)) ? 'checked' : ''} />
      ${escapeHtml(l.name)}
    </label>
  `).join('');

  openModal(`
    <h2 class="modal-title">Add New Item</h2>
    <label class="field-label">Name</label>
    <input class="text-input" id="new-item-name" placeholder="e.g. Paper Towels" />
    <div class="field-row">
      <div class="field-col"><label class="field-label">Category</label><input class="text-input" id="new-item-category" placeholder="e.g. Household" /></div>
      <div class="field-col"><label class="field-label">Brand</label><input class="text-input" id="new-item-brand" placeholder="optional" /></div>
    </div>
    <div class="field-row">
      <div class="field-col"><label class="field-label">Desired qty</label><input class="text-input" type="number" step="0.5" min="0" id="new-item-desired" value="1" /></div>
      <div class="field-col"><label class="field-label">In stock now</label><input class="text-input" type="number" step="0.5" min="0" id="new-item-instock" value="0" /></div>
    </div>
    <div class="field-row">
      <div class="field-col"><label class="field-label">Home area</label><input class="text-input" id="new-item-area" placeholder="Fridge, Pantry…" /></div>
      <div class="field-col"><label class="field-label">Store(s)</label><input class="text-input" id="new-item-store" placeholder="HyVee, Costco" /></div>
    </div>
    <label class="field-label">Track at</label>
    <div class="checkbox-group">${locOptions}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-new-item">Add Item</button>
    </div>
  `);
}

function openAddOneTimeModal() {
  const locOptions = state.locations.map(l => `
    <label class="checkbox-row">
      <input type="checkbox" value="${l.id}" class="new-onetime-loc" ${state.listScope.includes(l.id) ? 'checked' : ''} />
      ${escapeHtml(l.name)}
    </label>
  `).join('');

  openModal(`
    <h2 class="modal-title">Add One-time Item</h2>
    <div class="field-hint">Won't be added to inventory. Stays on the shopping list until you mark it purchased — can't be deferred.</div>
    <label class="field-label">Name</label>
    <input class="text-input" id="new-onetime-name" placeholder="e.g. Birthday candles" />
    <div class="field-row">
      <div class="field-col"><label class="field-label">Category</label><input class="text-input" id="new-onetime-category" placeholder="optional" /></div>
      <div class="field-col"><label class="field-label">Store</label><input class="text-input" id="new-onetime-store" placeholder="optional" /></div>
    </div>
    <label class="field-label">Notes</label>
    <textarea class="text-input" id="new-onetime-notes" rows="2" placeholder="optional"></textarea>
    <label class="field-label">Show on list for</label>
    <div class="checkbox-group">${locOptions}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-onetime">Add to List</button>
    </div>
  `);
}

function openFilterModal(scope) {
  const current = scope === 'inv' ? state.invFilter : state.listFilter;
  const locIds = scope === 'inv'
    ? (state.activeLocationIds.length ? state.activeLocationIds : state.locations.map(l => l.id))
    : (state.listScope.length ? state.listScope : state.locations.map(l => l.id));
  state.filterDraft = {
    scope, locIds,
    stores: [...current.stores],
    categories: [...current.categories],
    homeAreas: [...current.homeAreas],
    minNeed: current.minNeed
  };
  openModal(renderFilterModalBody());
}

function renderFilterModalBody() {
  const d = state.filterDraft;
  const stores = allStoresInScope(d.locIds);
  const categories = allCategoriesInScope(d.locIds);
  const homeAreas = allHomeAreasInScope(d.locIds);

  const chipGroup = (dim, values) => values.length ? `
    <div class="filter-chip-row">
      ${values.map(v => `<button class="chip ${d[dim].includes(v) ? 'chip-on' : ''}" data-action="toggle-filter-chip" data-dim="${dim}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')}
    </div>
  ` : `<div class="field-hint">None available in current scope.</div>`;

  return `
    <h2 class="modal-title">Filter</h2>
    <div class="field-hint">All selected criteria must match — narrows the list, doesn't broaden it.</div>

    <div class="modal-subhead">Store</div>
    ${chipGroup('stores', stores)}

    <div class="modal-subhead">Category</div>
    ${chipGroup('categories', categories)}

    <div class="modal-subhead">Home area</div>
    ${chipGroup('homeAreas', homeAreas)}

    <div class="modal-subhead">Quantity needed</div>
    <input class="text-input" type="number" min="0" step="0.5" id="filter-minneed" value="${d.minNeed}" placeholder="0" />
    <div class="field-hint">Only show items needing at least this much.</div>

    <div class="modal-actions modal-actions-split">
      <button class="btn btn-ghost" data-action="clear-filter">Clear all</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" data-action="apply-filter">Apply</button>
      </div>
    </div>
  `;
}

/* ---------------- Event handling ---------------- */

function bindGlobalEvents() {
  document.querySelectorAll('[data-action]').forEach(el => {
    const action = el.dataset.action;
    if (el.dataset.bound) return;
    el.dataset.bound = '1';

    if (action === 'set-view') {
      el.addEventListener('click', () => { state.view = el.dataset.view; render(); });
    } else if (action === 'toggle-loc') {
      el.addEventListener('click', () => {
        const list = state.view === 'list' ? state.listScope : state.activeLocationIds;
        const id = el.dataset.loc;
        const idx = list.indexOf(id);
        if (idx >= 0) { if (list.length > 1) list.splice(idx, 1); } else list.push(id);
        render();
      });
    } else if (action === 'toggle-all-loc') {
      el.addEventListener('click', () => {
        const list = state.view === 'list' ? state.listScope : state.activeLocationIds;
        const allIds = state.locations.map(l => l.id);
        list.length = 0;
        list.push(...allIds);
        render();
      });
    } else if (action === 'add-location') {
      el.addEventListener('click', () => openAddLocationModal());
    } else if (action === 'save-location') {
      el.addEventListener('click', onSaveLocation);
    } else if (action === 'open-add-item') {
      el.addEventListener('click', () => openAddItemModal(!!el.dataset.targetList));
    } else if (action === 'save-new-item') {
      el.addEventListener('click', onSaveNewItem);
    } else if (action === 'open-add-onetime') {
      el.addEventListener('click', () => openAddOneTimeModal());
    } else if (action === 'save-onetime') {
      el.addEventListener('click', onSaveOneTime);
    } else if (action === 'onetime-got') {
      el.addEventListener('click', async () => { await DB.deleteOneTimeItem(el.dataset.id); state.oneTimeItems = await DB.getOneTimeItems(); render(); });
    } else if (action === 'onetime-remove') {
      el.addEventListener('click', async () => { await DB.deleteOneTimeItem(el.dataset.id); state.oneTimeItems = await DB.getOneTimeItems(); render(); });
    } else if (action === 'open-item') {
      el.addEventListener('click', (e) => { e.stopPropagation(); openItemModal(el.dataset.item); });
    } else if (action === 'toggle-expand') {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
        render();
      });
    } else if (action === 'adjust') {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await DB.adjustStock(el.dataset.item, el.dataset.loc, parseFloat(el.dataset.delta));
        state.items = await DB.getItems();
        render();
      });
    } else if (action === 'defer') {
      el.addEventListener('click', async () => { await DB.deferItem(el.dataset.item, el.dataset.loc); state.items = await DB.getItems(); render(); });
    } else if (action === 'undefer') {
      el.addEventListener('click', async () => { await DB.undeferItem(el.dataset.item, el.dataset.loc); state.items = await DB.getItems(); render(); });
    } else if (action === 'receive') {
      el.addEventListener('click', async () => {
        const input = document.querySelector(`[data-qty-for="${el.dataset.item}::${el.dataset.loc}"]`);
        const qty = input ? parseFloat(input.value) : NaN;
        if (!isFinite(qty) || qty <= 0) return;
        await DB.receiveQty(el.dataset.item, el.dataset.loc, qty);
        state.items = await DB.getItems();
        render();
      });
    } else if (action === 'toggle-store') {
      el.addEventListener('click', () => {
        const store = el.dataset.store;
        if (state.collapsedStores.has(store)) state.collapsedStores.delete(store); else state.collapsedStores.add(store);
        render();
      });
    } else if (action === 'move-store') {
      el.addEventListener('click', () => moveStoreInVisibleOrder(el.dataset.store, el.dataset.dir));
    } else if (action === 'sort-col') {
      el.addEventListener('click', () => {
        const sortObj = el.dataset.scope === 'inv' ? state.invSort : state.listSort;
        if (sortObj.key === el.dataset.key) {
          sortObj.dir = sortObj.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortObj.key = el.dataset.key;
          sortObj.dir = 'asc';
        }
        render();
      });
    } else if (action === 'open-filter') {
      el.addEventListener('click', () => openFilterModal(el.dataset.scope));
    } else if (action === 'toggle-filter-chip') {
      el.addEventListener('click', () => {
        const dim = el.dataset.dim, val = el.dataset.value;
        const arr = state.filterDraft[dim];
        const idx = arr.indexOf(val);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
        openModal(renderFilterModalBody());
      });
    } else if (action === 'clear-filter') {
      el.addEventListener('click', () => {
        state.filterDraft.stores = [];
        state.filterDraft.categories = [];
        state.filterDraft.homeAreas = [];
        state.filterDraft.minNeed = 0;
        openModal(renderFilterModalBody());
      });
    } else if (action === 'apply-filter') {
      el.addEventListener('click', () => {
        const minNeedInput = document.getElementById('filter-minneed');
        const minNeed = minNeedInput ? (parseFloat(minNeedInput.value) || 0) : 0;
        const target = state.filterDraft.scope === 'inv' ? 'invFilter' : 'listFilter';
        state[target] = {
          stores: state.filterDraft.stores,
          categories: state.filterDraft.categories,
          homeAreas: state.filterDraft.homeAreas,
          minNeed
        };
        closeModal();
        render();
      });
    } else if (action === 'search-input') {
      el.addEventListener('input', () => { state.searchQuery = el.value; render(); focusSearchEnd(); });
    } else if (action === 'close-modal') {
      el.addEventListener('click', () => closeModal());
    } else if (action === 'save-item') {
      el.addEventListener('click', () => onSaveItem(el.dataset.item));
    } else if (action === 'delete-item') {
      el.addEventListener('click', () => onDeleteItem(el.dataset.item));
    } else if (action === 'track-here') {
      el.addEventListener('click', () => onTrackHere(el.dataset.item, el.dataset.loc));
    }
  });

  const sheet = document.querySelector('.modal-sheet');
  if (sheet) sheet.addEventListener('click', (e) => e.stopPropagation());
}

function focusSearchEnd() {
  const input = document.querySelector('[data-action="search-input"]');
  if (input) { input.focus(); const v = input.value; input.value = ''; input.value = v; }
}

async function onSaveLocation() {
  const name = document.getElementById('new-loc-name').value.trim();
  if (!name) return;
  const copySel = document.getElementById('new-loc-copy');
  const copyFrom = copySel ? copySel.value : '';
  const id = await DB.addLocation(name, copyFrom || null);
  state.locations = await DB.getLocations();
  state.items = await DB.getItems();
  state.activeLocationIds.push(id);
  state.listScope.push(id);
  closeModal();
  render();
}

async function onSaveNewItem() {
  const name = document.getElementById('new-item-name').value.trim();
  if (!name) return;
  const category = document.getElementById('new-item-category').value.trim() || 'Uncategorized';
  const brand = document.getElementById('new-item-brand').value.trim();
  const desired = parseFloat(document.getElementById('new-item-desired').value) || 0;
  const inStock = parseFloat(document.getElementById('new-item-instock').value) || 0;
  const area = document.getElementById('new-item-area').value.trim();
  const stores = document.getElementById('new-item-store').value.split(',').map(s => s.trim()).filter(Boolean);
  const checked = [...document.querySelectorAll('.new-item-loc:checked')].map(c => c.value);
  if (!checked.length) return;

  const locationEntries = checked.map(id => ({
    locationId: id, locationName: locName(id), desiredQty: desired, inStock, homeArea: area, stores
  }));
  await DB.createItem({ name, category, brand, description: '', locationEntries });
  state.items = await DB.getItems();
  closeModal();
  render();
}

async function onSaveOneTime() {
  const name = document.getElementById('new-onetime-name').value.trim();
  if (!name) return;
  const category = document.getElementById('new-onetime-category').value.trim();
  const store = document.getElementById('new-onetime-store').value.trim();
  const notes = document.getElementById('new-onetime-notes').value.trim();
  const locationIds = [...document.querySelectorAll('.new-onetime-loc:checked')].map(c => c.value);
  await DB.createOneTimeItem({ name, category, store, notes, locationIds });
  state.oneTimeItems = await DB.getOneTimeItems();
  closeModal();
  render();
}

async function onSaveItem(itemId) {
  const item = await DB.getItem(itemId);
  if (!item) return;
  item.name = document.getElementById('edit-name').value.trim() || item.name;
  item.category = document.getElementById('edit-category').value.trim() || 'Uncategorized';
  item.brand = document.getElementById('edit-brand').value.trim();
  item.description = document.getElementById('edit-description').value.trim();

  document.querySelectorAll('[data-loc-field]').forEach(el => {
    const locId = el.dataset.loc;
    const field = el.dataset.locField;
    if (!item.perLocation[locId]) return;
    if (field === 'stores') {
      item.perLocation[locId].stores = el.value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (field === 'homeArea') {
      item.perLocation[locId].homeArea = el.value.trim();
    } else {
      item.perLocation[locId][field] = parseFloat(el.value) || 0;
    }
  });
  await DB.saveItem(item);
  state.items = await DB.getItems();
  closeModal();
  render();
}

async function onDeleteItem(itemId) {
  await DB.deleteItem(itemId);
  state.items = await DB.getItems();
  closeModal();
  render();
}

async function onTrackHere(itemId, locId) {
  const item = await DB.getItem(itemId);
  if (!item) return;
  item.perLocation[locId] = {
    locationName: locName(locId), desiredQty: 1, inStock: 0, homeArea: '', stores: [],
    lastUpdated: new Date().toISOString(), lastAction: 'added', deferredAt: null
  };
  await DB.saveItem(item);
  state.items = await DB.getItems();
  openItemModal(itemId);
}

boot();

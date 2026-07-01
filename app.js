/* app.js — views: Inventory, Shopping List, Search. Vanilla JS, no build step. */

const state = {
  locations: [],
  items: [],
  activeLocationIds: [],   // which location(s) are "in focus" (drives inventory view + default list scope)
  view: 'inventory',       // 'inventory' | 'list' | 'search'
  listScope: [],           // location ids included in the current shopping list view
  listSort: 'store',       // 'store' | 'qty' | 'location'
  listStoreFilter: 'all',
  searchQuery: '',
  editingItemId: null
};

const $app = document.getElementById('app');

async function boot() {
  await DB.seedIfEmpty();
  state.locations = await DB.getLocations();
  state.items = await DB.getItems();
  state.activeLocationIds = state.locations.map(l => l.id);
  state.listScope = [...state.activeLocationIds];
  render();
}

function fmtQty(n) {
  if (n === null || n === undefined) return '0';
  return (Math.round(n * 100) / 100).toString();
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

function locName(id) {
  const l = state.locations.find(l => l.id === id);
  return l ? l.name : id;
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
  const chips = state.locations.map(loc => {
    const on = targetSet.includes(loc.id);
    return `<button class="chip ${on ? 'chip-on' : ''}" data-action="toggle-loc" data-loc="${loc.id}">${escapeHtml(loc.name)}</button>`;
  }).join('');
  return `
    <div class="chip-row">
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

function renderInventory() {
  const locIds = state.activeLocationIds.length ? state.activeLocationIds : state.locations.map(l => l.id);
  if (!locIds.length) return emptyState('No locations yet', 'Add a location to start tracking inventory.', 'add-location', 'Add Location');

  const rows = state.items
    .map(item => ({ item, entries: locIds.filter(id => item.perLocation[id]).map(id => ({ locId: id, rec: item.perLocation[id] })) }))
    .filter(x => x.entries.length)
    .sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));

  if (!rows.length) return emptyState('No items yet', 'Add your first item to this location.', 'open-add-item', 'Add Item');

  let lastCategory = null;
  const body = rows.map(({ item, entries }) => {
    const catHeader = item.category !== lastCategory ? (() => { lastCategory = item.category; return `<div class="cat-header">${escapeHtml(item.category)}</div>`; })() : '';
    const entryRows = entries.map(({ locId, rec }) => `
      <div class="item-row">
        <div class="item-main" data-action="open-item" data-item="${item.id}">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            ${locIds.length > 1 ? `<span class="tag tag-loc">${escapeHtml(locName(locId))}</span>` : ''}
            ${rec.homeArea ? `<span class="tag">${escapeHtml(rec.homeArea)}</span>` : ''}
            ${(rec.stores || []).map(s => `<span class="tag tag-store">${escapeHtml(s)}</span>`).join('')}
            <span class="updated">Last ${actionLabel(rec.lastAction)} · ${timeAgo(rec.lastUpdated)}</span>
          </div>
        </div>
        <div class="stepper">
          <button class="step-btn" data-action="adjust" data-item="${item.id}" data-loc="${locId}" data-delta="-1">−</button>
          <span class="qty-display"><span class="qty-mono">${fmtQty(rec.inStock)}</span><span class="qty-sep">/</span><span class="qty-mono qty-desired">${fmtQty(rec.desiredQty)}</span></span>
          <button class="step-btn" data-action="adjust" data-item="${item.id}" data-loc="${locId}" data-delta="1">+</button>
        </div>
      </div>
    `).join('');
    return catHeader + entryRows;
  }).join('');

  return `
    <div class="toolbar">
      <button class="btn btn-primary" data-action="open-add-item">+ Add Item</button>
    </div>
    <div class="list">${body}</div>
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
      const need = roundQty(rec.desiredQty - rec.inStock);
      if (need > 0) {
        const row = { item, locId, rec, need };
        if (rec.deferredAt) deferred.push(row); else needed.push(row);
      }
    }
  }
  return { needed, deferred, locIds };
}

function roundQty(n) { return Math.round(n * 100) / 100; }

function sortRows(rows) {
  const sort = state.listSort;
  return rows.slice().sort((a, b) => {
    if (sort === 'qty') return b.need - a.need;
    if (sort === 'location') return locName(a.locId).localeCompare(locName(b.locId)) || b.need - a.need;
    // store
    const as = (a.rec.stores && a.rec.stores[0]) || 'zzz';
    const bs = (b.rec.stores && b.rec.stores[0]) || 'zzz';
    return as.localeCompare(bs) || b.need - a.need;
  });
}

function renderShoppingList() {
  if (!state.locations.length) return emptyState('No locations yet', 'Add a location first.', 'add-location', 'Add Location');

  const { needed, deferred, locIds } = computeShoppingList();
  const stores = allStoresInScope(locIds);
  let filtered = needed;
  if (state.listStoreFilter !== 'all') {
    filtered = filtered.filter(r => (r.rec.stores || []).includes(state.listStoreFilter));
  }
  filtered = sortRows(filtered);

  const controls = `
    <div class="toolbar toolbar-wrap">
      <select class="select" data-action="sort-list">
        <option value="store" ${state.listSort === 'store' ? 'selected' : ''}>Sort: Store</option>
        <option value="qty" ${state.listSort === 'qty' ? 'selected' : ''}>Sort: Qty needed</option>
        <option value="location" ${state.listSort === 'location' ? 'selected' : ''}>Sort: Location</option>
      </select>
      <select class="select" data-action="filter-store">
        <option value="all" ${state.listStoreFilter === 'all' ? 'selected' : ''}>All stores</option>
        ${stores.map(s => `<option value="${escapeHtml(s)}" ${state.listStoreFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" data-action="open-add-item" data-target-list="1">+ Add Item</button>
    </div>
  `;

  if (!filtered.length && !deferred.length) {
    return controls + emptyState('All stocked up', 'Nothing needed for this scope right now.', null, null);
  }

  const rowsHtml = filtered.map(({ item, locId, rec, need }) => `
    <div class="item-row">
      <div class="item-main" data-action="open-item" data-item="${item.id}">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">
          ${locIds.length > 1 ? `<span class="tag tag-loc">${escapeHtml(locName(locId))}</span>` : ''}
          ${(rec.stores || []).map(s => `<span class="tag tag-store">${escapeHtml(s)}</span>`).join('')}
          <span class="need-badge">need ${fmtQty(need)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="defer" data-item="${item.id}" data-loc="${locId}">Defer</button>
        <button class="btn btn-primary btn-sm" data-action="purchased" data-item="${item.id}" data-loc="${locId}">Got it</button>
      </div>
    </div>
  `).join('');

  const deferredHtml = deferred.length ? `
    <div class="cat-header cat-header-muted">Deferred (${deferred.length})</div>
    ${deferred.map(({ item, locId, rec, need }) => `
      <div class="item-row item-row-muted">
        <div class="item-main" data-action="open-item" data-item="${item.id}">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            ${locIds.length > 1 ? `<span class="tag tag-loc">${escapeHtml(locName(locId))}</span>` : ''}
            <span class="need-badge need-badge-muted">need ${fmtQty(need)}</span>
            <span class="updated">deferred ${timeAgo(rec.deferredAt)}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-action="undefer" data-item="${item.id}" data-loc="${locId}">Restore</button>
        </div>
      </div>
    `).join('')}
  ` : '';

  return controls + `<div class="list">${rowsHtml}${deferredHtml}</div>`;
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

function openItemModal(itemId, opts = {}) {
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
    } else if (action === 'add-location') {
      el.addEventListener('click', () => openAddLocationModal());
    } else if (action === 'save-location') {
      el.addEventListener('click', onSaveLocation);
    } else if (action === 'open-add-item') {
      el.addEventListener('click', () => openAddItemModal(!!el.dataset.targetList));
    } else if (action === 'save-new-item') {
      el.addEventListener('click', onSaveNewItem);
    } else if (action === 'open-item') {
      el.addEventListener('click', (e) => { if (e.target.closest('[data-action="adjust"]')) return; openItemModal(el.dataset.item); });
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
    } else if (action === 'purchased') {
      el.addEventListener('click', async () => { await DB.markPurchased(el.dataset.item, el.dataset.loc); state.items = await DB.getItems(); render(); });
    } else if (action === 'sort-list') {
      el.addEventListener('change', () => { state.listSort = el.value; render(); });
    } else if (action === 'filter-store') {
      el.addEventListener('change', () => { state.listStoreFilter = el.value; render(); });
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

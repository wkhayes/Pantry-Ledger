/* db.js — IndexedDB data layer. No external dependencies (works fully offline). */

const DB_NAME = 'pantryDB';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('locations')) {
        db.createObjectStore('locations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const Store = {
  async getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.getAll());
  },
  async get(storeName, id) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.get(id));
  },
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(value));
  },
  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(id));
  }
};

const DB = {
  async isSeeded() {
    const flag = await Store.get('meta', 'seeded');
    return !!(flag && flag.value);
  },

  async seedIfEmpty() {
    const seeded = await this.isSeeded();
    if (seeded) return;
    const now = new Date().toISOString();
    for (const loc of SEED_DATA.locations) {
      await Store.put('locations', { ...loc, createdAt: now });
    }
    for (const item of SEED_DATA.items) {
      await Store.put('items', { ...item, createdAt: now });
    }
    await Store.put('meta', { key: 'seeded', value: true });
  },

  async getLocations() {
    const locs = await Store.getAll('locations');
    return locs.sort((a, b) => a.name.localeCompare(b.name));
  },

  async addLocation(name, copyFromLocationId) {
    const id = 'loc-' + slugify(name) + '-' + Date.now().toString(36);
    const now = new Date().toISOString();
    await Store.put('locations', { id, name, createdAt: now });

    if (copyFromLocationId) {
      const items = await Store.getAll('items');
      for (const item of items) {
        const src = item.perLocation && item.perLocation[copyFromLocationId];
        if (!src) continue;
        item.perLocation[id] = {
          locationName: name,
          desiredQty: src.desiredQty,
          inStock: 0,
          homeArea: src.homeArea,
          stores: [...(src.stores || [])],
          lastUpdated: null,
          lastAction: null,
          deferredAt: null
        };
        await Store.put('items', item);
      }
    }
    return id;
  },

  async renameLocation(id, name) {
    const loc = await Store.get('locations', id);
    if (!loc) return;
    loc.name = name;
    await Store.put('locations', loc);
    const items = await Store.getAll('items');
    for (const item of items) {
      if (item.perLocation && item.perLocation[id]) {
        item.perLocation[id].locationName = name;
        await Store.put('items', item);
      }
    }
  },

  async getItems() {
    return Store.getAll('items');
  },

  async getItem(id) {
    return Store.get('items', id);
  },

  async saveItem(item) {
    return Store.put('items', item);
  },

  async deleteItem(id) {
    return Store.delete('items', id);
  },

  async createItem({ name, category, brand, description, locationEntries }) {
    const id = 'item-' + slugify(name) + '-' + Date.now().toString(36);
    const now = new Date().toISOString();
    const perLocation = {};
    for (const entry of locationEntries) {
      perLocation[entry.locationId] = {
        locationName: entry.locationName,
        desiredQty: entry.desiredQty || 0,
        inStock: entry.inStock || 0,
        homeArea: entry.homeArea || '',
        stores: entry.stores || [],
        lastUpdated: now,
        lastAction: 'added',
        deferredAt: null
      };
    }
    const item = { id, name, category: category || 'Uncategorized', brand: brand || '', description: description || '', perLocation, createdAt: now };
    await Store.put('items', item);
    return item;
  },

  async adjustStock(itemId, locationId, delta) {
    const item = await Store.get('items', itemId);
    if (!item || !item.perLocation[locationId]) return null;
    const rec = item.perLocation[locationId];
    rec.inStock = Math.max(0, roundQty(rec.inStock + delta));
    rec.lastUpdated = new Date().toISOString();
    rec.lastAction = delta < 0 ? 'consumed' : 'restocked';
    await Store.put('items', item);
    return item;
  },

  async markPurchased(itemId, locationId) {
    const item = await Store.get('items', itemId);
    if (!item || !item.perLocation[locationId]) return null;
    const rec = item.perLocation[locationId];
    rec.inStock = rec.desiredQty;
    rec.lastUpdated = new Date().toISOString();
    rec.lastAction = 'purchased';
    rec.deferredAt = null;
    await Store.put('items', item);
    return item;
  },

  async deferItem(itemId, locationId) {
    const item = await Store.get('items', itemId);
    if (!item || !item.perLocation[locationId]) return null;
    const rec = item.perLocation[locationId];
    rec.deferredAt = new Date().toISOString();
    rec.lastAction = 'dismissed';
    await Store.put('items', item);
    return item;
  },

  async undeferItem(itemId, locationId) {
    const item = await Store.get('items', itemId);
    if (!item || !item.perLocation[locationId]) return null;
    item.perLocation[locationId].deferredAt = null;
    await Store.put('items', item);
    return item;
  }
};

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'x';
}

function roundQty(n) {
  return Math.round(n * 100) / 100;
}

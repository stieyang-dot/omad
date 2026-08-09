/* OMAD — tiny IndexedDB wrapper. All data lives on-device. */
(function (global) {
  const DB_NAME = 'omad-db';
  const DB_VERSION = 2;
  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('meals')) db.createObjectStore('meals', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('vitamins')) db.createObjectStore('vitamins', { keyPath: 'day' });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function asPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(store) {
    const db = await openDB();
    return asPromise(db.transaction(store).objectStore(store).getAll());
  }
  async function get(store, key) {
    const db = await openDB();
    return asPromise(db.transaction(store).objectStore(store).get(key));
  }
  async function put(store, obj) {
    const db = await openDB();
    return asPromise(db.transaction(store, 'readwrite').objectStore(store).put(obj));
  }
  async function remove(store, key) {
    const db = await openDB();
    return asPromise(db.transaction(store, 'readwrite').objectStore(store).delete(key));
  }
  async function clear(store) {
    const db = await openDB();
    return asPromise(db.transaction(store, 'readwrite').objectStore(store).clear());
  }

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  }

  global.DB = { getAll, get, put, remove, clear, uid };
})(window);

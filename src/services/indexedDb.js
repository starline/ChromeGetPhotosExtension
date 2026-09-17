/**
 * IndexedDB key-value persistence for GetPhotos (side panel origin).
 * One-time migrates legacy chrome.storage.local keys when present.
 * @version 0.1
 */
(function (global) {
    'use strict';

    const DB_NAME = 'GetPhotos';
    const DB_VERSION = 1;
    const STORE_NAME = 'kv';
    const LEGACY_STORAGE_KEYS = Object.freeze([
        'gpSettings',
        'gpPhotosCollection',
        'gpProductsCollection'
    ]);

    /** @type {Promise<IDBDatabase>|null} */
    let dbPromise = null;

    /** @type {Promise<void>|null} */
    let migratePromise = null;

    /**
     * Open (or reuse) the GetPhotos IndexedDB database.
     * @returns {Promise<IDBDatabase>}
     */
    function openDb() {
        if (dbPromise) {
            return dbPromise;
        }

        if (!global.indexedDB) {
            return Promise.reject(new Error('IndexedDB is not available'));
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = global.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                dbPromise = null;
                reject(request.error || new Error('Failed to open IndexedDB'));
            };

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };
        });

        return dbPromise;
    }

    /**
     * Run a read/write operation against the kv object store.
     * @param {'readonly'|'readwrite'} mode
     * @param {(store: IDBObjectStore) => IDBRequest} run
     * @returns {Promise<unknown>}
     */
    async function withStore(mode, run) {
        const db = await openDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);
            const request = run(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    /**
     * Read a value by key from IndexedDB.
     * @param {string} key
     * @returns {Promise<unknown>}
     */
    async function get(key) {
        return withStore('readonly', (store) => store.get(key));
    }

    /**
     * Write a value by key into IndexedDB.
     * @param {string} key
     * @param {unknown} value
     * @returns {Promise<void>}
     */
    async function set(key, value) {
        await withStore('readwrite', (store) => store.put(value, key));
    }

    /**
     * Delete a key from IndexedDB.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async function remove(key) {
        await withStore('readwrite', (store) => store.delete(key));
    }

    /**
     * Copy missing legacy chrome.storage.local entries into IndexedDB.
     * Idempotent per key: only fills empty IndexedDB slots.
     * @returns {Promise<void>}
     */
    async function migrateFromChromeStorage() {
        try {
            const chromeLocal = global.chrome?.storage?.local;
            if (!chromeLocal?.get) {
                return;
            }

            const data = await chromeLocal.get([...LEGACY_STORAGE_KEYS]);
            const migratedKeys = [];

            for (const key of LEGACY_STORAGE_KEYS) {
                if (!(key in data) || data[key] === undefined) {
                    continue;
                }

                const existing = await get(key);
                if (existing === undefined) {
                    await set(key, data[key]);
                    migratedKeys.push(key);
                }
            }

            if (migratedKeys.length > 0 && typeof chromeLocal.remove === 'function') {
                await chromeLocal.remove(migratedKeys);
            }
        } catch (error) {
            console.error('GetPhotos: IndexedDB migration from chrome.storage failed', error);
        }
    }

    /**
     * Run legacy chrome.storage → IndexedDB migration once per page load.
     * @returns {Promise<void>}
     */
    function ensureLegacyMigrated() {
        if (!migratePromise) {
            migratePromise = migrateFromChromeStorage();
        }

        return migratePromise;
    }

    global.GpIndexedDb = Object.freeze({
        DB_NAME,
        DB_VERSION,
        STORE_NAME,
        LEGACY_STORAGE_KEYS,
        get,
        set,
        remove,
        ensureLegacyMigrated
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

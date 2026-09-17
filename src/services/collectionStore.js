/**
 * Persist collected Photos / Products lists in IndexedDB.
 * Survives browser restart; keeps UI free of storage details (SRP).
 * @version 0.2
 */
(function (global) {
    'use strict';

    const PHOTOS_STORAGE_KEY = 'gpPhotosCollection';
    const PRODUCTS_STORAGE_KEY = 'gpProductsCollection';

    /**
     * Empty photos collection DTO.
     * @returns {{ links: string[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }}
     */
    function getEmptyPhotosCollection() {
        return {
            links: [],
            pageUrl: null,
            pageTitle: null,
            updatedAt: null
        };
    }

    /**
     * Empty products collection DTO.
     * @returns {{ products: object[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }}
     */
    function getEmptyProductsCollection() {
        return {
            products: [],
            pageUrl: null,
            pageTitle: null,
            updatedAt: null
        };
    }

    /**
     * Normalize a raw photos collection payload.
     * @param {unknown} raw
     * @returns {{ links: string[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }}
     */
    function normalizePhotosCollection(raw) {
        const empty = getEmptyPhotosCollection();
        if (!raw || typeof raw !== 'object') {
            return empty;
        }

        const links = Array.isArray(raw.links)
            ? raw.links.filter((item) => typeof item === 'string' && item)
            : [];

        return {
            links,
            pageUrl: typeof raw.pageUrl === 'string' && raw.pageUrl ? raw.pageUrl : null,
            pageTitle: typeof raw.pageTitle === 'string' && raw.pageTitle ? raw.pageTitle : null,
            updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
        };
    }

    /**
     * Normalize a single product card DTO.
     * @param {unknown} product
     * @returns {object|null}
     */
    function normalizeProduct(product) {
        if (!product || typeof product !== 'object') {
            return null;
        }

        const photos = Array.isArray(product.photos)
            ? product.photos.filter((item) => typeof item === 'string' && item)
            : [];

        return {
            title: typeof product.title === 'string' ? product.title : '',
            image: typeof product.image === 'string' ? product.image : '',
            price: typeof product.price === 'string' ? product.price : '',
            sales: typeof product.sales === 'string' ? product.sales : '',
            url: typeof product.url === 'string' ? product.url : '',
            photos
        };
    }

    /**
     * Normalize a raw products collection payload.
     * @param {unknown} raw
     * @returns {{ products: object[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }}
     */
    function normalizeProductsCollection(raw) {
        const empty = getEmptyProductsCollection();
        if (!raw || typeof raw !== 'object') {
            return empty;
        }

        const products = Array.isArray(raw.products)
            ? raw.products.map(normalizeProduct).filter(Boolean)
            : [];

        return {
            products,
            pageUrl: typeof raw.pageUrl === 'string' && raw.pageUrl ? raw.pageUrl : null,
            pageTitle: typeof raw.pageTitle === 'string' && raw.pageTitle ? raw.pageTitle : null,
            updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
        };
    }

    /**
     * Load photos collection from IndexedDB.
     * @returns {Promise<{ links: string[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }>}
     */
    async function loadPhotosCollection() {
        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            const data = await global.GpIndexedDb.get(PHOTOS_STORAGE_KEY);
            return normalizePhotosCollection(data);
        } catch (error) {
            console.error('GetPhotos: unable to load photos collection', error);
            return getEmptyPhotosCollection();
        }
    }

    /**
     * Save photos collection to IndexedDB.
     * @param {{ links: string[], pageUrl?: string|null, pageTitle?: string|null, updatedAt?: string|null }} collection
     * @returns {Promise<void>}
     */
    async function savePhotosCollection(collection) {
        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            const payload = normalizePhotosCollection({
                ...collection,
                updatedAt: collection?.updatedAt || new Date().toISOString()
            });

            await global.GpIndexedDb.set(PHOTOS_STORAGE_KEY, payload);
        } catch (error) {
            console.error('GetPhotos: unable to save photos collection', error);
        }
    }

    /**
     * Load products collection from IndexedDB.
     * @returns {Promise<{ products: object[], pageUrl: string|null, pageTitle: string|null, updatedAt: string|null }>}
     */
    async function loadProductsCollection() {
        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            const data = await global.GpIndexedDb.get(PRODUCTS_STORAGE_KEY);
            return normalizeProductsCollection(data);
        } catch (error) {
            console.error('GetPhotos: unable to load products collection', error);
            return getEmptyProductsCollection();
        }
    }

    /**
     * Save products collection to IndexedDB.
     * @param {{ products: object[], pageUrl?: string|null, pageTitle?: string|null, updatedAt?: string|null }} collection
     * @returns {Promise<void>}
     */
    async function saveProductsCollection(collection) {
        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            const payload = normalizeProductsCollection({
                ...collection,
                updatedAt: collection?.updatedAt || new Date().toISOString()
            });

            await global.GpIndexedDb.set(PRODUCTS_STORAGE_KEY, payload);
        } catch (error) {
            console.error('GetPhotos: unable to save products collection', error);
        }
    }

    /**
     * Clear stored photos collection.
     * @returns {Promise<void>}
     */
    async function clearPhotosCollection() {
        await savePhotosCollection(getEmptyPhotosCollection());
    }

    /**
     * Clear stored products collection.
     * @returns {Promise<void>}
     */
    async function clearProductsCollection() {
        await saveProductsCollection(getEmptyProductsCollection());
    }

    global.GpCollectionStore = Object.freeze({
        PHOTOS_STORAGE_KEY,
        PRODUCTS_STORAGE_KEY,
        getEmptyPhotosCollection,
        getEmptyProductsCollection,
        loadPhotosCollection,
        savePhotosCollection,
        loadProductsCollection,
        saveProductsCollection,
        clearPhotosCollection,
        clearProductsCollection
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

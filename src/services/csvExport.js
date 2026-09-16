/**
 * Build and download CSV exports for collected Photos / Products.
 * @version 0.1
 */
(function (global) {
    'use strict';

    /**
     * @param {unknown} value
     * @returns {string}
     */
    function escapeCsvCell(value) {
        const text = value == null ? '' : String(value);
        if (/[",\r\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }

        return text;
    }

    /**
     * @param {string[]} headers
     * @param {Array<Array<unknown>>} rows
     * @returns {string}
     */
    function buildCsv(headers, rows) {
        const lines = [
            headers.map(escapeCsvCell).join(','),
            ...rows.map((row) => row.map(escapeCsvCell).join(','))
        ];

        // BOM so Excel opens UTF-8 correctly
        return `\uFEFF${lines.join('\r\n')}`;
    }

    /**
     * @param {string} csvText
     * @param {string} filename
     */
    function downloadCsv(csvText, filename) {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        // Revoke after the browser starts the download
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    /**
     * @param {string} prefix
     * @returns {string}
     */
    function buildFilename(prefix) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        return `${prefix}-${stamp}.csv`;
    }

    /**
     * @param {string[]} links
     * @param {{ pageUrl?: string|null, pageTitle?: string|null, updatedAt?: string|null }} meta
     */
    function downloadPhotosCsv(links, meta = {}) {
        const headers = ['url', 'pageUrl', 'pageTitle', 'collectedAt'];
        const rows = (Array.isArray(links) ? links : []).map((url) => [
            url,
            meta.pageUrl || '',
            meta.pageTitle || '',
            meta.updatedAt || ''
        ]);

        downloadCsv(buildCsv(headers, rows), buildFilename('getphotos'));
    }

    /**
     * @param {object[]} products
     * @param {{ pageUrl?: string|null, pageTitle?: string|null, updatedAt?: string|null }} meta
     */
    function downloadProductsCsv(products, meta = {}) {
        const headers = [
            'title',
            'price',
            'sales',
            'url',
            'image',
            'photos',
            'pageUrl',
            'pageTitle',
            'collectedAt'
        ];
        const rows = (Array.isArray(products) ? products : []).map((product) => {
            const photos = Array.isArray(product?.photos) ? product.photos.join('; ') : '';

            return [
                product?.title || '',
                product?.price || '',
                product?.sales || '',
                product?.url || '',
                product?.image || '',
                photos,
                meta.pageUrl || '',
                meta.pageTitle || '',
                meta.updatedAt || ''
            ];
        });

        downloadCsv(buildCsv(headers, rows), buildFilename('getproducts'));
    }

    global.GpCsvExport = Object.freeze({
        escapeCsvCell,
        buildCsv,
        downloadCsv,
        downloadPhotosCsv,
        downloadProductsCsv
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

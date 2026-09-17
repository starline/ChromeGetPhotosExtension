/**
 * IndexedDB settings DTO for the side panel.
 * Keeps persistence out of UI init code (SRP).
 * @version 0.2
 */
(function (global) {
    'use strict';

    const SETTINGS_STORAGE_KEY = 'gpSettings';
    const DEFAULT_MIN_WIDTH = 500;

    /**
     * Normalize a raw min-width input to a non-negative integer or null.
     * @param {unknown} rawValue
     * @returns {number|null}
     */
    function normalizeMinWidthValue(rawValue) {
        const value = Number.parseInt(rawValue, 10);

        if (!Number.isFinite(value) || value < 0) {
            return null;
        }

        return value;
    }

    /**
     * Build default settings DTO.
     * @returns {{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }}
     */
    function getDefaultSettings() {
        return {
            defaultMinWidth: DEFAULT_MIN_WIDTH,
            ...global.GpOpenAiConfig.getDefaultOpenAiSettings()
        };
    }

    /**
     * Load settings from IndexedDB with safe defaults.
     * @returns {Promise<{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }>}
     */
    async function loadSettings() {
        const fallback = getDefaultSettings();

        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            const stored = (await global.GpIndexedDb.get(SETTINGS_STORAGE_KEY)) || {};
            const defaultMinWidth = normalizeMinWidthValue(stored.defaultMinWidth) ?? DEFAULT_MIN_WIDTH;

            return {
                defaultMinWidth,
                ...global.GpOpenAiConfig.mergeOpenAiSettings(stored)
            };
        } catch (error) {
            console.error('GetPhotos: unable to load settings', error);
            return fallback;
        }
    }

    /**
     * Persist settings DTO to IndexedDB.
     * @param {{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }} settings
     * @returns {Promise<void>}
     */
    async function saveSettings(settings) {
        try {
            await global.GpIndexedDb.ensureLegacyMigrated();
            await global.GpIndexedDb.set(SETTINGS_STORAGE_KEY, settings);
        } catch (error) {
            console.error('GetPhotos: unable to save settings', error);
        }
    }

    global.GpSettingsStore = Object.freeze({
        SETTINGS_STORAGE_KEY,
        DEFAULT_MIN_WIDTH,
        normalizeMinWidthValue,
        getDefaultSettings,
        loadSettings,
        saveSettings
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

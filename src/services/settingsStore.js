/**
 * chrome.storage.local settings DTO for the side panel.
 * Keeps persistence out of UI init code (SRP).
 * @version 0.1
 */
(function (global) {
    'use strict';

    const SETTINGS_STORAGE_KEY = 'gpSettings';
    const DEFAULT_MIN_WIDTH = 500;

    /**
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
     * @returns {{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }}
     */
    function getDefaultSettings() {
        return {
            defaultMinWidth: DEFAULT_MIN_WIDTH,
            ...global.GpOpenAiConfig.getDefaultOpenAiSettings()
        };
    }

    /**
     * @returns {Promise<{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }>}
     */
    async function loadSettings() {
        const fallback = getDefaultSettings();

        try {
            if (!global.chrome?.storage?.local?.get) {
                return fallback;
            }

            const data = await global.chrome.storage.local.get(SETTINGS_STORAGE_KEY);
            const stored = data?.[SETTINGS_STORAGE_KEY] || {};
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
     * @param {{ defaultMinWidth: number, openaiApiKey: string, openaiModel: string }} settings
     * @returns {Promise<void>}
     */
    async function saveSettings(settings) {
        try {
            if (!global.chrome?.storage?.local?.set) {
                return;
            }

            await global.chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
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

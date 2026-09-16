/**
 * OpenAI settings infrastructure for future Chat Completions / Responses API calls.
 * Shared between side panel UI and (later) background service worker.
 * @version 0.1
 */
(function (global) {
    'use strict';

    const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

    /** @type {ReadonlyArray<{ id: string, label: string }>} */
    const OPENAI_MODELS = Object.freeze([
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'o4-mini', label: 'o4-mini' },
        { id: 'o3-mini', label: 'o3-mini' }
    ]);

    const OPENAI_MODEL_IDS = Object.freeze(OPENAI_MODELS.map((model) => model.id));

    /**
     * @param {unknown} rawValue
     * @returns {string}
     */
    function normalizeOpenAiApiKey(rawValue) {
        if (typeof rawValue !== 'string') {
            return '';
        }

        return rawValue.trim();
    }

    /**
     * @param {unknown} rawValue
     * @returns {string}
     */
    function normalizeOpenAiModel(rawValue) {
        if (typeof rawValue !== 'string') {
            return DEFAULT_OPENAI_MODEL;
        }

        const modelId = rawValue.trim();

        if (!OPENAI_MODEL_IDS.includes(modelId)) {
            return DEFAULT_OPENAI_MODEL;
        }

        return modelId;
    }

    /**
     * @returns {{ openaiApiKey: string, openaiModel: string }}
     */
    function getDefaultOpenAiSettings() {
        return {
            openaiApiKey: '',
            openaiModel: DEFAULT_OPENAI_MODEL
        };
    }

    /**
     * Merge stored OpenAI fields into a settings DTO fragment.
     * @param {Record<string, unknown>|null|undefined} stored
     * @returns {{ openaiApiKey: string, openaiModel: string }}
     */
    function mergeOpenAiSettings(stored) {
        const source = stored && typeof stored === 'object' ? stored : {};

        return {
            openaiApiKey: normalizeOpenAiApiKey(source.openaiApiKey),
            openaiModel: normalizeOpenAiModel(source.openaiModel)
        };
    }

    /**
     * Fill a <select> with available OpenAI models and select the current value.
     * @param {HTMLSelectElement|null} select
     * @param {string} selectedModelId
     */
    function populateOpenAiModelSelect(select, selectedModelId) {
        if (!select) {
            return;
        }

        const safeModelId = normalizeOpenAiModel(selectedModelId);

        select.replaceChildren();

        OPENAI_MODELS.forEach((model) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            option.selected = model.id === safeModelId;
            select.appendChild(option);
        });

        select.value = safeModelId;
    }

    /**
     * Whether OpenAI credentials look ready for an API call.
     * @param {{ openaiApiKey?: string, openaiModel?: string }|null|undefined} settings
     * @returns {boolean}
     */
    function isOpenAiConfigured(settings) {
        const openai = mergeOpenAiSettings(settings);
        return openai.openaiApiKey.length > 0;
    }

    global.GpOpenAiConfig = Object.freeze({
        DEFAULT_OPENAI_MODEL,
        OPENAI_MODELS,
        OPENAI_MODEL_IDS,
        normalizeOpenAiApiKey,
        normalizeOpenAiModel,
        getDefaultOpenAiSettings,
        mergeOpenAiSettings,
        populateOpenAiModelSelect,
        isOpenAiConfigured
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

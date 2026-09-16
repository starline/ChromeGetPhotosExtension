/**
 * Native side panel UI with tool switcher (GetPhotos / GetProducts / Settings).
 * State lives in this document and survives tab switches.
 * @version 1.3
 */

const COPY_LINK_SUCCESS_MESSAGE = 'Ссылка скопирована в буфер обмена.';
const COPY_IMAGE_SUCCESS_MESSAGE = 'Изображение скопировано в буфер обмена.';
const COPY_ERROR_MESSAGE = 'Не удалось скопировать.';
const REMOVE_IMAGE_SUCCESS_MESSAGE = 'Изображение удалено из списка.';
const REMOVE_PRODUCT_SUCCESS_MESSAGE = 'Товар удалён из списка.';
const DEFAULT_MIN_WIDTH = 500;
const SETTINGS_STORAGE_KEY = 'gpSettings';

const ICON_LINK = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L10.83 6"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07L13.17 18"></path>
    </svg>
`;

const ICON_COPY = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
`;

const ICON_OPEN = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M14 3h7v7"></path>
        <path d="M10 14L21 3"></path>
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
    </svg>
`;

const ICON_MONITOR = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2"></rect>
        <path d="M8 21h8"></path>
        <path d="M12 17v4"></path>
    </svg>
`;

const ICON_DELETE_FOREVER = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M3 6h18"></path>
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        <path d="M10 11l4 4"></path>
        <path d="M14 11l-4 4"></path>
    </svg>
`;

const dimensionsCache = new Map();

/** @type {{ defaultMinWidth: number }} */
let appSettings = { defaultMinWidth: DEFAULT_MIN_WIDTH };

window.gpSidePanelReady = bootstrapSidePanel();

async function bootstrapSidePanel() {
    appSettings = await loadSettings();
    initToolSwitcher();
    initPhotosTool(document.querySelector('[data-tool-panel="photos"]'));
    initProductsTool(document.querySelector('[data-tool-panel="products"]'));
    initSettingsTool(document.querySelector('[data-tool-panel="settings"]'));
    enableBootstrapTooltips(document);
}

function initToolSwitcher() {
    const tools = Array.from(document.querySelectorAll('.gp-tool'));
    const panels = Array.from(document.querySelectorAll('[data-tool-panel]'));

    tools.forEach((button) => {
        button.addEventListener('click', () => {
            const toolId = button.dataset.tool;

            tools.forEach((item) => {
                const isActive = item === button;
                item.classList.toggle('is-active', isActive);
                item.setAttribute('aria-selected', String(isActive));
            });

            panels.forEach((panel) => {
                const isActive = panel.dataset.toolPanel === toolId;
                panel.classList.toggle('gp-hidden', !isActive);
                panel.hidden = !isActive;
            });
        });
    });
}

function initPhotosTool(root) {
    if (!root) {
        return;
    }

    const collectButton = root.querySelector('[data-role="collect"]');
    const minWidthInput = root.querySelector('[data-role="min-width"]');
    const emptyState = root.querySelector('[data-role="empty"]');
    const counter = root.querySelector('[data-role="counter"]');
    const list = root.querySelector('[data-role="list"]');
    const sourceLabel = root.querySelector('[data-role="source"]');
    const status = root.querySelector('[data-role="status"]');
    const sortBar = root.querySelector('[data-role="sort"]');
    const sortButton = root.querySelector('[data-sort="size"]');

    let lastLinks = [];
    let sortField = null;
    let sortDirection = 'desc';

    applyDefaultMinWidth(minWidthInput, appSettings.defaultMinWidth);

    collectButton.addEventListener('click', async () => {
        updateStatus(status, 'Сканируем активную вкладку...');
        collectButton.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({ type: 'COLLECT_IMAGES' });

            if (!response?.ok) {
                lastLinks = [];
                sortField = null;
                sortDirection = 'desc';
                renderLinks([], getMinWidthValue(minWidthInput));
                setSource(sourceLabel, null);
                updateStatus(status, response?.error || 'Не удалось получить изображения.', true);
                return;
            }

            lastLinks = response.links;
            updateStatus(status, '');
            setSource(sourceLabel, response.pageUrl, response.pageTitle);
            await refreshLinksList();
        } catch (error) {
            console.error('GetPhotos: side panel collect failed', error);
            updateStatus(status, 'Не удалось получить изображения.', true);
        } finally {
            collectButton.disabled = false;
        }
    });

    minWidthInput.addEventListener('change', async () => {
        if (!lastLinks.length) {
            return;
        }

        await refreshLinksList();
    });

    sortButton?.addEventListener('click', async () => {
        if (!lastLinks.length) {
            return;
        }

        if (sortField === 'size') {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = 'size';
            // Largest images first by default
            sortDirection = 'desc';
        }

        await refreshLinksList();
    });

    async function refreshLinksList() {
        const minWidth = getMinWidthValue(minWidthInput);
        const filteredLinks = await filterLinksByMinWidth(lastLinks, minWidth);
        const sortedLinks = await sortLinksBySize(filteredLinks, sortField, sortDirection);
        renderLinks(sortedLinks, minWidth);
    }

    function syncSortButton() {
        if (!sortButton) {
            return;
        }

        const isActive = sortField === 'size';
        const arrow = sortDirection === 'asc' ? '↑' : '↓';

        sortButton.classList.toggle('is-active', isActive);
        sortButton.setAttribute('aria-pressed', String(isActive));
        sortButton.textContent = isActive ? `По размеру ${arrow}` : 'По размеру';
    }

    function renderLinks(links, minWidth) {
        disposeBootstrapTooltips(list);
        list.innerHTML = '';

        if (!links.length) {
            emptyState.textContent = minWidth
                ? `Нет изображений шире ${minWidth}px.`
                : 'На странице не найдено изображений.';
            emptyState.classList.remove('gp-hidden');
            list.classList.add('gp-hidden');
            counter.textContent = '';
            counter.classList.add('gp-hidden');
            sortBar?.classList.add('gp-hidden');
            syncSortButton();
            return;
        }

        emptyState.classList.add('gp-hidden');
        list.classList.remove('gp-hidden');
        counter.textContent = formatCount(links.length, ['изображение', 'изображения', 'изображений']);
        counter.classList.remove('gp-hidden');
        sortBar?.classList.remove('gp-hidden');
        syncSortButton();

        links.forEach((link) => list.appendChild(createImageRow(link, status, () => removeLink(link))));
    }

    async function removeLink(link) {
        lastLinks = lastLinks.filter((item) => item !== link);
        dimensionsCache.delete(link);
        updateStatus(status, REMOVE_IMAGE_SUCCESS_MESSAGE);
        await refreshLinksList();
    }
}

async function sortLinksBySize(links, sortField, sortDirection) {
    if (sortField !== 'size' || !links.length) {
        return links.slice();
    }

    const direction = sortDirection === 'asc' ? 1 : -1;
    const details = await Promise.all(
        links.map(async (link) => {
            const dimensions = await getCachedDimensions(link);
            const area = getImageArea(dimensions);
            return { link, area };
        })
    );

    return details
        .sort((left, right) => {
            const leftValid = Number.isFinite(left.area);
            const rightValid = Number.isFinite(right.area);

            if (!leftValid && !rightValid) {
                return 0;
            }
            if (!leftValid) {
                return 1;
            }
            if (!rightValid) {
                return -1;
            }
            if (left.area === right.area) {
                return 0;
            }

            return left.area > right.area ? direction : -direction;
        })
        .map(({ link }) => link);
}

function getImageArea(dimensions) {
    if (!Number.isFinite(dimensions?.width) || !Number.isFinite(dimensions?.height)) {
        return NaN;
    }

    return dimensions.width * dimensions.height;
}

function initSettingsTool(root) {
    if (!root) {
        return;
    }

    const defaultMinWidthInput = root.querySelector('[data-role="default-min-width"]');
    const status = root.querySelector('[data-role="status"]');

    applyDefaultMinWidth(defaultMinWidthInput, appSettings.defaultMinWidth);

    const persistDefaultMinWidth = async () => {
        const value = normalizeMinWidthValue(defaultMinWidthInput.value) ?? DEFAULT_MIN_WIDTH;

        applyDefaultMinWidth(defaultMinWidthInput, value);
        appSettings = { ...appSettings, defaultMinWidth: value };
        await saveSettings(appSettings);
        syncPhotosMinWidth(value);
        updateStatus(status, 'Настройки сохранены.');
    };

    defaultMinWidthInput.addEventListener('change', () => {
        void persistDefaultMinWidth();
    });
}

function initProductsTool(root) {
    if (!root) {
        return;
    }

    const collectButton = root.querySelector('[data-role="collect"]');
    const emptyState = root.querySelector('[data-role="empty"]');
    const counter = root.querySelector('[data-role="counter"]');
    const list = root.querySelector('[data-role="list"]');
    const sourceLabel = root.querySelector('[data-role="source"]');
    const status = root.querySelector('[data-role="status"]');
    const sortBar = root.querySelector('[data-role="sort"]');
    const sortButtons = Array.from(root.querySelectorAll('[data-sort]'));

    let lastProducts = [];
    let sortField = null;
    let sortDirection = 'asc';

    const syncOpenTabHighlight = async () => {
        const tabUrl = await getActiveTabUrl();
        highlightOpenProductInList(list, tabUrl);
    };

    if (chrome.tabs?.onActivated?.addListener) {
        chrome.tabs.onActivated.addListener(() => {
            void syncOpenTabHighlight();
        });
    }

    if (chrome.tabs?.onUpdated?.addListener) {
        chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
            if (changeInfo.url || changeInfo.status === 'complete') {
                void syncOpenTabHighlight();
            }
        });
    }

    collectButton.addEventListener('click', async () => {
        updateStatus(status, 'Парсим товары на активной вкладке...');
        collectButton.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({ type: 'COLLECT_PRODUCTS' });

            if (!response?.ok) {
                lastProducts = [];
                sortField = null;
                sortDirection = 'asc';
                renderProducts([]);
                setSource(sourceLabel, null);
                updateStatus(status, response?.error || 'Не удалось получить товары.', true);
                return;
            }

            updateStatus(status, '');
            setSource(sourceLabel, response.pageUrl, response.pageTitle);
            lastProducts = Array.isArray(response.products) ? response.products : [];
            renderProducts(getSortedProducts(lastProducts));
        } catch (error) {
            console.error('GetProducts: side panel collect failed', error);
            updateStatus(status, 'Не удалось получить товары.', true);
        } finally {
            collectButton.disabled = false;
        }
    });

    sortButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const field = button.dataset.sort;
            if (!field || !lastProducts.length) {
                return;
            }

            if (sortField === field) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                // Price: cheap first; sales: best sellers first
                sortDirection = field === 'sales' ? 'desc' : 'asc';
            }

            renderProducts(getSortedProducts(lastProducts));
        });
    });

    function getSortedProducts(products) {
        if (!sortField) {
            return products.slice();
        }

        const direction = sortDirection === 'asc' ? 1 : -1;
        const parseValue = sortField === 'sales' ? parseSalesValue : parsePriceValue;

        return products.slice().sort((left, right) => {
            const leftValue = parseValue(left[sortField]);
            const rightValue = parseValue(right[sortField]);
            const leftValid = Number.isFinite(leftValue);
            const rightValid = Number.isFinite(rightValue);

            if (!leftValid && !rightValid) {
                return 0;
            }
            if (!leftValid) {
                return 1;
            }
            if (!rightValid) {
                return -1;
            }

            if (leftValue === rightValue) {
                return 0;
            }

            return leftValue > rightValue ? direction : -direction;
        });
    }

    function syncSortButtons() {
        sortButtons.forEach((button) => {
            const field = button.dataset.sort;
            const isActive = sortField === field;
            const baseLabel = field === 'sales' ? 'По продажам' : 'По цене';
            const arrow = sortDirection === 'asc' ? '↑' : '↓';

            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
            button.textContent = isActive ? `${baseLabel} ${arrow}` : baseLabel;
        });
    }

    function renderProducts(products) {
        disposeBootstrapTooltips(list);
        list.innerHTML = '';

        if (!products.length) {
            emptyState.textContent = 'На странице не найдено товаров.';
            emptyState.classList.remove('gp-hidden');
            list.classList.add('gp-hidden');
            counter.textContent = '';
            counter.classList.add('gp-hidden');
            sortBar?.classList.add('gp-hidden');
            syncSortButtons();
            return;
        }

        emptyState.classList.add('gp-hidden');
        list.classList.remove('gp-hidden');
        counter.textContent = formatCount(products.length, ['товар', 'товара', 'товаров']);
        counter.classList.remove('gp-hidden');
        sortBar?.classList.remove('gp-hidden');
        syncSortButtons();

        products.forEach((product) => list.appendChild(createProductRow(product, status, () => removeProduct(product))));
        void syncOpenTabHighlight();
    }

    function removeProduct(product) {
        lastProducts = lastProducts.filter((item) => item !== product);
        updateStatus(status, REMOVE_PRODUCT_SUCCESS_MESSAGE);
        renderProducts(getSortedProducts(lastProducts));
    }
}

/** Active browser tab URL (empty when unavailable). */
async function getActiveTabUrl() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.url || '';
    } catch (error) {
        console.error('GetPhotos: unable to read active tab url', error);
        return '';
    }
}

/** Taobao / Tmall product id from query string. */
function extractProductId(url) {
    if (!url) {
        return '';
    }

    try {
        const id = new URL(url).searchParams.get('id');
        return id && /^\d+$/.test(id) ? id : '';
    } catch (error) {
        return '';
    }
}

function isSameProductUrl(left, right) {
    if (!left || !right) {
        return false;
    }

    const leftId = extractProductId(left);
    const rightId = extractProductId(right);
    if (leftId && rightId) {
        return leftId === rightId;
    }

    try {
        const a = new URL(left);
        const b = new URL(right);
        return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
    } catch (error) {
        return left === right;
    }
}

/** Light-yellow highlight for the product open in the active tab. */
function highlightOpenProductInList(list, tabUrl) {
    if (!list) {
        return;
    }

    list.querySelectorAll('.gp-item[data-product-url]').forEach((item) => {
        const productUrl = item.dataset.productUrl || '';
        item.classList.toggle('is-open-tab', isSameProductUrl(productUrl, tabUrl));
    });
}

function parsePriceValue(price) {
    if (!price) {
        return NaN;
    }

    const match = String(price).replace(/,/g, '').match(/[\d.]+/);
    return match ? Number(match[0]) : NaN;
}

function parseSalesValue(sales) {
    if (!sales) {
        return NaN;
    }

    const match = String(sales).trim().match(/([\d.]+)\s*([万wW])?/);
    if (!match) {
        return NaN;
    }

    let value = Number(match[1]);
    if (!Number.isFinite(value)) {
        return NaN;
    }

    if (match[2]) {
        value *= 10000;
    }

    return value;
}

function createImageRow(link, status, onRemove) {
    const item = document.createElement('li');
    item.className = 'gp-item';

    const preview = document.createElement('img');
    preview.src = link;
    preview.alt = 'Превью изображения';
    preview.width = 100;
    preview.height = 100;
    preview.loading = 'lazy';
    preview.className = 'gp-preview';

    const content = document.createElement('div');
    content.className = 'gp-content';

    const meta = document.createElement('div');
    meta.className = 'gp-meta';
    meta.textContent = 'Загружаем информацию...';

    const actions = document.createElement('div');
    actions.className = 'gp-actions-row';
    actions.append(
        createCopyLinkButton(link, status),
        createCopyImageButton(link, status),
        createOpenButton(link),
        createRemoveButton(onRemove)
    );

    content.append(meta, actions);
    item.append(preview, content);
    hydrateMeta(link, meta);

    return item;
}

function createProductRow(product, status, onRemove) {
    const item = document.createElement('li');
    item.className = 'gp-item';
    if (product.url) {
        item.dataset.productUrl = product.url;
    }

    const preview = document.createElement('img');
    preview.src = product.image || '';
    preview.alt = product.title || 'Превью товара';
    preview.width = 100;
    preview.height = 100;
    preview.loading = 'lazy';
    preview.className = 'gp-preview';

    const content = document.createElement('div');
    content.className = 'gp-content';

    const title = document.createElement('p');
    title.className = 'gp-product-title';
    title.textContent = product.title || 'Без названия';
    if (product.title) {
        title.title = product.title;
        enableBootstrapTooltip(title);
    }

    const stats = document.createElement('div');
    stats.className = 'gp-product-stats';

    const price = document.createElement('span');
    price.className = 'gp-product-price';
    price.textContent = product.price || 'Цена неизвестна';

    const sales = document.createElement('span');
    sales.className = 'gp-product-sales';
    sales.textContent = product.sales ? `Продажи: ${product.sales}` : 'Продажи неизвестны';

    stats.append(price, sales);

    const actions = document.createElement('div');
    actions.className = 'gp-actions-row';
    actions.append(
        createCopyLinkButton(product.url || '', status, !product.url),
        createOpenInSameTabButton(product.url || '', !product.url),
        createOpenButton(product.url || '', !product.url),
        createRemoveButton(onRemove)
    );

    content.append(title, stats, actions);
    item.append(preview, content);

    return item;
}

function createCopyLinkButton(value, status, disabled = false) {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'gp-secondary gp-icon-btn';
    copyButton.title = 'Копировать ссылку';
    copyButton.setAttribute('aria-label', 'Копировать ссылку');
    copyButton.innerHTML = ICON_LINK;
    copyButton.disabled = disabled;
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(value);
            updateStatus(status, COPY_LINK_SUCCESS_MESSAGE);
        } catch (error) {
            console.error('GetPhotos: unable to copy link', error);
            updateStatus(status, COPY_ERROR_MESSAGE, true);
        }
    });
    enableBootstrapTooltip(copyButton);
    return copyButton;
}

function createCopyImageButton(imageUrl, status, disabled = false) {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'gp-secondary gp-icon-btn';
    copyButton.title = 'Копировать изображение';
    copyButton.setAttribute('aria-label', 'Копировать изображение');
    copyButton.innerHTML = ICON_COPY;
    copyButton.disabled = disabled;
    copyButton.addEventListener('click', async () => {
        copyButton.disabled = true;
        try {
            await copyImageToClipboard(imageUrl);
            updateStatus(status, COPY_IMAGE_SUCCESS_MESSAGE);
        } catch (error) {
            console.error('GetPhotos: unable to copy image', error);
            updateStatus(status, COPY_ERROR_MESSAGE, true);
        } finally {
            copyButton.disabled = disabled;
        }
    });
    enableBootstrapTooltip(copyButton);
    return copyButton;
}

async function copyImageToClipboard(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Image fetch failed: ${response.status}`);
    }

    const blob = await response.blob();
    const pngBlob = await ensurePngBlob(blob);

    await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
    ]);
}

function ensurePngBlob(blob) {
    if (blob.type === 'image/png') {
        return Promise.resolve(blob);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((pngBlob) => {
                    URL.revokeObjectURL(objectUrl);
                    if (pngBlob) {
                        resolve(pngBlob);
                    } else {
                        reject(new Error('PNG conversion failed'));
                    }
                }, 'image/png');
            } catch (error) {
                URL.revokeObjectURL(objectUrl);
                reject(error);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image decode failed'));
        };

        img.src = objectUrl;
    });
}

function createOpenButton(url, disabled = false) {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'gp-secondary gp-icon-btn';
    openButton.title = 'Открыть в новой вкладке';
    openButton.setAttribute('aria-label', 'Открыть в новой вкладке');
    openButton.innerHTML = ICON_OPEN;
    openButton.disabled = disabled;
    openButton.addEventListener('click', () => {
        chrome.tabs.create({ url }).catch((error) => {
            console.error('GetPhotos: unable to open url', error);
        });
    });
    enableBootstrapTooltip(openButton);
    return openButton;
}

function createOpenInSameTabButton(url, disabled = false) {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'gp-secondary gp-icon-btn';
    openButton.title = 'Открыть в этой вкладке';
    openButton.setAttribute('aria-label', 'Открыть в этой вкладке');
    openButton.innerHTML = ICON_MONITOR;
    openButton.disabled = disabled;
    openButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                throw new Error('Active tab not found');
            }
            await chrome.tabs.update(tab.id, { url });
        } catch (error) {
            console.error('GetPhotos: unable to open url in current tab', error);
        }
    });
    enableBootstrapTooltip(openButton);
    return openButton;
}

function createRemoveButton(onRemove) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'gp-secondary gp-icon-btn gp-icon-btn--danger';
    removeButton.title = 'Удалить навсегда';
    removeButton.setAttribute('aria-label', 'Удалить навсегда');
    removeButton.innerHTML = ICON_DELETE_FOREVER;
    removeButton.addEventListener('click', () => {
        disposeBootstrapTooltip(removeButton);
        onRemove?.();
    });
    enableBootstrapTooltip(removeButton);
    return removeButton;
}

function setSource(sourceLabel, pageUrl, pageTitle = '') {
    if (!pageUrl) {
        disposeBootstrapTooltip(sourceLabel);
        sourceLabel.removeAttribute('title');
        sourceLabel.textContent = '';
        sourceLabel.classList.add('gp-hidden');
        return;
    }

    const label = pageTitle || pageUrl;
    sourceLabel.textContent = `Собрано с: ${label}`;
    sourceLabel.title = pageUrl;
    sourceLabel.classList.remove('gp-hidden');
    enableBootstrapTooltip(sourceLabel);
}

/**
 * Bootstrap Tooltip for every element with a non-empty title.
 * Replaces the native browser tooltip.
 */
function enableBootstrapTooltips(root = document) {
    if (!root?.querySelectorAll) {
        return;
    }

    root.querySelectorAll('[title]').forEach((element) => enableBootstrapTooltip(element));
}

function enableBootstrapTooltip(element) {
    if (!window.bootstrap?.Tooltip || !element) {
        return null;
    }

    const title = element.getAttribute('title') || element.getAttribute('data-bs-original-title');
    if (!title) {
        disposeBootstrapTooltip(element);
        return null;
    }

    disposeBootstrapTooltip(element);
    // dispose() may restore a previous title — keep the latest text
    element.setAttribute('title', title);
    return new bootstrap.Tooltip(element, {
        container: 'body',
        placement: 'top',
        trigger: 'hover focus'
    });
}

function disposeBootstrapTooltips(root) {
    if (!root?.querySelectorAll) {
        return;
    }

    root.querySelectorAll('[data-bs-original-title], [title]').forEach((element) => {
        disposeBootstrapTooltip(element);
    });
}

function disposeBootstrapTooltip(element) {
    if (!window.bootstrap?.Tooltip || !element) {
        return;
    }

    bootstrap.Tooltip.getInstance(element)?.dispose();
}

function updateStatus(status, message, isError = false) {
    if (!status) {
        return;
    }

    status.textContent = message;
    status.classList.toggle('gp-hidden', !message);
    status.classList.toggle('gp-status--error', isError);
}

function applyDefaultMinWidth(input, value) {
    if (!input) {
        return;
    }

    input.value = String(value);
}

function syncPhotosMinWidth(value) {
    const photosMinWidthInput = document.querySelector('[data-tool-panel="photos"] [data-role="min-width"]');

    if (!photosMinWidthInput) {
        return;
    }

    applyDefaultMinWidth(photosMinWidthInput, value);
    photosMinWidthInput.dispatchEvent(new Event('change'));
}

function normalizeMinWidthValue(rawValue) {
    const value = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(value) || value < 0) {
        return null;
    }

    return value;
}

async function loadSettings() {
    const fallback = { defaultMinWidth: DEFAULT_MIN_WIDTH };

    try {
        if (!chrome?.storage?.local?.get) {
            return fallback;
        }

        const data = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
        const stored = data?.[SETTINGS_STORAGE_KEY] || {};
        const defaultMinWidth = normalizeMinWidthValue(stored.defaultMinWidth) ?? DEFAULT_MIN_WIDTH;

        return { defaultMinWidth };
    } catch (error) {
        console.error('GetPhotos: unable to load settings', error);
        return fallback;
    }
}

async function saveSettings(settings) {
    try {
        if (!chrome?.storage?.local?.set) {
            return;
        }

        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
    } catch (error) {
        console.error('GetPhotos: unable to save settings', error);
    }
}

function getMinWidthValue(input) {
    const value = normalizeMinWidthValue(input.value);

    if (value === null || value <= 0) {
        return null;
    }

    return value;
}

async function filterLinksByMinWidth(links, minWidth) {
    if (!minWidth) {
        return links;
    }

    const details = await Promise.all(
        links.map(async (link) => {
            const dimensions = await getCachedDimensions(link);
            return { link, dimensions };
        })
    );

    return details
        .filter(({ dimensions }) => Number.isFinite(dimensions.width) && dimensions.width >= minWidth)
        .map(({ link }) => link);
}

async function hydrateMeta(link, metaElement) {
    try {
        const details = await loadImageDetails(link);
        metaElement.textContent = formatMeta(details);
    } catch (error) {
        console.error('GetPhotos: unable to load image details', error);
        metaElement.textContent = 'Не удалось получить информацию об изображении';
    }
}

async function loadImageDetails(link) {
    const [dimensions, sizeKb] = await Promise.all([
        getCachedDimensions(link),
        getImageSize(link)
    ]);

    return {
        ...dimensions,
        sizeKb,
        extension: extractExtension(link)
    };
}

function extractExtension(link) {
    try {
        const { pathname } = new URL(link);
        const parts = pathname.split('.');
        if (parts.length < 2) {
            return null;
        }

        const lastPart = parts.pop();
        if (!lastPart || lastPart.includes('/')) {
            return null;
        }

        const extension = lastPart.split(/[?#]/)[0];
        return extension ? extension.toLowerCase() : null;
    } catch (error) {
        return null;
    }
}

function formatMeta({ width, height, extension, sizeKb }) {
    const dimensions = width && height ? `${width}x${height}px` : 'Размер неизвестен';
    const format = extension ? `.${extension}` : 'Формат неизвестен';
    const size = Number.isFinite(sizeKb) ? `${sizeKb} KB` : 'Размер файла неизвестен';

    return `${dimensions} · ${format} · ${size}`;
}

async function getCachedDimensions(link) {
    if (dimensionsCache.has(link)) {
        return dimensionsCache.get(link);
    }

    const dimensions = await getImageDimensions(link);
    dimensionsCache.set(link, dimensions);
    return dimensions;
}

function getImageDimensions(link) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => resolve({ width: null, height: null });
        img.src = link;
    });
}

async function getImageSize(link) {
    try {
        const headResponse = await fetch(link, { method: 'HEAD' });
        const contentLength = headResponse.headers.get('content-length');
        const parsedLength = Number(contentLength);

        if (Number.isFinite(parsedLength) && parsedLength > 0) {
            return Math.max(1, Math.round(parsedLength / 1024));
        }
    } catch (error) {
        console.warn('GetPhotos: unable to fetch HEAD for size', error);
    }

    try {
        const response = await fetch(link);
        if (!response.ok) {
            return null;
        }

        const blob = await response.blob();
        return Math.max(1, Math.round(blob.size / 1024));
    } catch (error) {
        console.warn('GetPhotos: unable to fetch file for size', error);
        return null;
    }
}

function formatCount(count, forms) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    let form = forms[2];

    if (mod10 === 1 && mod100 !== 11) {
        form = forms[0];
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        form = forms[1];
    }

    return `Найдено ${count} ${form}`;
}

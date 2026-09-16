/**
 * Service worker: opens native Chrome side panel and collects data from the active tab.
 * Side panel is global (one shared document across tabs) — do not setOptions with tabId.
 * @version 2.3
 */

const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';
const COLLECT_ERROR_MESSAGE = 'Не удалось прочитать страницу. Обновите вкладку и попробуйте снова.';
const SIDE_PANEL_PATH = 'templates/sidepanel.html';

const MESSAGE_HANDLERS = {
    COLLECT_IMAGES: (message) => collectImagesFromActiveTab(message.minWidth),
    COLLECT_PRODUCTS: () => collectProductsFromActiveTab(),
    START_PICK_PRODUCT: () => startPickProductFromActiveTab(),
    STOP_PICK_PRODUCT: () => stopPickProductFromActiveTab()
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('GetPhotos: failed to set side panel behavior', error);
});

// One global panel instance — shared UI state across all browser tabs
chrome.sidePanel.setOptions({
    path: SIDE_PANEL_PATH,
    enabled: true
}).catch((error) => {
    console.error('GetPhotos: failed to enable global side panel', error);
});

// Hide extension UI on chrome:// and other browser service pages
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    const url = resolveTabUrl(tab);
    if (!url) {
        return;
    }

    syncExtensionAvailability(tabId, url).catch((error) => {
        console.error('GetPhotos: failed to sync tab availability', error);
    });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId)
        .then((tab) => {
            const url = resolveTabUrl(tab);
            if (!url || tab.id == null) {
                return;
            }

            return syncExtensionAvailability(tab.id, url);
        })
        .catch((error) => {
            console.error('GetPhotos: failed to sync active tab availability', error);
        });
});

chrome.tabs.query({})
    .then((tabs) => Promise.all(
        tabs
            .filter((tab) => tab.id != null && resolveTabUrl(tab))
            .map((tab) => syncExtensionAvailability(tab.id, resolveTabUrl(tab)))
    ))
    .catch((error) => {
        console.error('GetPhotos: failed to sync existing tabs', error);
    });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = MESSAGE_HANDLERS[message?.type];
    if (!handler) {
        return undefined;
    }

    handler(message)
        .then((result) => sendResponse(result))
        .catch((error) => {
            console.error(`GetPhotos: ${message.type} failed`, error);
            sendResponse({ ok: false, error: COLLECT_ERROR_MESSAGE });
        });

    return true;
});

/**
 * Resolve active tab and run a page collector. Shared guard for service pages.
 * @param {(tab: chrome.tabs.Tab) => Promise<Record<string, unknown>>} collector
 */
async function collectFromActiveTab(collector) {
    const tab = await getActiveTab();

    if (!tab?.id || !tab.url) {
        return { ok: false, error: SERVICE_PAGE_WARNING };
    }

    if (isServicePage(tab.url)) {
        await syncExtensionAvailability(tab.id, tab.url);
        return { ok: false, error: SERVICE_PAGE_WARNING, pageUrl: tab.url };
    }

    try {
        const payload = await collector(tab);
        return {
            ok: true,
            ...payload,
            pageUrl: tab.url,
            pageTitle: tab.title || ''
        };
    } catch (error) {
        console.error('GetPhotos: page collect failed', error);
        return { ok: false, error: COLLECT_ERROR_MESSAGE, pageUrl: tab.url };
    }
}

async function collectImagesFromActiveTab(minWidth) {
    const minWidthPx = Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 0;

    return collectFromActiveTab(async (tab) => {
        const [{ result: links } = {}] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: collectImageLinksInPage,
            args: [minWidthPx]
        });

        return { links: Array.isArray(links) ? links : [] };
    });
}

async function collectProductsFromActiveTab() {
    return collectFromActiveTab(async (tab) => {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: ensureProductDomToolsInPage
        });

        const [{ result: products } = {}] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => globalThis.__gpProductDomTools.collectAll()
        });

        return { products: Array.isArray(products) ? products : [] };
    });
}

async function startPickProductFromActiveTab() {
    return collectFromActiveTab(async (tab) => {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: ensureProductDomToolsInPage
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => globalThis.__gpProductDomTools.startPick()
        });

        return { started: true };
    });
}

async function stopPickProductFromActiveTab() {
    return collectFromActiveTab(async (tab) => {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: ensureProductDomToolsInPage
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => globalThis.__gpProductDomTools.stopPick()
        });

        return { stopped: true };
    });
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

function collectImageLinksInPage(minWidthPx = 0) {
    const toAbsoluteUrl = (href) => {
        if (!href) {
            return null;
        }

        try {
            return new URL(href, location.href).toString();
        } catch (error) {
            return null;
        }
    };

    const isImageLink = (href) => {
        if (!href) {
            return false;
        }

        try {
            const parsed = new URL(href, location.href);
            return /\.(png|jpe?g|gif|webp|svg)$/i.test(parsed.pathname);
        } catch (error) {
            return false;
        }
    };

    const meetsMinWidth = (img) => {
        if (!minWidthPx) {
            return true;
        }

        const width = img.naturalWidth || 0;
        return width >= minWidthPx;
    };

    const imageSources = Array.from(document.images)
        .filter((img) => meetsMinWidth(img))
        .map((img) => toAbsoluteUrl(img.currentSrc || img.src))
        .filter(Boolean);

    // Anchors have no intrinsic size in DOM — skip them when a min width is required
    const anchorImages = minWidthPx
        ? []
        : Array.from(document.querySelectorAll('a[href]'))
            .map((link) => link.getAttribute('href'))
            .filter((href) => isImageLink(href))
            .map((href) => toAbsoluteUrl(href))
            .filter(Boolean);

    return Array.from(new Set([...imageSources, ...anchorImages]));
}

/**
 * Install shared Taobao / Tmall product DOM tools in the page isolated world.
 * Collect-all and cursor pick share the same parsers. Bump TOOLS_VERSION when parsers change.
 */
function ensureProductDomToolsInPage() {
    const TOOLS_VERSION = 2;
    if (globalThis.__gpProductDomTools?.version === TOOLS_VERSION) {
        return true;
    }

    // Tear down an older pick session before replacing the API
    globalThis.__gpProductDomTools?.stopPick?.();

    const toAbsoluteUrl = (href) => {
        if (!href) {
            return null;
        }

        try {
            return new URL(href, location.href).toString();
        } catch (error) {
            return null;
        }
    };

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const isProductUrl = (href) => {
        if (!href) {
            return false;
        }

        try {
            const parsed = new URL(href, location.href);
            const host = parsed.hostname;
            const path = parsed.pathname;

            return (
                /(item\.taobao\.com|detail\.tmall\.com|detail\.tmall\.hk|chaoshi\.detail\.tmall\.com)$/i.test(host) ||
                /[?&]id=\d+/i.test(parsed.search) ||
                /\/item\.htm/i.test(path)
            );
        } catch (error) {
            return false;
        }
    };

    const pickImage = (root) => {
        const img = root.querySelector('img');
        if (!img) {
            return '';
        }

        const raw =
            img.getAttribute('data-src') ||
            img.getAttribute('data-ks-lazyload') ||
            img.currentSrc ||
            img.src ||
            '';

        const absolute = toAbsoluteUrl(raw.startsWith('//') ? `https:${raw}` : raw);
        return absolute || '';
    };

    const pickTitle = (root, fallbackLink) => {
        const candidates = [
            root.querySelector('[title]'),
            root.querySelector('.title'),
            root.querySelector('.item-name'),
            root.querySelector('a[title]'),
            fallbackLink
        ].filter(Boolean);

        for (const node of candidates) {
            const text = cleanText(node.getAttribute?.('title') || node.textContent);
            if (text && text.length > 2) {
                return text;
            }
        }

        return 'Без названия';
    };

    // Taobao HOP cards: span.price > span.int = price, span.sales = "200+人付款"
    const SALES_TAIL_RE = /([\d.]+[万wW]?[+＋]?)\s*(人付款|已售|sold)/i;
    const SALES_LABELED_RE = /(月销|销量|已售|sold|Sales)[^\d]{0,8}([\d.]+[万wW]?[+＋]?)/i;

    const extractSalesFromText = (text) => {
        const normalized = cleanText(text);
        if (!normalized) {
            return '';
        }

        const tail = normalized.match(SALES_TAIL_RE);
        if (tail) {
            return tail[1];
        }

        const labeled = normalized.match(SALES_LABELED_RE);
        return labeled ? labeled[2] : '';
    };

    const stripSalesFromText = (text) =>
        cleanText(text)
            .replace(SALES_TAIL_RE, ' ')
            .replace(SALES_LABELED_RE, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const pickPrice = (root) => {
        // Prefer dedicated HOP nodes: span.price--… > span.int--…
        const priceWrap =
            root.querySelector('span[class*="price--"]') ||
            root.querySelector('[class*="priceBlock"] [class*="price"]');

        if (priceWrap) {
            const intNode = priceWrap.querySelector('[class*="int--"], [class*="int"]');
            if (intNode) {
                const intPart = cleanText(intNode.textContent);
                const floatPart = cleanText(
                    priceWrap.querySelector('[class*="float--"], [class*="float"], [class*="decimal"]')
                        ?.textContent || ''
                );
                const symbol = cleanText(
                    priceWrap.querySelector('[class*="symbol"], [class*="yen"], [class*="currency"]')
                        ?.textContent || ''
                ) || '¥';

                const number = `${intPart}${floatPart}`.replace(/\s+/g, '');
                if (number) {
                    return `${symbol}${number}`.replace(/\s+/g, '');
                }
            }
        }

        // Fallback: price block / generic price text (strip sales if glued)
        const priceNode =
            priceWrap ||
            root.querySelector('[class*="priceBlock" i]') ||
            root.querySelector('[class*="price" i]') ||
            root.querySelector('.price');

        const raw = cleanText(priceNode?.textContent);
        if (!raw) {
            return '';
        }

        const text = stripSalesFromText(raw);
        const match =
            text.match(/[¥￥]\s*[\d]+(?:\.[\d]+)?/) ||
            text.match(/[\d]+(?:\.[\d]+)?/);

        return match ? match[0].replace(/\s+/g, '') : '';
    };

    const pickSales = (root) => {
        // Prefer dedicated HOP node: span.sales--…
        const salesNode =
            root.querySelector('span[class*="sales--"]') ||
            root.querySelector('[class*="priceBlock"] [class*="sales"]') ||
            root.querySelector('[class*="sales"]');

        if (salesNode) {
            const fromNode = extractSalesFromText(salesNode.textContent);
            if (fromNode) {
                return fromNode;
            }

            const raw = cleanText(salesNode.textContent);
            if (raw) {
                return raw;
            }
        }

        return extractSalesFromText(root.textContent);
    };

    const PRODUCT_LINK_SELECTOR =
        'a[href*="item.taobao.com"], a[href*="detail.tmall.com"], a[href*="item.htm"]';

    const CARD_ROOT_SELECTOR = '.item, .shop-item, [class*="Card"], [class*="item"]';

    const findProductLink = (root) => {
        if (root.matches?.('a[href]') && isProductUrl(root.getAttribute('href'))) {
            return root;
        }

        return root.querySelector?.(PRODUCT_LINK_SELECTOR) || null;
    };

    const resolveCardRoot = (node, link) => {
        const fromNode = node?.closest?.(CARD_ROOT_SELECTOR);
        if (fromNode) {
            return fromNode;
        }

        const fromLink = link?.closest?.(CARD_ROOT_SELECTOR);
        return fromLink || link || node;
    };

    const parseProductFromCard = (card) => {
        const link = findProductLink(card);
        if (!link) {
            return null;
        }

        const url = toAbsoluteUrl(link.getAttribute('href'));
        if (!url || !isProductUrl(url)) {
            return null;
        }

        const root = resolveCardRoot(card, link);
        const title = pickTitle(root, link);
        const image = pickImage(root);
        const price = pickPrice(root);
        const sales = pickSales(root);

        // Skip bare navigation links without product signal
        if (!image && !price && title === 'Без названия') {
            return null;
        }

        return { title, image, price, sales, url };
    };

    /** Walk up from a DOM node to the nearest product card. */
    const findProductCardFromNode = (startNode) => {
        let node = startNode;
        if (node?.nodeType === Node.TEXT_NODE) {
            node = node.parentElement;
        }

        while (node && node !== document.documentElement) {
            const link = findProductLink(node);
            if (link) {
                const url = toAbsoluteUrl(link.getAttribute('href'));
                if (url && isProductUrl(url)) {
                    return resolveCardRoot(node, link);
                }
            }

            node = node.parentElement;
        }

        return null;
    };

    const collectAll = () => {
        const cardSelectors = [
            '.item',
            '.shop-item',
            '.J_TItems .item',
            '[class*="Card--"]',
            '[class*="itemCard"]',
            '[data-spm*="item"]',
            'a[href*="item.taobao.com"]',
            'a[href*="detail.tmall.com"]',
            'a[href*="item.htm"]'
        ];

        const roots = new Set();
        cardSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((node) => roots.add(node));
        });

        const products = [];
        const seen = new Set();

        roots.forEach((node) => {
            const product = parseProductFromCard(node);
            if (!product || seen.has(product.url)) {
                return;
            }

            seen.add(product.url);
            products.push(product);
        });

        return products;
    };

    const HIGHLIGHT_STYLE = '2px solid #0078d4';
    let highlightedEl = null;
    let highlightedPrevOutline = '';
    let highlightedPrevOffset = '';
    let pickActive = false;

    const clearHighlight = () => {
        if (!highlightedEl) {
            return;
        }

        highlightedEl.style.outline = highlightedPrevOutline;
        highlightedEl.style.outlineOffset = highlightedPrevOffset;
        highlightedEl = null;
        highlightedPrevOutline = '';
        highlightedPrevOffset = '';
    };

    const setHighlight = (el) => {
        if (highlightedEl === el) {
            return;
        }

        clearHighlight();
        if (!el) {
            return;
        }

        highlightedPrevOutline = el.style.outline;
        highlightedPrevOffset = el.style.outlineOffset;
        el.style.outline = HIGHLIGHT_STYLE;
        el.style.outlineOffset = '2px';
        highlightedEl = el;
    };

    const onPointerMove = (event) => {
        const card = findProductCardFromNode(event.target);
        setHighlight(card);
    };

    const onClick = (event) => {
        const card = findProductCardFromNode(event.target);
        if (!card) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        // Stay in pick mode until the panel button or Esc turns it off
        const product = parseProductFromCard(card);
        if (!product) {
            try {
                chrome.runtime.sendMessage({ type: 'PRODUCT_PICK_FAILED' });
            } catch (error) {
                // Extension context may be gone
            }
            return;
        }

        try {
            chrome.runtime.sendMessage({ type: 'PRODUCT_PICKED', product });
        } catch (error) {
            // Extension context may be gone
        }
    };

    const onKeyDown = (event) => {
        if (event.key !== 'Escape') {
            return;
        }

        event.preventDefault();
        stopPick();

        try {
            chrome.runtime.sendMessage({ type: 'PRODUCT_PICK_CANCELLED' });
        } catch (error) {
            // Extension context may be gone
        }
    };

    const stopPick = () => {
        if (!pickActive) {
            clearHighlight();
            return;
        }

        pickActive = false;
        document.removeEventListener('pointermove', onPointerMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        clearHighlight();
        document.documentElement.style.cursor = '';
    };

    const startPick = () => {
        stopPick();
        pickActive = true;
        document.documentElement.style.cursor = 'crosshair';
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
    };

    globalThis.__gpProductDomTools = {
        version: TOOLS_VERSION,
        collectAll,
        startPick,
        stopPick
    };

    return true;
}

/**
 * Disable toolbar action on browser service pages.
 * Global panel: toggle enabled only for the *active* tab — never setOptions({ tabId }),
 * that creates a per-tab panel and remounts UI on every tab switch.
 * sidePanel.close({ tabId }) does not close a global panel, so enabled:false is required.
 */
async function syncExtensionAvailability(tabId, url) {
    const service = isServicePage(url);

    if (service) {
        await chrome.action.disable(tabId);
        await chrome.action.setTitle({ title: SERVICE_PAGE_WARNING, tabId });
    } else {
        await chrome.action.enable(tabId);
        await chrome.action.setTitle({ title: 'GetPhotos', tabId });
    }

    let tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (error) {
        return;
    }

    // Only the focused tab controls global panel availability
    if (!tab?.active) {
        return;
    }

    await chrome.sidePanel.setOptions({
        path: SIDE_PANEL_PATH,
        enabled: !service
    });
}

function resolveTabUrl(tab) {
    return tab?.url || tab?.pendingUrl || '';
}

function isServicePage(url) {
    try {
        const parsed = new URL(url);
        const blockedProtocols = new Set([
            'chrome:',
            'edge:',
            'about:',
            'devtools:',
            'chrome-extension:',
            'chrome-search:',
            'chrome-devtools:',
            'view-source:'
        ]);
        return blockedProtocols.has(parsed.protocol);
    } catch (error) {
        return true;
    }
}

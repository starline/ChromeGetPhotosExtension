/**
 * Service worker: opens native Chrome side panel and collects data from the active tab.
 * Side panel is global (one shared document across tabs) — do not setOptions with tabId.
 * @version 1.9
 */

const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';
const SIDE_PANEL_PATH = 'templates/sidepanel.html';

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
    if (message?.type === 'COLLECT_IMAGES') {
        collectImagesFromActiveTab(message.minWidth)
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('GetPhotos: collect failed', error);
                sendResponse({ ok: false, error: SERVICE_PAGE_WARNING });
            });
        return true;
    }

    if (message?.type === 'COLLECT_PRODUCTS') {
        collectProductsFromActiveTab()
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('GetProducts: collect failed', error);
                sendResponse({ ok: false, error: SERVICE_PAGE_WARNING });
            });
        return true;
    }

    return undefined;
});

async function collectImagesFromActiveTab(minWidth) {
    const tab = await getActiveTab();
    const minWidthPx = Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 0;

    if (!tab?.id || !tab.url) {
        return { ok: false, error: SERVICE_PAGE_WARNING };
    }

    if (isServicePage(tab.url)) {
        await syncExtensionAvailability(tab.id, tab.url);
        return { ok: false, error: SERVICE_PAGE_WARNING, pageUrl: tab.url };
    }

    const [{ result: links } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectImageLinksInPage,
        args: [minWidthPx]
    });

    return {
        ok: true,
        links: Array.isArray(links) ? links : [],
        pageUrl: tab.url,
        pageTitle: tab.title || ''
    };
}

async function collectProductsFromActiveTab() {
    const tab = await getActiveTab();

    if (!tab?.id || !tab.url) {
        return { ok: false, error: SERVICE_PAGE_WARNING };
    }

    if (isServicePage(tab.url)) {
        await syncExtensionAvailability(tab.id, tab.url);
        return { ok: false, error: SERVICE_PAGE_WARNING, pageUrl: tab.url };
    }

    const [{ result: products } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectProductsInPage
    });

    return {
        ok: true,
        products: Array.isArray(products) ? products : [],
        pageUrl: tab.url,
        pageTitle: tab.title || ''
    };
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
 * Best-effort Taobao / Tmall shop card scraper.
 * DOM differs by layout; we normalize title, image, price, sales, and product URL.
 */
function collectProductsInPage() {
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
        const link =
            (node.matches?.('a[href]') && node) ||
            node.querySelector('a[href*="item.taobao.com"], a[href*="detail.tmall.com"], a[href*="item.htm"]');

        if (!link) {
            return;
        }

        const url = toAbsoluteUrl(link.getAttribute('href'));
        if (!url || !isProductUrl(url) || seen.has(url)) {
            return;
        }

        const card = node.closest('.item, .shop-item, [class*="Card"], [class*="item"]') || node;
        const title = pickTitle(card, link);
        const image = pickImage(card);
        const price = pickPrice(card);
        const sales = pickSales(card);

        // Skip bare navigation links without product signal
        if (!image && !price && title === 'Без названия') {
            return;
        }

        seen.add(url);
        products.push({ title, image, price, sales, url });
    });

    return products;
}

/**
 * Disable toolbar action on browser service pages. Do not use sidePanel.setOptions({ tabId }) —
 * that creates a per-tab panel and remounts UI on every tab switch.
 */
async function syncExtensionAvailability(tabId, url) {
    const service = isServicePage(url);

    if (service) {
        await chrome.action.disable(tabId);
        await chrome.action.setTitle({ title: SERVICE_PAGE_WARNING, tabId });
        await closeSidePanelIfActive(tabId);
        return;
    }

    await chrome.action.enable(tabId);
    await chrome.action.setTitle({ title: 'GetPhotos', tabId });
}

/**
 * Force-close a stuck panel when the active tab is a service page.
 */
async function closeSidePanelIfActive(tabId) {
    if (typeof chrome.sidePanel.close !== 'function') {
        return;
    }

    let tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (error) {
        return;
    }

    if (!tab?.active) {
        return;
    }

    try {
        await chrome.sidePanel.close({ tabId });
    } catch (error) {
        // Already closed, or only a global instance is open (setOptions handles hide).
    }
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

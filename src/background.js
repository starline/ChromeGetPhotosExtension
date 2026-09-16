/**
 * Service worker: opens native Chrome side panel and collects data from the active tab.
 * @version 1.6
 */

const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';
const SIDE_PANEL_PATH = 'templates/sidepanel.html';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('GetPhotos: failed to set side panel behavior', error);
});

// Hide extension UI on chrome:// and other browser service pages
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    if (!tab.url) {
        return;
    }

    syncExtensionAvailability(tabId, tab.url).catch((error) => {
        console.error('GetPhotos: failed to sync tab availability', error);
    });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId)
        .then((tab) => {
            if (!tab?.url) {
                return;
            }

            return syncExtensionAvailability(tab.id, tab.url);
        })
        .catch((error) => {
            console.error('GetPhotos: failed to sync active tab availability', error);
        });
});

chrome.tabs.query({})
    .then((tabs) => Promise.all(
        tabs
            .filter((tab) => tab.id != null && tab.url)
            .map((tab) => syncExtensionAvailability(tab.id, tab.url))
    ))
    .catch((error) => {
        console.error('GetPhotos: failed to sync existing tabs', error);
    });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'COLLECT_IMAGES') {
        collectImagesFromActiveTab()
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

async function collectImagesFromActiveTab() {
    const tab = await getActiveTab();

    if (!tab?.id || !tab.url) {
        return { ok: false, error: SERVICE_PAGE_WARNING };
    }

    if (isServicePage(tab.url)) {
        await syncExtensionAvailability(tab.id, tab.url);
        return { ok: false, error: SERVICE_PAGE_WARNING, pageUrl: tab.url };
    }

    const [{ result: links } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectImageLinksInPage
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

function collectImageLinksInPage() {
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

    const imageSources = Array.from(document.images)
        .map((img) => toAbsoluteUrl(img.currentSrc || img.src))
        .filter(Boolean);

    const anchorImages = Array.from(document.querySelectorAll('a[href]'))
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
 * Enable side panel + action only on normal web pages; hide on browser service pages.
 */
async function syncExtensionAvailability(tabId, url) {
    const service = isServicePage(url);

    await chrome.sidePanel.setOptions({
        tabId,
        path: SIDE_PANEL_PATH,
        enabled: !service
    });

    if (service) {
        await chrome.action.disable(tabId);
        await chrome.action.setTitle({ title: SERVICE_PAGE_WARNING, tabId });
        return;
    }

    await chrome.action.enable(tabId);
    await chrome.action.setTitle({ title: 'GetPhotos', tabId });
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

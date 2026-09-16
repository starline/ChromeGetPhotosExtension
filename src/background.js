/**
 * Service worker: opens native Chrome side panel and collects data from the active tab.
 * @version 1.3
 */

const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('GetPhotos: failed to set side panel behavior', error);
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

    await resetBadge(tab.id);

    if (isServicePage(tab.url)) {
        await warnServicePage(tab.id);
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

    await resetBadge(tab.id);

    if (isServicePage(tab.url)) {
        await warnServicePage(tab.id);
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

    const pickPrice = (root) => {
        const priceNode =
            root.querySelector('[class*="price" i]') ||
            root.querySelector('[class*="Price"]') ||
            root.querySelector('.price');

        const text = cleanText(priceNode?.textContent);
        if (!text) {
            return '';
        }

        const match = text.match(/(¥|￥)?\s*[\d.,]+/);
        return match ? match[0].replace(/\s+/g, '') : text.slice(0, 32);
    };

    const pickSales = (root) => {
        const text = cleanText(root.textContent);
        const match = text.match(/(月销|销量|付款|已售|sold|Sales)[^\d]{0,8}([\d.]+[万wW]?[+＋]?)/i);
        if (match) {
            return match[2];
        }

        const loose = text.match(/([\d.]+[万wW]?[+＋]?)\s*(人付款|已售|sold)/i);
        return loose ? loose[1] : '';
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

async function warnServicePage(tabId) {
    await chrome.action.setBadgeBackgroundColor({ color: '#d93025', tabId });
    await chrome.action.setBadgeText({ text: '!', tabId });
    await chrome.action.setTitle({ title: SERVICE_PAGE_WARNING, tabId });
}

async function resetBadge(tabId) {
    await chrome.action.setBadgeText({ text: '', tabId });
    await chrome.action.setTitle({ title: 'GetPhotos', tabId });
}

function isServicePage(url) {
    try {
        const parsed = new URL(url);
        const blockedProtocols = new Set(['chrome:', 'edge:', 'about:', 'devtools:', 'chrome-extension:']);
        return blockedProtocols.has(parsed.protocol);
    } catch (error) {
        return true;
    }
}

/**
 * Service worker to render GetPhotos controls as an in-page side panel.
 * @version 1.0
 */

const PANEL_ID = 'getphotos-panel-root';
const PANEL_TEMPLATE_PATH = 'templates/panel.html';
const PANEL_STYLES_PATH = 'assets/panel.css';
const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';
const COPY_SUCCESS_MESSAGE = 'Ссылки скопированы в буфер обмена.';
const COPY_ERROR_MESSAGE = 'Не удалось скопировать ссылки.';

let panelTemplatePromise;
let panelStylesPromise;

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id || !tab.url) {
        return;
    }

    await resetBadge(tab.id);

    if (isServicePage(tab.url)) {
        await warnServicePage(tab.id);
        return;
    }

    try {
        const [panelTemplate, panelStyles] = await Promise.all([
            getPanelTemplate(),
            getPanelStyles()
        ]);

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: toggleSidePanel,
            args: [PANEL_ID, panelTemplate, panelStyles]
        });
    } catch (error) {
        console.error('GetPhotos: failed to toggle panel', error);
        await warnServicePage(tab.id);
    }
});

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

async function loadAsset(path) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`GetPhotos: failed to load asset ${path}`);
    }

    return response.text();
}

async function getPanelTemplate() {
    if (!panelTemplatePromise) {
        panelTemplatePromise = loadAsset(PANEL_TEMPLATE_PATH);
    }

    return panelTemplatePromise;
}

async function getPanelStyles() {
    if (!panelStylesPromise) {
        panelStylesPromise = loadAsset(PANEL_STYLES_PATH);
    }

    return panelStylesPromise;
}

function toggleSidePanel(panelId, templateHtml, styles) {
    const existing = document.getElementById(panelId);
    if (existing) {
        existing.remove();
        return;
    }

    // Helpers are declared inside to avoid ReferenceError when script runs in the page context.
    const collectImageLinks = () => {
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

        const links = [...imageSources, ...anchorImages];
        return Array.from(new Set(links));
    };

    const createLinkRow = (link) => {
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
        actions.className = 'gp-actions';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'gp-secondary';
        copyButton.textContent = 'Копировать';
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(link);
                updateStatus(COPY_SUCCESS_MESSAGE);
            } catch (error) {
                console.error('GetPhotos: unable to copy link', error);
                updateStatus(COPY_ERROR_MESSAGE, true);
            }
        });

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'gp-primary';
        openButton.textContent = 'Открыть';
        openButton.addEventListener('click', () => {
            try {
                window.open(link, '_blank', 'noopener');
            } catch (error) {
                console.error('GetPhotos: unable to open image', error);
            }
        });

        actions.append(copyButton, openButton);
        content.append(meta, actions);
        item.append(preview, content);

        hydrateMeta(link, meta);

        return item;
    };

    const hydrateMeta = async (link, metaElement) => {
        try {
            const details = await loadImageDetails(link);
            metaElement.textContent = formatMeta(details);
        } catch (error) {
            console.error('GetPhotos: unable to load image details', error);
            metaElement.textContent = 'Не удалось получить информацию об изображении';
        }
    };

    const loadImageDetails = async (link) => {
        const [dimensions, sizeKb] = await Promise.all([
            getImageDimensions(link),
            getImageSize(link)
        ]);

        return {
            ...dimensions,
            sizeKb,
            extension: extractExtension(link)
        };
    };

    const extractExtension = (link) => {
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
    };

    const formatMeta = ({ width, height, extension, sizeKb }) => {
        const dimensions = width && height ? `${width}x${height}px` : 'Размер неизвестен';
        const format = extension ? `.${extension}` : 'Формат неизвестен';
        const size = Number.isFinite(sizeKb) ? `${sizeKb} KB` : 'Размер файла неизвестен';

        return `${dimensions} · ${format} · ${size}`;
    };

    const getImageDimensions = (link) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = () => resolve({ width: null, height: null });
            img.src = link;
        });
    };

    const getImageSize = async (link) => {
        try {
            const headResponse = await fetch(link, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            const parsedLength = Number(contentLength);

            if (Number.isFinite(parsedLength) && parsedLength > 0) {
                const sizeKb = Math.max(1, Math.round(parsedLength / 1024));
                return sizeKb;
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
    };

    const formatImageCount = (count) => {
        const mod10 = count % 10;
        const mod100 = count % 100;

        if (mod10 === 1 && mod100 !== 11) {
            return `Найдено ${count} изображение`;
        }

        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            return `Найдено ${count} изображения`;
        }

        return `Найдено ${count} изображений`;
    };

    const renderLinks = (links, elements) => {
        const { emptyState, list, counter } = elements;

        list.innerHTML = '';

        if (!links.length) {
            emptyState.textContent = 'На странице не найдено изображений.';
            emptyState.classList.remove('gp-hidden');
            list.classList.add('gp-hidden');
            counter.textContent = '';
            counter.classList.add('gp-hidden');
            return;
        }

        emptyState.classList.add('gp-hidden');
        list.classList.remove('gp-hidden');
        counter.textContent = formatImageCount(links.length);
        counter.classList.remove('gp-hidden');

        links.forEach((link) => list.appendChild(createLinkRow(link)));
    };

    const updateStatus = (message, isError = false) => {
        const status = panel.querySelector('.gp-status');
        status.textContent = message;
        status.classList.toggle('gp-hidden', !message);
        status.classList.toggle('gp-status--error', isError);
    };

    const host = document.createElement('div');
    host.id = panelId;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.right = '0';
    host.style.zIndex = '2147483647';
    host.style.height = '100vh';
    host.style.width = '380px';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;

    const panel = document.createElement('section');
    panel.className = 'gp-panel';
    panel.innerHTML = templateHtml;

    shadowRoot.append(style, panel);
    document.body.appendChild(host);

    const closeButton = panel.querySelector('.gp-close');
    const collectButton = panel.querySelector('.gp-primary');
    const emptyState = panel.querySelector('.gp-empty');
    const counter = panel.querySelector('.gp-counter');
    const list = panel.querySelector('.gp-list');
    let lastLinks = [];

    closeButton.addEventListener('click', () => host.remove());

    collectButton.addEventListener('click', () => {
        lastLinks = collectImageLinks();
        updateStatus('');
        renderLinks(lastLinks, { emptyState, list, counter });
    });
}

/**
 * Service worker to render GetPhotos controls as an in-page side panel.
 * @version 0.3
 */

const PANEL_ID = 'getphotos-panel-root';
const SERVICE_PAGE_WARNING = 'Расширение недоступно на служебных страницах браузера.';

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
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: toggleSidePanel
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

function toggleSidePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
        existing.remove();
        return;
    }

    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.right = '0';
    host.style.zIndex = '2147483647';
    host.style.height = '100vh';
    host.style.width = '380px';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = getStyles();

    const panel = document.createElement('section');
    panel.className = 'gp-panel';
    panel.innerHTML = `
        <div class="gp-surface" role="dialog" aria-label="GetPhotos">
            <header class="gp-header">
                <div class="gp-title">
                    <span class="gp-name">GetPhotos</span>
                    <span class="gp-subtitle">Управление</span>
                </div>
                <button class="gp-close" type="button" aria-label="Закрыть панель">×</button>
            </header>
            <p class="gp-hint">Выберите действие для текущей страницы.</p>
            <div class="gp-actions">
                <button class="gp-primary" type="button">Получить изображения</button>
            </div>
            <div class="gp-results" aria-live="polite">
                <p class="gp-empty">Список изображений появится здесь.</p>
                <ul class="gp-list gp-hidden"></ul>
            </div>
        </div>
    `;

    shadowRoot.append(style, panel);
    document.body.appendChild(host);

    const closeButton = panel.querySelector('.gp-close');
    const collectButton = panel.querySelector('.gp-primary');
    const emptyState = panel.querySelector('.gp-empty');
    const list = panel.querySelector('.gp-list');

    closeButton.addEventListener('click', () => host.remove());

    collectButton.addEventListener('click', () => {
        const links = collectImageLinks();
        renderLinks(links, { emptyState, list });
    });
}

function renderLinks(links, elements) {
    const { emptyState, list } = elements;

    list.innerHTML = '';

    if (!links.length) {
        emptyState.textContent = 'На странице не найдено изображений.';
        emptyState.classList.remove('gp-hidden');
        list.classList.add('gp-hidden');
        return;
    }

    emptyState.classList.add('gp-hidden');
    list.classList.remove('gp-hidden');

    links.forEach((link) => {
        const item = document.createElement('li');
        item.textContent = link;
        list.appendChild(item);
    });
}

function collectImageLinks() {
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
}

function toAbsoluteUrl(href) {
    if (!href) {
        return null;
    }

    try {
        return new URL(href, location.href).toString();
    } catch (error) {
        return null;
    }
}

function isImageLink(href) {
    if (!href) {
        return false;
    }

    try {
        const parsed = new URL(href, location.href);
        return /\.(png|jpe?g|gif|webp|svg)$/i.test(parsed.pathname);
    } catch (error) {
        return false;
    }
}

function getStyles() {
    return `
        :host {
            font-family: "Segoe UI", sans-serif;
            color: #1c1c1c;
        }

        .gp-panel {
            height: 100vh;
            width: 100%;
        }

        .gp-surface {
            box-sizing: border-box;
            height: 100%;
            width: 100%;
            background: #ffffff;
            border-left: 1px solid #d9d9d9;
            box-shadow: -4px 0 12px rgba(0, 0, 0, 0.08);
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .gp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .gp-title {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .gp-name {
            font-size: 18px;
            font-weight: 600;
        }

        .gp-subtitle {
            color: #666666;
            font-size: 13px;
        }

        .gp-close {
            border: none;
            background: transparent;
            font-size: 20px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 6px;
            line-height: 1;
        }

        .gp-close:hover {
            background: #f0f0f0;
        }

        .gp-hint {
            margin: 0;
            color: #4f4f4f;
        }

        .gp-actions {
            display: flex;
            gap: 8px;
        }

        .gp-primary {
            padding: 10px 14px;
            font-size: 14px;
            border-radius: 8px;
            border: 1px solid #0078d4;
            background: #0078d4;
            color: #ffffff;
            cursor: pointer;
            transition: transform 0.1s ease, box-shadow 0.1s ease;
            box-shadow: 0 2px 4px rgba(0, 120, 212, 0.2);
        }

        .gp-primary:active {
            transform: translateY(1px);
        }

        .gp-results {
            border: 1px solid #e3e3e3;
            border-radius: 10px;
            padding: 12px;
            background: #fafafa;
            flex: 1;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .gp-list {
            padding-left: 20px;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 13px;
            word-break: break-all;
        }

        .gp-hidden {
            display: none;
        }
    `;
}

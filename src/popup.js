/**
 * Popup logic for GetPhotos dialog controls.
 * @version 0.6
 */

const selectors = {
    openDialog: 'openDialog',
    closeDialog: 'closeDialog',
    dialog: 'controlsDialog',
    collectImages: 'collectImages',
    imageList: 'imageList',
    emptyState: 'emptyState',
    imageCount: 'imageCount'
};

const dialog = document.getElementById(selectors.dialog);
const openButton = document.getElementById(selectors.openDialog);
const closeButton = document.getElementById(selectors.closeDialog);
const collectButton = document.getElementById(selectors.collectImages);
const imageList = document.getElementById(selectors.imageList);
const emptyState = document.getElementById(selectors.emptyState);
const imageCount = document.getElementById(selectors.imageCount);

openButton.addEventListener('click', () => {
    dialog.showModal();
});

closeButton.addEventListener('click', () => {
    dialog.close();
});

dialog.addEventListener('close', () => {
    imageList.innerHTML = '';
    imageList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    imageCount.textContent = '';
    imageCount.classList.add('hidden');
});

collectButton.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) {
        renderEmpty('Не удалось получить активную вкладку.');
        return;
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectImageLinks
    });

    const links = (results[0]?.result || []).filter(Boolean);
    renderImages(links);
});

function renderImages(links) {
    imageList.innerHTML = '';

    if (!links.length) {
        renderEmpty('На странице не найдено изображений.');
        return;
    }

    emptyState.classList.add('hidden');
    imageList.classList.remove('hidden');
    renderCount(links.length);

    links.forEach((link) => {
        const item = createImageItem(link);
        imageList.appendChild(item);
    });
}

function renderEmpty(message) {
    emptyState.textContent = message;
    emptyState.classList.remove('hidden');
    imageList.classList.add('hidden');
    imageCount.textContent = '';
    imageCount.classList.add('hidden');
}

function renderCount(count) {
    imageCount.textContent = formatImageCount(count);
    imageCount.classList.remove('hidden');
}

function formatImageCount(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
        return `Найдено ${count} изображение`;
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return `Найдено ${count} изображения`;
    }

    return `Найдено ${count} изображений`;
}

function createImageItem(link) {
    const item = document.createElement('li');
    item.classList.add('image-item');

    const preview = document.createElement('img');
    preview.src = link;
    preview.alt = 'Превью изображения';
    preview.width = 100;
    preview.height = 100;
    preview.loading = 'lazy';
    preview.classList.add('image-item__preview');

    const content = document.createElement('div');
    content.classList.add('image-item__content');

    const meta = document.createElement('div');
    meta.classList.add('image-item__meta');
    meta.textContent = 'Загружаем информацию...';

    const actions = document.createElement('div');
    actions.classList.add('image-item__actions');

    const copyButton = createCopyButton(link);
    const openButton = createOpenButton(link);

    actions.append(copyButton, openButton);
    content.append(meta, actions);
    item.append(preview, content);

    hydrateMeta(link, meta);

    return item;
}

function createCopyButton(link) {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.classList.add('secondary');
    copyButton.textContent = 'Копировать';
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(link);
            copyButton.textContent = 'Скопировано';
            setTimeout(() => (copyButton.textContent = 'Копировать'), 1500);
        } catch (error) {
            console.error('GetPhotos: unable to copy link', error);
            copyButton.textContent = 'Ошибка';
            setTimeout(() => (copyButton.textContent = 'Копировать'), 1500);
        }
    });

    return copyButton;
}

function createOpenButton(link) {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.classList.add('primary');
    openButton.textContent = 'Открыть';
    openButton.addEventListener('click', () => {
        try {
            window.open(link, '_blank', 'noopener');
        } catch (error) {
            console.error('GetPhotos: unable to open image', error);
        }
    });

    return openButton;
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
        getImageDimensions(link),
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

        const extension = lastPart.split(/[#?]/)[0];
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
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
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

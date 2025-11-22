/**
 * Popup logic for GetPhotos dialog controls.
 * @version 0.4
 */

const selectors = {
    openDialog: 'openDialog',
    closeDialog: 'closeDialog',
    dialog: 'controlsDialog',
    collectImages: 'collectImages',
    imageList: 'imageList',
    emptyState: 'emptyState'
};

const dialog = document.getElementById(selectors.dialog);
const openButton = document.getElementById(selectors.openDialog);
const closeButton = document.getElementById(selectors.closeDialog);
const collectButton = document.getElementById(selectors.collectImages);
const imageList = document.getElementById(selectors.imageList);
const emptyState = document.getElementById(selectors.emptyState);

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

    links.forEach((link) => {
        const item = document.createElement('li');
        item.classList.add('image-item');

        const anchor = document.createElement('a');
        anchor.href = link;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = link;
        anchor.classList.add('image-item__link');

        const preview = document.createElement('img');
        preview.src = link;
        preview.alt = 'Превью изображения';
        preview.width = 100;
        preview.height = 100;
        preview.loading = 'lazy';
        preview.classList.add('image-item__preview');

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

        item.append(anchor, preview, copyButton);
        imageList.appendChild(item);
    });
}

function renderEmpty(message) {
    emptyState.textContent = message;
    emptyState.classList.remove('hidden');
    imageList.classList.add('hidden');
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

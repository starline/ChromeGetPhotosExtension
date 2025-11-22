/**
 * Popup logic for GetPhotos dialog controls.
 * @version 0.1
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
        item.textContent = link;
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
        .map((img) => img.currentSrc || img.src)
        .filter(Boolean);

    const anchorImages = Array.from(document.querySelectorAll('a[href]'))
        .map((link) => link.href)
        .filter((href) => /\.(png|jpe?g|gif|webp|svg)$/i.test(new URL(href, location.href).pathname));

    const links = [...imageSources, ...anchorImages].map((href) => new URL(href, location.href).toString());
    return Array.from(new Set(links));
}

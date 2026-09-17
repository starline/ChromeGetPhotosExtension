# GetPhotos — Chrome Extension

A Manifest V3 extension with a native **Side Panel** and a top tool switcher:

- **GetProducts** (first / default tab) — parses Taobao / Tmall shop pages and extracts product cards: image, title, sales count, price, and product link. Use **Получить товары** for a full-page scan, or the **cursor** icon to enter pick mode: while the button is on you can click multiple cards (hover outline, click to add); turn the button off or press Esc to stop. Click a product **title** to open an in-panel detail card (image, price, sales, URL, collected photos). Open a product in the current tab (monitor icon) or in a new tab. The product open in the active browser tab is highlighted in the list with a light-yellow background. In the detail card, use **Фотографии** to collect images from the open product page into the same row list as GetPhotos (preview, meta, copy/open/remove, **По размеру** sort). Hover a photo thumbnail to see an enlarged crop beside it; moving the pointer pans that crop. Products (including collected photos) persist across restarts; export/clear the same way as GetPhotos.
- **GetPhotos** — collects image links from the active page (`<img>` `src` and links with image file extensions), deduplicates them, filters by minimum width, and lets you copy URL/image, open links, or remove items from the current list. Hover a thumbnail for an enlarged crop that follows the pointer. The list is saved in **IndexedDB** and restored after browser restart; use **Экспорт CSV** / **Очистить**.
- **Settings** (gear icon) — app defaults: default minimum image width (500px), OpenAI API token, and OpenAI model. Values are saved in **IndexedDB** for the GetPhotos filter and future AI API calls.

The panel stays open across tab switches as **one shared global panel** — lists, filters, and active tool stay the same on every tab. Rescan runs only when you click the collect button for the active tool.

On browser service pages (`chrome://`, `edge://`, `about:`, DevTools, etc.) the toolbar action is disabled and the side panel is hidden — the extension is not available there.

## Requirements
- Google Chrome 114+ (Side Panel API) or another Chromium browser with Manifest V3 + side panel support.
- Access to the pages you want to collect data from (scan runs against the active tab).
- (Optional) An [OpenAI API key](https://platform.openai.com/api-keys) if you plan to use AI features once they are wired up.

## Installation
1. Download or clone the repository to a folder of your choice, e.g. `~/GetPhotos`.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project root (`GetPhotos`).
4. Pin the extension icon on the toolbar for quick access to the side panel.

## Usage
1. Open the page you want to scan.
2. Click the extension icon — the Chrome side panel opens (and stays open across tab switches).
3. Use the **square icons** at the top to switch tools:
   - **GetProducts** (opens by default) — on a Taobao/Tmall shop page click **Получить товары** to list products (image, title, price, sales, link), or the **cursor** button to pick cards: while it stays pressed, hover shows a blue outline and each click adds a product; click the button again or press Esc to exit pick mode. Click the product title to open the detail card inside the panel (Esc or back to return). Use **По цене** / **По продажам** above the list to sort (click again to reverse direction). Open a product in the current tab, open its detail card, then use **Фотографии** to fill a GetPhotos-style list from that product page (copy URL/image, open, remove; **По размеру** sorts by area). Product photos keep only images at least as wide as the default min width in Settings. Export/clear via the same persist buttons.
   - **GetPhotos** — optionally adjust minimum width (prefilled from Settings, default 500) and click **Получить изображения**. Use **По размеру** above the list to sort by image area (width × height; click again to reverse). **Экспорт CSV** downloads the saved links; **Очистить** wipes the stored list.
   - **Settings** (gear on the right) — set default minimum image width, OpenAI API token, and model; saved in IndexedDB. Width syncs into the GetPhotos filter; token/model are ready for upcoming AI API calls.
4. Switch browser tabs freely — the same panel and collected lists stay. Close the browser and reopen: saved Photos/Products lists reload automatically from IndexedDB.
5. Use the **link** icon to copy a URL, the **copy** icon to copy the image itself, the **open** icon to open the link in a new tab, the **monitor** icon (products) to open the product page in the current tab, or the **delete forever** icon to remove an item from the current list (also updates storage). In GetProducts, the item matching the active tab URL is highlighted (light yellow). Open the product detail card and use **Фотографии** to collect product-page images into the same list UI as GetPhotos (including **По размеру**). Only images whose intrinsic width is ≥ the Settings default min width are kept. Hover tooltips (Bootstrap) show action labels on buttons and other titled controls.
6. Close the panel with Chrome’s side panel close control.

## Project structure
- `manifest.json` — MV3 manifest (`permissions`: `activeTab`, `tabs`, `scripting`, `sidePanel`, `storage` for one-time legacy migration).
- `src/background.js` — service worker; side panel behavior, image collection, Taobao product parsing, cursor pick mode on the active tab.
- `src/sidepanel.js` — side panel UI (tool switcher, settings, lists, filters, sort, persist/export CSV, product detail card, copy link/image, open in new/same tab, highlight product open in active tab, collect product photos into a GetPhotos-style sortable list in the detail card, thumbnail hover zoom for photo previews, multi-pick products from page while cursor mode is on, remove from list, Bootstrap tooltips).
- `src/services/openaiConfig.js` — OpenAI settings helpers (model list, normalize, `GpOpenAiConfig` for future API use).
- `src/services/indexedDb.js` — IndexedDB key-value layer (`GpIndexedDb`) + one-time migrate from `chrome.storage.local`.
- `src/services/settingsStore.js` — app settings persistence (IndexedDB: default min width + OpenAI fields).
- `src/services/collectionStore.js` — Photos/Products collection persistence (IndexedDB).
- `src/services/csvExport.js` — CSV build + download for Photos and Products.
- `templates/sidepanel.html`, `assets/panel.css` — side panel page and styles.
- `assets/vendor/bootstrap.bundle.min.js` — Bootstrap 5 (tooltips only; local for MV3 CSP).
- `templates/dev-preview.html` — browser preview with mocked Chrome APIs and fake Photos/Products data.
- `assets/` — icons and styles used by the templates.

## Development and debugging
- After editing files, click **Reload** on `chrome://extensions/` to refresh the extension.
- View service worker logs in the extension’s DevTools (**Service Worker** → **Inspect**).
- Right-click inside the side panel → **Inspect** to debug the panel UI.
- Collect always targets the currently active tab; the global side panel itself does not remount or clear on tab change.
- **UI preview in a normal browser** (no Chrome extension load needed): from the project root run `npx --yes serve -p 5173 .` and open `http://localhost:5173/templates/dev-preview`. The page mimics Chrome with a mock active tab on the left and the side panel on the right. Switch tools with the square icons; both lists are prefilled with sample data.

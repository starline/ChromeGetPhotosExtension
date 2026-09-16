# GetPhotos — Chrome Extension

A Manifest V3 extension with a native **Side Panel** and a top tool switcher:

- **GetPhotos** — collects image links from the active page (`<img>` `src` and links with image file extensions), deduplicates them, filters by minimum width, and lets you copy URL/image, open links, or remove items from the current list.
- **GetProducts** — parses Taobao / Tmall shop pages and extracts product cards: image, title, sales count, price, and product link. Open a product in the current tab (monitor icon) or in a new tab. The product open in the active browser tab is highlighted in the list with a light-yellow background.
- **Settings** (gear icon) — app defaults; currently the default minimum image width (500px), applied to the GetPhotos filter field.

The panel stays open across tab switches. Rescan runs only when you click the collect button for the active tool.

On browser service pages (`chrome://`, `edge://`, `about:`, DevTools, etc.) the toolbar action is disabled and the side panel is hidden — the extension is not available there.

## Requirements
- Google Chrome 114+ (Side Panel API) or another Chromium browser with Manifest V3 + side panel support.
- Access to the pages you want to collect data from (scan runs against the active tab).

## Installation
1. Download or clone the repository to a folder of your choice, e.g. `~/GetPhotos`.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project root (`GetPhotos`).
4. Pin the extension icon on the toolbar for quick access to the side panel.

## Usage
1. Open the page you want to scan.
2. Click the extension icon — the Chrome side panel opens (and stays open across tab switches).
3. Use the **square icons** at the top to switch tools:
   - **GetPhotos** — optionally adjust minimum width (prefilled from Settings, default 500) and click **Получить изображения**. Use **По размеру** above the list to sort by image area (width × height; click again to reverse).
   - **GetProducts** — on a Taobao/Tmall shop page click **Получить товары** to list products (image, title, price, sales, link). Use **По цене** / **По продажам** above the list to sort (click again to reverse direction).
   - **Settings** (gear on the right) — set the default minimum image width; it is saved in `chrome.storage` and synced into the GetPhotos filter field.
4. Switch browser tabs freely — the panel and collected lists stay until you collect again.
5. Use the **link** icon to copy a URL, the **copy** icon to copy the image itself, the **open** icon to open the link in a new tab, the **monitor** icon (products) to open the product page in the current tab, or the **delete forever** icon to remove an item from the current list. In GetProducts, the item matching the active tab URL is highlighted (light yellow). Hover tooltips (Bootstrap) show action labels on buttons and other titled controls.
6. Close the panel with Chrome’s side panel close control.

## Project structure
- `manifest.json` — MV3 manifest (`permissions`: `activeTab`, `tabs`, `scripting`, `sidePanel`, `storage`).
- `src/background.js` — service worker; side panel behavior, image collection, Taobao product parsing.
- `src/sidepanel.js` — side panel UI (tool switcher, settings, lists, filters, sort by image size / price / sales, copy link/image, open in new/same tab, highlight product open in active tab, remove from list, Bootstrap tooltips).
- `templates/sidepanel.html`, `assets/panel.css` — side panel page and styles.
- `assets/vendor/bootstrap.bundle.min.js` — Bootstrap 5 (tooltips only; local for MV3 CSP).
- `templates/dev-preview.html` — browser preview with mocked Chrome APIs and fake Photos/Products data.
- `assets/` — icons and styles used by the templates.

## Development and debugging
- After editing files, click **Reload** on `chrome://extensions/` to refresh the extension.
- View service worker logs in the extension’s DevTools (**Service Worker** → **Inspect**).
- Right-click inside the side panel → **Inspect** to debug the panel UI.
- Collect always targets the currently active tab; the panel itself does not reload on tab change.
- **UI preview in a normal browser** (no Chrome extension load needed): from the project root run `npx --yes serve -p 5173 .` and open `http://localhost:5173/templates/dev-preview`. The page mimics Chrome with a mock active tab on the left and the side panel on the right. Switch tools with the square icons; both lists are prefilled with sample data.

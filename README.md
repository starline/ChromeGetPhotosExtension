# GetPhotos — Chrome Extension

A Manifest V3 extension that pulls all image links from any open page (`<img>` `src` and links with image file extensions), lists them, and removes duplicates. You can filter out images below a chosen width and quickly copy the collected URLs.

## Requirements
- Google Chrome 88+ or another Chromium browser with Manifest V3 support.
- Access to the pages you want to collect links from (the extension runs in the active tab).

## Installation
1. Download or clone the repository to a folder of your choice, e.g. `~/GetPhotos`.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project root (`GetPhotos`).
4. Pin the extension icon on the toolbar for quick access to the collector.

## Usage
1. Open the page you want to extract image links from.
2. Click the GetPhotos icon — a side panel opens with a minimum-width filter and a **Collect images** button.
3. Optionally set a minimum width and click **Collect images**: the extension scans `<img>` tags and links to image files, lists unique URLs, and shows dimensions/size.
4. Click **Copy** next to a link to copy the URL to the clipboard, or **Open** to open the image in a new tab.
5. Close the panel with the close button.

## Project structure
- `manifest.json` — MV3 manifest (`permissions`: `activeTab`, `tabs`, `scripting`).
- `src/background.js` — service worker; injects the side panel onto the page.
- `templates/panel.html`, `assets/panel.css` — side panel markup and styles.
- `assets/` — icons and styles used by the templates.

## Development and debugging
- After editing files, click **Reload** on `chrome://extensions/` to refresh the extension.
- View service worker logs in the extension’s DevTools (**Service Worker** → **Inspect**).
- The embedded panel uses `chrome.scripting.executeScript` and Shadow DOM, so testing on real pages with images is the most practical approach.

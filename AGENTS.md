# 🤖 Codex Agent Profile for Chrome extension

## 🧠 Цель агента

Агент помогает в разработке и сопровождении расширение для Google Chrome

Его задача :
- помогать с рефакторингом, архитектурой и best-practices
- генерировать код в стиле проекта
- давать советы уверенно, кратко и по делу — в духе владельца бизнеса

## 🔧 Особенности проекта

- JavaScript (ES6+), HTML, CSS
- Chrome Extension Manifest V3
- Без бандлера / сборки: файлы грузятся как есть из корня расширения
- UI: native Side Panel (не popup)

## 🏗 Архитектура приложения

### Обзор

GetPhotos — MV3-расширение с **одним глобальным Side Panel** (общий документ на все вкладки). UI держит списки и активный инструмент в памяти документа; сканирование страницы всегда идёт по **активной вкладке** через service worker.

```
[Active tab DOM]
       ↑ chrome.scripting.executeScript (injected collectors / pick mode)
       |
[src/background.js]  ←── chrome.runtime.sendMessage ──→  [src/sidepanel.js]
  service worker              COLLECT_IMAGES /                     UI + in-memory state
  sidePanel enable/disable    COLLECT_PRODUCTS
  page collectors             START_PICK_PRODUCT /
                              STOP_PICK_PRODUCT
                              ← PRODUCT_PICKED / CANCELLED
                                                              ↓
                                                    [src/services/*]
                                                    IndexedDB (GpIndexedDb)
```

### Слои и ответственность (SRP)

| Слой | Файлы | Ответственность |
|------|--------|-----------------|
| Manifest | `manifest.json` | MV3 entrypoints, permissions (`activeTab`, `tabs`, `scripting`, `sidePanel`, `storage` for legacy migrate), host permissions |
| Background | `src/background.js` | Side Panel behavior, доступность на служебных страницах, message bus, inject collectors в active tab |
| UI | `src/sidepanel.js` + `templates/sidepanel.html` | Tool switcher, списки, фильтры/сорт, copy/open/remove, highlight товара на активной вкладке |
| Services | `src/services/indexedDb.js`, `settingsStore.js`, `openaiConfig.js`, `collectionStore.js` | IndexedDB KV (`GpIndexedDb`), settings/collections DTO, OpenAI helpers — IIFE → `globalThis` |
| Styles / assets | `assets/panel.css`, icons, `assets/vendor/bootstrap.bundle.min.js` | Стили панели; Bootstrap только для tooltips (локально из‑за MV3 CSP) |
| Dev preview | `templates/dev-preview.html` | Моки Chrome API + демо-данные; UI без загрузки расширения |

### Поток данных: сбор

1. Пользователь жмёт collect в панели → `chrome.runtime.sendMessage({ type: 'COLLECT_IMAGES' | 'COLLECT_PRODUCTS', ... })`.
2. `background.js` → `MESSAGE_HANDLERS` → `collectFromActiveTab` (guard: service pages).
3. `chrome.scripting.executeScript` инжектит **чистую функцию** из background (`collectImageLinksInPage` / `ensureProductDomToolsInPage` + `collectAll`) в DOM вкладки.
4. Ответ `{ ok, links|products, pageUrl, pageTitle, error? }` → UI рендерит и держит в локальных массивах (`lastLinks` / products). Повторный collect перезаписывает список; смена вкладки **не** очищает панель.
5. **Pick product**: кнопка-курсор → `START_PICK_PRODUCT` → inject `startPick` на активной вкладке (outline по hover, click парсит карточку). Пока режим включён, страница шлёт `PRODUCT_PICKED` / `PRODUCT_PICK_FAILED` на каждый клик → sidepanel **добавляет** товары в список (без полной перезаписи). Выход: Esc или повторный клик по кнопке → `STOP_PICK_PRODUCT` / `PRODUCT_PICK_CANCELLED`.

### Поток данных: настройки

- Хранение: **IndexedDB** (`GetPhotos` / store `kv`), ключи `gpSettings`, `gpPhotosCollection`, `gpProductsCollection`.
- DTO настроек: `{ defaultMinWidth, openaiApiKey, openaiModel }`.
- Порядок скриптов в HTML: `openaiConfig.js` → `indexedDb.js` → `settingsStore.js` → `collectionStore.js` → `sidepanel.js`.
- При первом открытии панели: одноразовая миграция из `chrome.storage.local` (если были старые данные).
- `defaultMinWidth` синкается в фильтр GetPhotos; OpenAI поля пока только хранятся (API ещё не вызывается).

### Инструменты UI (один panel, три режима)

- **photos** — ссылки на изображения, min width, sort по площади, copy URL/image, open, remove.
- **products** — карточки Taobao/Tmall; collect all / cursor multi-pick (пока кнопка включена); sort price/sales; клик по названию → in-panel карточка товара; open same/new tab; highlight по URL активной вкладки; кнопка «Фотографии» в карточке → тот же `COLLECT_IMAGES` в сетку фото товара.
- **settings** — defaults + OpenAI token/model.

### Жёсткие инварианты для агента

- Side panel **глобальный**: не вызывать `sidePanel.setOptions({ tabId })` — иначе ломается shared UI.
- Collectors в background — функции для `executeScript`; не тянуть туда DOM панели и не закрывать над chrome globals из panel.
- Новую бизнес-логику выносить в `src/services/*` (IIFE + `Object.freeze` API на `globalThis`), UI не должен сам писать в storage/нормализовать DTO.
- Сообщения: расширять `MESSAGE_HANDLERS` в background + вызовы из sidepanel; контракт ответа — `{ ok, ... }`.
- Служебные URL (`chrome://`, `edge://`, `about:`, DevTools и т.п.) — расширение disabled / panel closed.
- После правок в файле с `@version` — увеличить на `0.1`.

## 📚 Структура кода проекта

- `assets/` — изображения, иконки, CSS, vendor
- `src/` — исходный код расширения (`background.js`, `sidepanel.js`, `services/`)
- `templates/` — HTML side panel + `dev-preview.html`
- корень — `manifest.json`, `README.md`, этот профиль агента
- `README.md` — документация по установке и использованию; дополнять при новом функционале

## 🔥 Правила стиля агента

- Пиши как опытный разработчик и предприниматель (уверенно, лаконично)
- Избегай общих фраз вроде "это зависит..." — давай прямой ответ
- Предлагай SRP-рефакторинг, вынос в сервисы, DTO при необходимости
- Если что-то неясно — уточни, не выдумывай
- Не удаляй мои комментарии в коде, там где это возможно
- Если вносишь изменения в файл, увеличевай @version на 0.1
- Если видишь в коде комментарий с TODO:, выполни описаную в нем задачу
- Используй принципы SOLID в программировании
- Используй tab size 4 (spaces)
- Пиши комментарии в коде там, где это необходимо для понимания логики
- Дополнять документацию README.md по мере развития функционала

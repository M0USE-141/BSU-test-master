/**
 * main.js — SPA entry point
 * Loaded as <script type="module"> from index.html
 */
import { initTheme } from './utils/theme.js';
import { initI18n } from './i18n.js';
import { initRouter } from './router.js';

// Apply theme synchronously before render to avoid flash
initTheme();

// Initialize i18n, then start the router
await initI18n();
initRouter(document.getElementById('app'));

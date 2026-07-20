/**
 * Root Vite config is intentionally minimal.
 * The product UI is built via `vite.app-web.config.ts` (`npm run build:web`).
 * Electron loads `app-web/dist`; do not reintroduce a second renderer entry.
 */
import appWebConfig from './vite.app-web.config.ts';

export default appWebConfig;

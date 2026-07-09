/**
 * Root Vite config is intentionally minimal.
 * The product UI is built via `vite.app-web.config.ts` (`npm run build:web`).
 * `src/renderer` is a legacy prototype and is not loaded by the Electron app.
 */
import appWebConfig from './vite.app-web.config.ts';

export default appWebConfig;

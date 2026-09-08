import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appWebRoot = path.resolve(__dirname, 'app-web');
const runtimeAssetPaths = [
  'ui/empty-state/penguin-hug-card.png',
  'ui/empty-state/penguin-relax-card.png',
  'ui/empty-state/penguin-sleepy-card.png',
  'ui/icons/ask-for-help.png',
  'ui/icons/cyber-security.png',
  'ui/icons/generative.png',
  'ui/icons/warning.png',
  'ui/penguin_logo_user.png',
] as const;

/** Copy runtime static assets that are referenced by plain string URLs (not Vite imports). */
function copyPublicAssetsPlugin(outDir: string): Plugin {
  return {
    name: 'haish-copy-public-assets',
    apply: 'build',
    closeBundle() {
      for (const relativePath of runtimeAssetPaths) {
        const from = path.join(appWebRoot, 'assets', relativePath);
        const to = path.join(outDir, 'assets', relativePath);
        if (!fs.existsSync(from)) throw new Error(`Missing runtime asset: ${relativePath}`);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.cpSync(from, to, { recursive: true, force: true });
      }
    },
  };
}

/** Serve /assets from app-web during vite preview/dev if ever used. */
function serveStaticAssetsPlugin(): Plugin {
  return {
    name: 'haish-serve-static-assets',
    configureServer(server) {
      const roots: Record<string, string> = {
        '/assets': path.join(appWebRoot, 'assets'),
      };
      server.middlewares.use((req, res, next) => {
        // Let Vite turn imported assets into URL-exporting JavaScript modules.
        if (new URL(req.url || '/', 'http://localhost').searchParams.has('import')) return next();
        const url = req.url?.split('?')[0] || '';
        for (const [prefix, root] of Object.entries(roots)) {
          if (!url.startsWith(`${prefix}/`) && url !== prefix) continue;
          const rel = decodeURIComponent(url.slice(prefix.length).replace(/^\/+/, ''));
          const filePath = path.resolve(root, rel);
          if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            break;
          }
          res.setHeader('Content-Type', guessContentType(filePath));
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.css':
      return 'text/css';
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

export default defineConfig(({ mode }) => {
  const releaseBuild = mode === 'release';
  const outDir = path.resolve(appWebRoot, releaseBuild ? 'dist-release' : 'dist');
  return {
  root: appWebRoot,
  base: './',
  publicDir: false,
  plugins: [react(), tailwindcss(), serveStaticAssetsPlugin(), copyPublicAssetsPlugin(outDir)],
  resolve: {
    alias: {
      '@': path.join(appWebRoot, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir,
    // Open desktop windows may still import chunks from an earlier local build.
    // Only clean the isolated release output, never the live renderer directory.
    emptyOutDir: releaseBuild,
    sourcemap: process.env.HAISH_DEV_WEB_WATCH === '1',
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: path.join(appWebRoot, 'index.html'),
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/build/[name]-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/@streamdown/code/')) return 'markdown-code';
          if (id.includes('/@streamdown/mermaid/') || id.includes('/mermaid/')) return undefined;
          // Preserve dynamic language/theme imports instead of merging all grammars.
          if (id.includes('/shiki/') || id.includes('/@shikijs/')) return undefined;
          if (id.includes('/@lexical/') || id.includes('/lexical/')) return 'editor';
          if (id.includes('/@xyflow/')) return 'workflow';
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
          // Let Rollup keep optional Markdown plugin dependencies in lazy chunks.
          return undefined;
        },
      },
    },
  },
  esbuild: {
    // Keep existing JSX runtime style (React in scope via imports).
    jsx: 'automatic',
  },
  };
});

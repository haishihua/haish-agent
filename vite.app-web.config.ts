import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appWebRoot = path.resolve(__dirname, 'app-web');
const outDir = path.resolve(appWebRoot, 'dist');

/** Copy runtime static assets that are referenced by plain string URLs (not Vite imports). */
function copyPublicAssetsPlugin(): Plugin {
  const copyDirs = ['assets', 'agent-world'] as const;

  const copyTree = (from: string, to: string) => {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true, force: true });
  };

  return {
    name: 'haish-copy-public-assets',
    apply: 'build',
    closeBundle() {
      for (const dir of copyDirs) {
        copyTree(path.join(appWebRoot, dir), path.join(outDir, dir));
      }
    },
  };
}

/** Serve /assets and /agent-world from app-web during vite preview/dev if ever used. */
function serveStaticAssetsPlugin(): Plugin {
  return {
    name: 'haish-serve-static-assets',
    configureServer(server) {
      const roots: Record<string, string> = {
        '/assets': path.join(appWebRoot, 'assets'),
        '/agent-world': path.join(appWebRoot, 'agent-world'),
      };
      server.middlewares.use((req, res, next) => {
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

export default defineConfig({
  root: appWebRoot,
  base: './',
  publicDir: false,
  plugins: [react(), serveStaticAssetsPlugin(), copyPublicAssetsPlugin()],
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
    emptyOutDir: process.env.HAISH_DEV_WEB_WATCH === '1' ? false : true,
    sourcemap: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: path.join(appWebRoot, 'index.html'),
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/build/[name]-[hash][extname]',
      },
    },
  },
  esbuild: {
    // Keep existing JSX runtime style (React in scope via imports).
    jsx: 'automatic',
  },
});

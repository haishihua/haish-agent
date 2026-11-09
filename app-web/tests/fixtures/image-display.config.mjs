import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'image-display-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/conversations/')) return next();
        const path = new URL(req.url, 'http://localhost').searchParams.get('image_path') || '';
        const portrait = path.includes('portrait');
        const width = portrait ? 724 : 2172;
        const height = portrait ? 2172 : 724;
        res.setHeader('content-type', 'image/svg+xml');
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="purple"/><rect width="8%" height="100%" fill="red"/><rect x="92%" width="8%" height="100%" fill="lime"/></svg>`);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
});

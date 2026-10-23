import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 离线浏览器回归：只监听本机，真实返回 200/403/404/503，不使用运行时或外部图片。
export default defineConfig({
    plugins: [react(), {
        name: 'answer-image-fixture',
        configureServer(server) {
            const requests = [];
            server.middlewares.use((req, res, next) => {
                if (req.url === '/__image_requests') {
                    res.setHeader('content-type', 'application/json');
                    return res.end(JSON.stringify(requests));
                }
                if (!req.url?.startsWith('/api/conversations/')) return next();
                const url = new URL(req.url, 'http://localhost');
                const path = url.searchParams.get('image_path') || '';
                let status = path.includes('forbidden') || path.includes('/foreign/') ? 403 : path.includes('missing') ? 404 : path.includes('server-error') ? 503 : 200;
                // 模拟任务 artifacts 已清理：任何 artifact 路径都返回 404。
                if (path.includes('/tasks/') || path.includes('/artifacts/')) status = 404;
                requests.push({ path, status, range: req.headers.range || '', time: Date.now() });
                res.statusCode = status;
                res.setHeader('cache-control', 'no-store');
                res.setHeader('content-type', status === 200 ? 'image/svg+xml' : 'text/plain');
                // 新旧两代用不同颜色和文字，防止“URL 对但内容仍是旧图”的假阳性。
                const oldGeneration = path.includes('gen-old');
                const newGeneration = path.includes('gen-new');
                const color = oldGeneration ? '#b91c1c' : newGeneration ? '#15803d' : '#6d4bca';
                const label = oldGeneration ? 'OLD generation' : newGeneration ? 'NEW generation' : 'Generated image';
                const body = status === 200 ? `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/><text x="30" y="95" fill="white" font-size="24">${label}</text></svg>` : 'unavailable';
                // 慢图只慢正文：预检探针（Range: bytes=0-0）要立刻回，否则 8.5s 探针
                // + 8.5s 图片会把断言窗口变成 17 秒，测的还是“慢”不是“预检”。
                const delay = path.includes('slow') && !req.headers.range ? 8500 : 0;
                if (delay) setTimeout(() => res.end(body), delay);
                else res.end(body);
            });
        },
    }],
    server: { host: '127.0.0.1', port: 5199, strictPort: true },
});

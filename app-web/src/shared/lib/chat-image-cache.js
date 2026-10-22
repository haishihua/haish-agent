// 只记已由原生 Image 解码成功的预览，不缓存失败，不主动 fetch，也不生成 blob。
// 保留 Image 引用，让生成卡→最终回答→切回会话复用浏览器已经持有的图片。
const MAX_ENTRIES = 24;
const MAX_PIXELS = 32 * 1024 * 1024;

function previewReference(value) {
    try {
        const url = new URL(String(value || ''), globalThis.location?.href || 'http://haish.local');
        const endpoint = /^(.*\/api\/conversations\/([^/]+)\/messages\/images\/preview)$/.exec(url.pathname);
        const path = url.searchParams.get('image_path');
        if (!endpoint || !path) return null;
        return { scope: `${url.origin}${endpoint[1]}`, conversationId: decodeURIComponent(endpoint[2]), path };
    } catch {
        return null;
    }
}

async function adoptedImageName(path) {
    // 后端 _adopt_answer_image：sha1(源绝对路径)[:16] + '-' + source.name[:120]。
    // 不能仅凭文件名复用（不同任务会生成同名图），更不能跨会话复用。
    if (!/\/tasks\/[^/]+\/artifacts\//.test(path) || !globalThis.crypto?.subtle) return '';
    const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(path));
    const prefix = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    return `${prefix}-${Array.from(path.split('/').at(-1)).slice(0, 120).join('')}`;
}

export function createChatImageCache({ maxEntries = MAX_ENTRIES, maxPixels = MAX_PIXELS } = {}) {
    const entries = new Map();
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener());
    let pixels = 0;
    const touch = (key, entry) => {
        entries.delete(key);
        entries.set(key, entry);
        return entry;
    };
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        get(url) {
            const reference = previewReference(url);
            if (!reference) return null;
            const key = `${reference.scope}\n${reference.path}`;
            const exact = entries.get(key);
            if (exact) return touch(key, exact);
            const owned = /\/conversations\/([^/]+)\/images\/([^/]+)$/.exec(reference.path);
            if (!owned || owned[1] !== reference.conversationId) return null;
            for (const [sourceKey, entry] of entries) {
                if (entry.scope === reference.scope && entry.adoptedName === owned[2]) return touch(sourceKey, entry);
            }
            return null;
        },
        forget(url) {
            const entry = this.get(url);
            if (!entry) return;
            for (const [key, candidate] of entries) {
                if (candidate !== entry) continue;
                pixels -= candidate.pixels;
                entries.delete(key);
            }
            notify();
        },
        async remember(url, image) {
            const reference = previewReference(url);
            const size = Number(image?.naturalWidth) * Number(image?.naturalHeight);
            if (!reference || !image?.complete || !(size > 0) || size > maxPixels) return null;
            const key = `${reference.scope}\n${reference.path}`;
            const previous = entries.get(key);
            if (previous) return touch(key, previous);
            const entry = { scope: reference.scope, src: String(image.currentSrc || image.src || url), image, pixels: size, adoptedName: '' };
            entries.set(key, entry);
            pixels += size;
            while (entries.size > maxEntries || pixels > maxPixels) {
                const oldest = entries.keys().next().value;
                pixels -= entries.get(oldest).pixels;
                entries.delete(oldest);
            }
            notify();
            try {
                entry.adoptedName = await adoptedImageName(reference.path);
            } catch {
                // WebCrypto 不可用时仍复用完全相同的预览地址，不猜测持久化别名。
            }
            notify();
            return entry;
        },
    };
}

const loadedImages = createChatImageCache();
export const subscribeLoadedChatImages = (listener) => loadedImages.subscribe(listener);
export const loadedChatImage = (url) => loadedImages.get(url);
export const forgetLoadedChatImage = (url) => loadedImages.forget(url);
export const rememberLoadedChatImage = (url, image) => loadedImages.remember(url, image);

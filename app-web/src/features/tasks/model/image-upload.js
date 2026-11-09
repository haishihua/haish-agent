/**
 * 上传失败只降级成一句提示跟着正文走：没有像素，但这一笔照发。
 * 反过来把整笔打回输入框，用户得重新选图、重打一遍字，代价比少一张图大得多。
 */
function imageFailureNotice(image, error) {
  const name = image?.file?.name || image?.path || image?.image_id || 'image';
  return `[image could not be uploaded: ${name} — ${String(error?.message || error)}. No pixels were sent; continue with the remaining images and task.]`;
}

/**
 * 上传实现由部署工厂注入（用的是 composer 那一份），这里只管顺序和尽力而为：
 * 单张失败写提示继续下一张，信号中止就当场停手并把已经传好的引用交回去——交回去的那部分
 * 仍然要跟着这一笔走，否则用户会看到图被悄悄吞掉。
 */
export function createImageUploader(uploadImage) {
  return async function uploadImagesBestEffort(images, targetConversationId, signal) {
    const uploaded = [];
    const failures = [];
    for (const image of images) {
      if (signal?.aborted) return { uploaded, failures, aborted: true };
      if (!image.file) {
        uploaded.push(image);
        continue;
      }
      try {
        const result = await uploadImage(image.file, signal, targetConversationId);
        if (!result?.image_id || !result?.path) throw new Error('Image upload response is incomplete.');
        uploaded.push({
          image_id: result.image_id,
          path: result.path,
          mime: result.mime,
          previewUrl: image.previewUrl,
        });
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return { uploaded, failures, aborted: true };
        failures.push(imageFailureNotice(image, error));
      }
    }
    return { uploaded, failures, aborted: false };
  };
}

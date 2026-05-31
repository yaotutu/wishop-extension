export interface DetailImageStabilityOptions {
  maxAttempts: number;
  intervalMs: number;
  stableReads: number;
}

export const DEFAULT_DETAIL_IMAGE_STABILITY_OPTIONS: DetailImageStabilityOptions = {
  maxAttempts: 24,
  intervalMs: 250,
  stableReads: 3,
};

export async function waitForStableDetailImages(
  readImages: () => string[],
  wait: (ms: number) => Promise<void>,
  options: DetailImageStabilityOptions = DEFAULT_DETAIL_IMAGE_STABILITY_OPTIONS,
): Promise<string[]> {
  /**
   * 详情图由淘宝 desc/getdesc 异步接口分批写入 DOM。这里不写死单次等待时长，
   * 而是要求非空图片列表连续多次保持一致；如果页面一直变化，则返回读取过程中
   * 数量最多的一版，尽量避免把首批局部渲染误当成完整详情。
   */
  let bestImages: string[] = [];
  let lastSignature = '';
  let stableCount = 0;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const images = readImages();
    const signature = images.join('\n');
    if (images.length > bestImages.length) bestImages = images;

    if (images.length > 0 && signature === lastSignature) {
      stableCount += 1;
    } else {
      stableCount = images.length > 0 ? 1 : 0;
      lastSignature = signature;
    }

    if (stableCount >= options.stableReads) return images;
    await wait(options.intervalMs);
  }

  return bestImages.length > 0 ? bestImages : readImages();
}

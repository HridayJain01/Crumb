/*
 * Photos are compressed on the device before upload (PRD §39): a ~1024 px JPEG for Gemini
 * and a tiny ~192 px thumbnail for the timeline. The original is never uploaded or stored.
 */

export interface PreparedPhoto {
  base64: string;
  mimeType: 'image/jpeg';
  thumbDataUrl: string;
  previewUrl: string;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> decoding (e.g. some HEIC cases) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source: ImageBitmap | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
      'image/jpeg',
      quality,
    ),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const source = await decode(file);
  const big = await toJpeg(draw(source, 1024), 0.8);
  let thumbDataUrl = await blobToDataUrl(await toJpeg(draw(source, 192), 0.7));
  if (thumbDataUrl.length > 38_000)
    thumbDataUrl = await blobToDataUrl(await toJpeg(draw(source, 128), 0.6));
  if ('close' in source) source.close();
  const dataUrl = await blobToDataUrl(big);
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType: 'image/jpeg',
    thumbDataUrl,
    previewUrl: URL.createObjectURL(big),
  };
}

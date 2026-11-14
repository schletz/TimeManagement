/** Image helpers: compression, base64 conversion and loading. */

export const MAX_EDGE = 2560;
export const JPEG_QUALITY = 0.8;

/**
 * Decodes an image file with EXIF orientation applied. createImageBitmap honours EXIF orientation by default
 * in current browsers; the <img> fallback does so via CSS `image-orientation: from-image` (default).
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to <img> (e.g. HEIC on some browsers)
    }
  }
  return loadImage(file);
}

/** Loads a blob into an <img> element. */
export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

/** Draws a canvas to a JPEG blob. */
export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden.'))), 'image/jpeg', quality);
  });
}

/**
 * Scales an image down to at most `maxEdge` px on the long side and encodes it as JPEG (~80 %).
 */
export async function compressImage(file: Blob, maxEdge = MAX_EDGE, quality = JPEG_QUALITY): Promise<Blob> {
  const source = await decode(file);
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return canvasToJpeg(canvas, quality);
}

/** Blob → base64 without data-URL prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}

/** base64 → Blob. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** base64 JPEG → data URL for <img src>. */
export function jpegDataUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * QR code decoding: native BarcodeDetector where available (Chrome/Android), otherwise zxing-wasm.
 * The zxing WASM file is bundled (no CDN), so scanning also works from the PWA cache.
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): BarcodeDetectorLike;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

let nativeDetector: Promise<BarcodeDetectorLike | null> | null = null;
let zxingReady = false;

function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (!nativeDetector) {
    nativeDetector = (async () => {
      const BD = window.BarcodeDetector;
      if (!BD) return null;
      try {
        const formats = await BD.getSupportedFormats();
        return formats.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null;
      } catch {
        return null;
      }
    })();
  }
  return nativeDetector;
}

async function decodeWithZxing(source: Blob | ImageData): Promise<string | null> {
  const zxing = await import('zxing-wasm/reader');
  if (!zxingReady) {
    zxing.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    zxingReady = true;
  }
  const results = await zxing.readBarcodes(source, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
  return results.find((r) => r.isValid)?.text ?? null;
}

/**
 * Decodes a QR code from an image file (photo of the receipt).
 * @returns QR text or null when no code was found
 */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const native = await getNativeDetector();
  if (native) {
    try {
      const bitmap = await createImageBitmap(file);
      const found = await native.detect(bitmap);
      bitmap.close();
      if (found.length) return found[0].rawValue;
    } catch {
      // fall back to zxing
    }
  }
  return decodeWithZxing(file);
}

/**
 * Decodes a QR code from the current video frame (live scanning).
 * @returns QR text or null when no code is visible
 */
export async function decodeQrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
  if (!video.videoWidth) return null;
  const native = await getNativeDetector();
  if (native) {
    const found = await native.detect(video);
    return found.length ? found[0].rawValue : null;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return decodeWithZxing(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

import { useEffect, useRef, useState } from 'react';
import { decodeQrFromVideo } from '../lib/qr';

/**
 * Full-screen live QR scanner using the rear camera. Calls `onResult` with the first decoded text.
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    const scan = async () => {
      if (stopped || !videoRef.current || !canvasRef.current) return;
      try {
        const text = await decodeQrFromVideo(videoRef.current, canvasRef.current);
        if (text && !stopped) {
          stopped = true;
          resultRef.current(text);
          return;
        }
      } catch {
        // ignore single frame errors
      }
      timer = window.setTimeout(() => void scan(), 350);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        void scan();
      })
      .catch(() => setError('Kamera nicht verfügbar. Bitte den Zugriff erlauben oder ein Foto des Bons verwenden.'));
    if (!navigator.mediaDevices) setError('Kamera wird von diesem Browser nicht unterstützt.');

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="overlay scanner">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="scanner-frame" aria-hidden="true" />
      <div className="overlay-bar">
        <span>{error ?? 'QR-Code am Kassenbon in den Rahmen halten'}</span>
        <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
      </div>
    </div>
  );
}

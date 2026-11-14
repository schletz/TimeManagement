import { useRef, useState } from 'react';
import { errorMessage } from '../api/ApiError';
import { compressImage } from '../lib/image';

/**
 * Two buttons "Kamera" and "Galerie". The chosen image is compressed (max. 2560 px, JPEG 80 %)
 * and handed over as blob together with the original file (e.g. for QR decoding).
 */
export function ImagePicker({ onPicked, cameraLabel = 'Kamera', galleryLabel = 'Galerie', disabled }: {
  onPicked: (compressed: Blob, original: File) => void;
  cameraLabel?: string;
  galleryLabel?: string;
  disabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (!file || !input) return;
    setBusy(true);
    setError(null);
    try {
      onPicked(await compressImage(file), file);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  return (
    <div className="image-picker">
      <div className="button-row">
        <button type="button" className="btn" disabled={disabled || busy} onClick={() => camera.current?.click()}>📷 {cameraLabel}</button>
        <button type="button" className="btn" disabled={disabled || busy} onClick={() => gallery.current?.click()}>🖼️ {galleryLabel}</button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void handle(e.currentTarget)} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void handle(e.currentTarget)} />
      {busy && <p className="hint">Bild wird verkleinert …</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

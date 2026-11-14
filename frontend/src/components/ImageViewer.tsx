import { useEffect, useState } from 'react';
import { errorMessage } from '../api/ApiError';
import type { FileData } from '../api/types';

/** Full-screen viewer that loads a full resolution image from the backend on demand. */
export function ImageViewer({ title, load, onClose }: { title: string; load: () => Promise<FileData>; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((f) => !cancelled && setSrc(`data:${f.mimeType};base64,${f.base64}`))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // load is intentionally only called once per opened viewer
  }, []);

  return (
    <div className="overlay viewer" onClick={onClose}>
      <div className="viewer-body">
        {src ? <img src={src} alt={title} /> : <p className="hint">{error ?? 'Bild wird geladen …'}</p>}
      </div>
      <div className="overlay-bar">
        <span>{title}</span>
        <button type="button" className="btn" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

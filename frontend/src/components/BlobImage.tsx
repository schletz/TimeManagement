import { useEffect, useState } from 'react';

/** Shows a local image blob via an object URL (released on unmount). */
export function BlobImage({ blob, alt, className, onClick }: { blob: Blob; alt: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className={className} onClick={onClick} /> : null;
}

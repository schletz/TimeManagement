import type { FileData } from '../api/types';
import { base64ToBlob } from './image';

/** Saves a base64 file from the backend via a temporary object URL. */
export function downloadFile(file: FileData): void {
  const url = URL.createObjectURL(base64ToBlob(file.base64, file.mimeType));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

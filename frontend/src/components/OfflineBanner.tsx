import { useOnline } from '../hooks/useOnline';

/** Prominent notice while the device is offline (saving is disabled). */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="alert">
      Keine Verbindung – Eingaben bleiben auf dem Gerät gespeichert und können gesendet werden, sobald wieder Netz da ist.
    </div>
  );
}

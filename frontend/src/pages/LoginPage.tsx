import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/ApiError';
import { useAuth } from '../auth/AuthContext';
import { renderSignInButton } from '../auth/gis';
import { config } from '../config';

const DEV_USERS = ['chef@example.com', 'max@example.com', 'eva@example.com'];

/** Sign-in with Google (or dev login against the emulated backend). */
export function LoginPage({ error }: { error?: string }) {
  const { devSignIn } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState(DEV_USERS[1]);

  useEffect(() => {
    if (config.devAuth || !buttonRef.current) return;
    if (!config.googleClientId) {
      setLoadError('VITE_GOOGLE_CLIENT_ID ist nicht konfiguriert.');
      return;
    }
    renderSignInButton(config.googleClientId, buttonRef.current).catch((e) => setLoadError(errorMessage(e)));
  }, []);

  return (
    <div className="login">
      <img src="./icon.svg" alt="" width={72} height={72} />
      <h1>Baustellen-App</h1>
      <p>Bitte mit dem Google-Konto anmelden, das in der Mitarbeiterliste eingetragen ist.</p>
      {error && <div className="error-box" role="alert">{error}</div>}
      {loadError && <div className="error-box" role="alert">{loadError}</div>}
      {config.devAuth ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); devSignIn(devEmail); }}>
          <p className="hint">Entwicklungsmodus (lokaler Emulator) – Anmeldung ohne Google.</p>
          <label className="field">
            <span>E-Mail</span>
            <input list="dev-users" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
            <datalist id="dev-users">{DEV_USERS.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <button type="submit" className="btn btn-primary btn-block">Anmelden</button>
        </form>
      ) : (
        <div ref={buttonRef} className="google-button" />
      )}
    </div>
  );
}

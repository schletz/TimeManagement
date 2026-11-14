import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { OfflineBanner } from './OfflineBanner';

/** App frame: top bar with title, back button and menu. */
export function Layout({ children }: { children: ReactNode }) {
  const { me, isChef, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" onClick={close}>
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span>Baustellen-App</span>
        </Link>
        <button type="button" className="menu-button" aria-expanded={menuOpen} aria-label="Menü" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </header>
      {menuOpen && (
        <nav className="menu" onClick={close}>
          <NavLink to="/" end>Projekte</NavLink>
          <NavLink to="/reimbursements">Meine Erstattungen</NavLink>
          {isChef && (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/admin/projects">Projekte verwalten</NavLink>
              <NavLink to="/admin/employees">Mitarbeiter</NavLink>
              <NavLink to="/admin/catalog">Leistungskatalog</NavLink>
              <NavLink to="/admin/settings">Einstellungen</NavLink>
            </>
          )}
          <div className="menu-user">
            {me?.employee?.name ?? me?.email} {isChef && <span className="badge badge-created">Chef</span>}
          </div>
          <button type="button" className="btn btn-secondary" onClick={signOut}>Abmelden</button>
        </nav>
      )}
      <OfflineBanner />
      <main className="content">{children}</main>
    </div>
  );
}

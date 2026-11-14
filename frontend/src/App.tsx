import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import { CatalogPage } from './pages/admin/CatalogPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { EmployeesPage } from './pages/admin/EmployeesPage';
import { InvoiceWizardPage } from './pages/admin/InvoiceWizardPage';
import { ProjectEditPage } from './pages/admin/ProjectEditPage';
import { ProjectsAdminPage } from './pages/admin/ProjectsAdminPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { DemandPage } from './pages/DemandPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PhotoDetailPage } from './pages/PhotoDetailPage';
import { PhotoNewPage } from './pages/PhotoNewPage';
import { ProjectPage } from './pages/project/ProjectPage';
import { PurchasePage } from './pages/PurchasePage';
import { ReimbursementsPage } from './pages/ReimbursementsPage';
import { TimeEntryPage } from './pages/TimeEntryPage';

/** Routes for signed-in users; chef routes are only registered for the chef. */
function SignedInRoutes() {
  const { isChef } = useAuth();
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/projects/:projectId/photos/:photoId" element={<PhotoDetailPage />} />
        <Route path="/time" element={<TimeEntryPage />} />
        <Route path="/purchase" element={<PurchasePage />} />
        <Route path="/demand" element={<DemandPage />} />
        <Route path="/photo" element={<PhotoNewPage />} />
        <Route path="/reimbursements" element={<ReimbursementsPage />} />
        {isChef && (
          <>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin/projects" element={<ProjectsAdminPage />} />
            <Route path="/admin/projects/:projectId" element={<ProjectEditPage />} />
            <Route path="/projects/:projectId/invoice" element={<InvoiceWizardPage />} />
            <Route path="/admin/employees" element={<EmployeesPage />} />
            <Route path="/admin/catalog" element={<CatalogPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function Shell() {
  const { state } = useAuth();
  if (state.status === 'loading') return <div className="splash"><Spinner label="Anmeldung …" /></div>;
  if (state.status === 'signedOut') return <LoginPage error={state.error} />;
  return <SignedInRoutes />;
}

/** Root component. HashRouter, because GitHub Pages cannot rewrite URLs to index.html. */
export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  );
}

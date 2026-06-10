import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { ScanPage } from './pages/ScanPage';
import { ActivePage } from './pages/ActivePage';
import { ClosePage } from './pages/ClosePage';
import { LoginPage } from './pages/LoginPage';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

// Lazy load heavy pages for code splitting
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/scan" replace />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="active" element={<ActivePage />} />
        <Route path="close" element={<ActivePage />} />
        <Route path="close/:id" element={<ClosePage />} />
        <Route path="reports" element={
          <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>}>
            <ReportsPage />
          </Suspense>
        } />
        <Route path="admin" element={
          <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>}>
            <AdminPage />
          </Suspense>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/scan" replace />} />
    </Routes>
  );
}
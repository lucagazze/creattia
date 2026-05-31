import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './components/layout/MainLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewAsProvider } from './contexts/ViewAsContext';
import LoginPage from './pages/LoginPage';
import EmailPreviewPublicPage from './pages/EmailPreviewPublicPage';

const ProtectedRoute = () => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#0a0a0a]">
      <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-violet-600 dark:border-t-violet-500 rounded-full animate-spin" />
    </div>
  );
  
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    const errMessage = String(error?.message || error || "");
    if (
      errMessage.includes("Loading chunk") ||
      errMessage.includes("ChunkLoadError") ||
      errMessage.includes("Failed to fetch dynamically imported module")
    ) {
      console.warn("ChunkLoadError detected, reloading page...");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#0a0a0a] p-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-4 text-red-500">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-[17px] font-bold text-zinc-900 dark:text-white mb-2">Algo salió mal</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-6 max-w-xs leading-relaxed">
            Hubo un error al cargar esta sección. La página se recargará automáticamente para solucionarlo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[12px] font-bold shadow-md hover:opacity-90 transition-all active:scale-95"
          >
            Recargar ahora
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { PresenceProvider } from './contexts/PresenceContext';

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <PresenceProvider>
            <ViewAsProvider>
              <ToastProvider>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/preview" element={<EmailPreviewPublicPage />} />
                    
                    <Route element={<ProtectedRoute />}>
                       <Route path="/*" element={<MainLayout />} />
                    </Route>
                  </Routes>
                </ErrorBoundary>
              </ToastProvider>
            </ViewAsProvider>
          </PresenceProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

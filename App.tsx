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

// Global backstop — only catches errors that escape the per-route boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (
      msg.includes('loading chunk') ||
      msg.includes('chunkloaderror') ||
      msg.includes('failed to fetch') ||
      msg.includes('module script') ||
      msg.includes('load failed') ||
      msg.includes('dynamically imported') ||
      msg.includes('dynamic import')
    ) {
      window.location.reload();
      return;
    }
    console.error('Global ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#0a0a0a] p-4 text-center gap-4">
          <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">Error inesperado</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}
            className="px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[12px] font-bold"
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { PresenceProvider } from './contexts/PresenceContext';
import { UnreadProvider } from './contexts/UnreadContext';

export default function App() {
  React.useEffect(() => {
    const handleChunkError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'reason' in e ? e.reason : e.error;
      const msg = String(error?.message || error || '').toLowerCase();
      if (
        msg.includes('loading chunk') ||
        msg.includes('chunkloaderror') ||
        msg.includes('failed to fetch') ||
        msg.includes('module script') ||
        msg.includes('load failed') ||
        msg.includes('dynamically imported') ||
        msg.includes('dynamic import')
      ) {
        console.warn('Chunk load error detected globally, reloading page...');
        window.location.reload();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);
    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ViewAsProvider>
            <PresenceProvider>
              <UnreadProvider>
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
              </UnreadProvider>
            </PresenceProvider>
          </ViewAsProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

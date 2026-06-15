import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, Outlet, Link } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './components/layout/MainLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewAsProvider } from './contexts/ViewAsContext';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import EmailPreviewPublicPage from './pages/EmailPreviewPublicPage';
import OAuthSimulatePage from './pages/OAuthSimulatePage';
import PrivacidadPage from './pages/PrivacidadPage';
import SoportePage from './pages/SoportePage';
import TerminosPage from './pages/TerminosPage';
import { CenteredPageLoader } from './components/ui/CenteredPageLoader';

const ProtectedRoute = () => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <CenteredPageLoader isLoading={true}>
      <div />
    </CenteredPageLoader>
  );
  
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

const PublicInfoLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#080808] text-zinc-900 dark:text-zinc-100 px-4 sm:px-6 py-8 sm:py-10">
    <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
      <Link to="/landing" className="flex items-center gap-2.5">
        <img src="/assets/logoAlgoritmia1.webp" alt="Algoritmia" className="w-8 h-8 object-contain dark:hidden" />
        <img src="/assets/logoSinFondo.png" alt="Algoritmia" className="w-8 h-8 object-contain hidden dark:block" />
        <div>
          <span className="block text-[13px] font-black uppercase leading-none tracking-tight">Algoritmia</span>
          <span className="block text-[8px] font-bold text-violet-500 tracking-[0.24em] uppercase mt-0.5">Gestión</span>
        </div>
      </Link>
      <Link to="/landing" className="h-9 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[12px] font-bold flex items-center">
        Volver
      </Link>
    </div>
    {children}
  </div>
);

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

    // Anti-copy, anti-inspect, and right-click blockers in production
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleDragStart = (e: DragEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'u') {
        e.preventDefault();
        return;
      }
      const isInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(e.key?.toLowerCase());
      const isMacInspect = e.metaKey && e.altKey && ['i', 'j', 'c'].includes(e.key?.toLowerCase());
      if (isInspect || isMacInspect) {
        e.preventDefault();
        return;
      }
    };

    // DevTools allowed as requested by user
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
                      <Route path="/landing" element={<LandingPage />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/privacidad" element={<PublicInfoLayout><PrivacidadPage /></PublicInfoLayout>} />
                      <Route path="/terminos" element={<PublicInfoLayout><TerminosPage /></PublicInfoLayout>} />
                      <Route path="/soporte" element={<PublicInfoLayout><SoportePage /></PublicInfoLayout>} />
                      <Route path="/preview" element={<EmailPreviewPublicPage />} />
                      <Route path="/oauth-simulate" element={<OAuthSimulatePage />} />
                      
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

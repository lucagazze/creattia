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

import { PresenceProvider } from './contexts/PresenceContext';

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <PresenceProvider>
            <ViewAsProvider>
              <ToastProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/preview" element={<EmailPreviewPublicPage />} />
                  
                  <Route element={<ProtectedRoute />}>
                     <Route path="/*" element={<MainLayout />} />
                  </Route>
                </Routes>
              </ToastProvider>
            </ViewAsProvider>
          </PresenceProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

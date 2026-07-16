import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import MainLayout from './components/layout/MainLayout';
import CreatorDashboard from './pages/creator/CreatorDashboard';
import MaterialsPage from './pages/creator/MaterialsPage';
import TopicWorkspace from './pages/creator/TopicWorkspace';
import StyleProfilePage from './pages/creator/StyleProfilePage';
import NoteDetail from './pages/editor/NoteDetail';
import Trash from './pages/features/Trash';
import Onboarding from './pages/auth/Onboarding';
import LegalPage from './pages/legal/LegalPage';

function App() {
  const { checkAuth, isAuthenticated, isLoading, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      const isPublic = location.pathname.startsWith('/auth') || location.pathname.startsWith('/legal');
      if (!isAuthenticated && !isPublic) {
        navigate('/auth/login');
      } else if (isAuthenticated && !user?.onboardingCompletedAt && location.pathname !== '/onboarding' && !location.pathname.startsWith('/legal/')) {
        navigate('/onboarding');
      } else if (isAuthenticated && user?.onboardingCompletedAt && (location.pathname.startsWith('/auth') || location.pathname === '/onboarding')) {
        navigate('/');
      }
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname, user?.onboardingCompletedAt]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>加载中...</div>;
  }

  return (
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/legal/terms" element={<LegalPage type="terms" />} />
      <Route path="/legal/privacy" element={<LegalPage type="privacy" />} />
      <Route path="/onboarding" element={isAuthenticated ? <Onboarding /> : <Navigate to="/auth/login" />} />
      
      <Route 
        path="/" 
        element={isAuthenticated ? <MainLayout /> : <Navigate to="/auth/login" />} 
      >
        <Route index element={<CreatorDashboard />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="style-profile" element={<StyleProfilePage />} />
        <Route path="n/:id" element={<NoteDetail key={location.pathname} />} />
        <Route path="editor/:id" element={<NoteDetail key={location.pathname} />} />
        <Route path="trash" element={<Trash />} />
        <Route path="*" element={<CreatorDashboard />} />
      </Route>
      <Route path="/topics/:id" element={isAuthenticated ? <TopicWorkspace /> : <Navigate to="/auth/login" />} />
    </Routes>
  );
}

export default App;

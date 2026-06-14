import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/home/Dashboard';
import NoteDetail from './pages/editor/NoteDetail';
import CalendarPage from './pages/features/Calendar';
import DailyReport from './pages/features/DailyReport';
import SproutReport from './pages/features/SproutReport';
import Trash from './pages/features/Trash';

function App() {
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !location.pathname.startsWith('/auth')) {
        navigate('/auth/login');
      } else if (isAuthenticated && location.pathname.startsWith('/auth')) {
        navigate('/');
      }
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>加载中...</div>;
  }

  return (
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      
      <Route 
        path="/" 
        element={isAuthenticated ? <MainLayout /> : <Navigate to="/auth/login" />} 
      >
        <Route index element={<Dashboard />} />
        <Route path="n/:id" element={<NoteDetail key={location.pathname} />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="daily" element={<DailyReport />} />
        <Route path="report" element={<SproutReport />} />
        <Route path="trash" element={<Trash />} />
        {/* Placeholder routes for sidebar items */}
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;

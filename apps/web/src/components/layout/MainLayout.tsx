import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../sidebar/Sidebar';
import { useUIStore } from '../../stores/uiStore';

export default function MainLayout() {
  const { isSidebarOpen } = useUIStore();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)', overflow: 'hidden' }}>
      {/* Left Sidebar */}
      <div style={{ 
        width: isSidebarOpen ? '280px' : '0px', 
        flexShrink: 0, 
        height: '100%',
        transition: 'width var(--transition-normal)',
        overflow: 'hidden'
      }}>
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}

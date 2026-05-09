import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../sidebar/Sidebar';

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)', overflow: 'hidden' }}>
      {/* Left Sidebar */}
      <div style={{ width: '280px', flexShrink: 0, height: '100%' }}>
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}

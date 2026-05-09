import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from '../../components/sidebar/Sidebar';
import BlockEditor from '../../components/editor/BlockEditor';
import { useAuthStore } from '../../stores/authStore';

export default function EditorPage() {
  const { id } = useParams();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const user = useAuthStore(state => state.user);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)' }}>
      {/* Sidebar */}
      {isSidebarOpen && (
        <div style={{ width: '260px', flexShrink: 0, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
          <Sidebar />
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Navbar */}
        <header style={{ height: '48px', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
          <button 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            title="Toggle Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
          
          <div style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '13px' }}>
            {user?.name || user?.email}'s Space
          </div>
        </header>

        {/* Editor Area */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '40px 0' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 40px' }}>
            {id ? (
              <BlockEditor noteId={id} />
            ) : (
              <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-secondary)' }}>
                <h2>Select or create a note to start</h2>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

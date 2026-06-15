import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import { 
  Calendar, FileText, BarChart2, Folder, BookOpen, Mic, Trash2, ChevronRight, Gift, Settings, Search, Download, Upload
} from 'lucide-react';
import SettingsModal from '../ui/SettingsModal';
import GlobalAIChat from '../ui/GlobalAIChat';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const [stats, setStats] = useState({ total: 0, daily: [] as {date: string, count: number}[] });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsImporting(true);
      const { data } = await api.post('/notes/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`导入成功！共导入 ${data.count} 篇笔记。`);
      // Force reload stats/dashboard by triggering navigation or state
      window.location.reload(); 
    } catch (err) {
      console.error('Import failed', err);
      alert('导入失败，请检查文件格式');
    } finally {
      setIsImporting(false);
      if (e.target) {
        e.target.value = ''; // Reset input
      }
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await api.get('/notes/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'Notavia_Export.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length === 2) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请重试");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/notes/stats');
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats', err);
      }
    };
    fetchStats();
  }, [location.pathname]); // Refresh when navigating

  // Generate heatmap data (last 42 cells)
  const heatmapData = Array.from({ length: 42 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (41 - i));
    const dateStr = date.toISOString().split('T')[0];
    return stats.daily.some(d => d.date === dateStr);
  });

  const menuItems = [
    { icon: <Folder size={18} />, label: '知识库', path: '/kb' },
    { icon: <Calendar size={18} />, label: '日历', path: '/calendar' },
    { icon: <Trash2 size={18} />, label: '最近删除', path: '/trash' },
  ];

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', height: '100%', 
      backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)',
      padding: '24px 16px', overflowY: 'auto'
    }}>
      
      {/* User Profile */}
      <div 
        onClick={() => setIsSettingsOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', cursor: 'pointer', padding: '8px', borderRadius: '8px', margin: '-8px -8px 20px -8px' }}
        className="hover-bg-input"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>{user?.name || 'Get达人'}</span>
        </div>
        <Settings size={18} color="var(--text-tertiary)" />
      </div>

      {/* AI Search Bar */}
      <div 
        onClick={() => setIsAIChatOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '10px 12px', borderRadius: '8px', marginBottom: '24px',
          backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)',
          color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.2s, background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#10b981';
          e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.backgroundColor = 'var(--bg-input)';
        }}
      >
        <Search size={16} style={{ color: '#10b981' }} />
        <span style={{ flex: 1 }}>全局 AI 检索...</span>
        <div style={{ 
          fontSize: '11px', padding: '2px 6px', borderRadius: '4px', 
          backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          color: 'var(--text-tertiary)', fontWeight: 600
        }}>⌘K</div>
      </div>


      {/* Stats */}
      <div style={{ marginBottom: '24px', padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>篇全部笔记</div>
        </div>
      </div>

      {/* Navigation Menu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {menuItems.map((item, idx) => (
          <div 
            key={idx}
            onClick={() => {
              if (item.path === '/kb') {
                navigate('/');
              } else {
                navigate(item.path);
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', 
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
              backgroundColor: location.pathname === item.path || (item.path === '/kb' && location.pathname === '/') ? 'var(--bg-panel-hover)' : 'transparent',
              color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* Footer Settings / Logout */}
      <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label 
            className="btn btn-outline" 
            style={{ flex: 1, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', padding: '8px 0', opacity: isImporting ? 0.7 : 1 }}
          >
            <Download size={14} />
            {isImporting ? '导入中...' : '导入'}
            <input type="file" accept=".zip,.md,.txt,.markdown" style={{ display: 'none' }} onChange={handleImport} disabled={isImporting} />
          </label>
          <button 
            className="btn btn-outline" 
            onClick={handleExport} 
            disabled={isExporting}
            style={{ flex: 1, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px 0' }}
          >
            <Upload size={14} />
            {isExporting ? '打包中...' : '导出'}
          </button>
        </div>
        <button className="btn btn-outline" onClick={logout} style={{ width: '100%', fontSize: '12px', color: 'var(--text-secondary)' }}>
          退出登录
        </button>
      </div>

      {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />}
      <GlobalAIChat isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </div>
  );
}

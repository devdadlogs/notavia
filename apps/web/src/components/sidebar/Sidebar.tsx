import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { 
  Calendar, FileText, BarChart2, Folder, BookOpen, Mic, Trash2, ChevronRight, Gift
} from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  // Mock data for the heatmap
  const heatmapData = Array.from({ length: 42 }).map((_, i) => Math.random() > 0.7);

  const menuItems = [
    { icon: <Calendar size={18} />, label: '日历', path: '/calendar' },
    { icon: <FileText size={18} />, label: 'Get日报', path: '/daily' },
    { icon: <BarChart2 size={18} />, label: '发芽报告', path: '/report' },
    { icon: <Folder size={18} />, label: '知识库', path: '/kb' },
    { icon: <BookOpen size={18} />, label: '书籍', path: '/books' },
    { icon: <Mic size={18} />, label: '录音卡', path: '/voice-cards' },
    { icon: <Trash2 size={18} />, label: '最近删除', path: '/trash' },
  ];

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', height: '100%', 
      backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)',
      padding: '24px 16px', overflowY: 'auto'
    }}>
      
      {/* User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>{user?.name || 'Get达人'}</span>
        </div>
        <ChevronRight size={18} color="var(--text-tertiary)" />
      </div>

      {/* VIP Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, #1e1e2d 0%, #0d0d14 100%)', 
        borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>
            首月开通仅需 <span style={{ fontSize: '18px', fontWeight: 700, color: '#facc15' }}>¥9.0</span>
          </div>
          <div style={{ background: '#facc15', color: '#000', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>立享优惠</div>
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '8px' }}>
          <span>↓ 语音通话记录长至1小时</span>
          <span>♨ 会议录音延长至3小时</span>
        </div>
      </div>

      {/* College Student Promo */}
      <div style={{ 
        backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-md)', 
        padding: '10px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#b45309'
      }}>
        <Gift size={14} /> 大学生专属福利，立即查看
      </div>

      {/* Stats & Heatmap */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>4</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>全部笔记</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>3</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>累计天数</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>-</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>连续天数</div>
          </div>
        </div>
        
        {/* Mock Heatmap */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {heatmapData.map((active, idx) => (
            <div key={idx} style={{ 
              aspectRatio: '1', borderRadius: '4px', 
              backgroundColor: active ? 'var(--text-tertiary)' : 'var(--bg-input)'
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
          <span>3月</span><span>4月</span><span>5月</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {menuItems.map((item, idx) => (
          <div 
            key={idx}
            onClick={() => {
              if (item.path === '/kb') navigate('/'); // For now map KB to home
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
      <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
        <button className="btn btn-outline" onClick={logout} style={{ width: '100%', fontSize: '12px' }}>
          退出登录
        </button>
      </div>

    </div>
  );
}

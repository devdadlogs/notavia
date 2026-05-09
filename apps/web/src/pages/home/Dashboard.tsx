import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Search, Gift, Play, MoreHorizontal, Mic, Edit3, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function Dashboard() {
  const [notes, setNotes] = useState<any[]>([]);
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const { data } = await api.get('/notes');
        setNotes(data);
      } catch (err) {
        console.error('Failed to fetch notes', err);
      }
    };
    fetchNotes();
  }, []);

  const createNote = async () => {
    try {
      const { data } = await api.post('/notes', { title: '新笔记' });
      navigate(`/n/${data.id}`);
    } catch (err) {
      console.error('Failed to create note', err);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ display: 'flex', alignItems: 'center', padding: '16px 32px', gap: '24px' }}>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div className="search-input-wrapper">
          <Search size={18} color="var(--text-tertiary)" />
          <input type="text" className="search-input" placeholder="搜索笔记" />
        </div>
        <button style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Gift size={18} color="var(--text-secondary)" />
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '0 32px 100px 32px' }}>
        
        {/* Welcome Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '24px' }}>💬</span>
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>欢迎来到Get笔记</h1>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>现在，开始你的灵感之旅吧</p>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '12px' }}>聊一聊 ›</button>
        </div>

        {/* Recently Used */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>最近使用</h2>
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
            {/* Mock Card */}
            <div className="card card-hoverable" style={{ minWidth: '240px', cursor: 'pointer' }} onClick={() => notes[0] && navigate(`/n/${notes[0].id}`)}>
              <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>学习笔记</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>4088个内容 · 856003人在用</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#e2e8f0' }} />
                Get达人 创建
              </div>
            </div>
          </div>
        </div>

        {/* Note List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>笔记列表</h2>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {notes.map(note => (
              <div key={note.id} className="card card-hoverable" style={{ padding: '24px', cursor: 'pointer' }} onClick={() => navigate(`/n/${note.id}`)}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{note.title || '无标题笔记'}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {note.contentText || '点击此处开始记录你的灵感和想法...'}
                </p>
                
                {/* Mock Audio Player inside Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'var(--bg-input)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', width: 'fit-content' }}>
                  <Play size={14} color="var(--text-primary)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>48秒</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {new Date(note.updatedAt).toLocaleString('zh-CN')} 更新
                  </span>
                  <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Floating Action Bar */}
      <div className="floating-action-bar">
        <button className="fab-btn" onClick={createNote}>
          <Plus size={20} />
          <span>更多</span>
        </button>
        <button className="fab-btn primary" onClick={createNote} style={{ backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-pill)', padding: '8px 24px' }}>
          <Mic size={18} />
          <span>录音</span>
        </button>
        <button className="fab-btn" onClick={createNote}>
          <Edit3 size={20} />
          <span>文字</span>
        </button>
      </div>

    </div>
  );
}

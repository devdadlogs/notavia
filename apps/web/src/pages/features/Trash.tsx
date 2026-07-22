import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw, XCircle, Menu } from 'lucide-react';
import api from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

export default function Trash() {
  const [notes, setNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);

  const loadTrash = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/notes?isTrashed=true');
      setNotes(data || []);
    } catch (err) {
      console.error('Failed to load trash', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  const handleRestore = async (id: string) => {
    try {
      await api.put(`/notes/${id}`, { isTrashed: false });
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to restore note', err);
      alert('恢复失败');
    }
  };

  const handleDeletePermanent = async (id: string) => {
    if (!window.confirm('确定要永久删除这条笔记吗？此操作无法撤销。')) return;
    try {
      await api.delete(`/notes/${id}/permanent`);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to permanently delete note', err);
      alert('删除失败');
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('确定要清空回收站吗？所有笔记将被永久删除，此操作无法撤销。')) return;
    try {
      await api.delete('/notes/trash/empty');
      setNotes([]);
    } catch (err) {
      console.error('Failed to empty trash', err);
      alert('清空回收站失败');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px',
        position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'var(--bg-color)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <button onClick={toggleSidebar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <Menu size={24} />
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>最近删除</h1>
        </div>
        
        {notes.length > 0 && (
          <button 
            className="btn btn-outline" 
            style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)', fontSize: '12px', padding: '6px 12px' }}
            onClick={handleEmptyTrash}
          >
            清空回收站
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 100px 32px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0', color: 'var(--text-tertiary)' }}>
            加载中...
          </div>
        ) : notes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 0', color: 'var(--text-tertiary)' }}>
            <Trash2 size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
            <p style={{ fontSize: '14px' }}>回收站空空如也</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {notes.map(note => (
              <div key={note.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{note.title || '无标题笔记'}</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    删除于 {new Date(note.updatedAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
                  <button 
                    title="恢复" 
                    onClick={() => handleRestore(note.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#10b981'; e.currentTarget.style.borderColor = '#10b981'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                  >
                    <RotateCcw size={14} /> 恢复
                  </button>
                  <button 
                    title="彻底删除" 
                    onClick={() => handleDeletePermanent(note.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '12px', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-input)'}
                  >
                    <XCircle size={14} /> 彻底删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

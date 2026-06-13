import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, XCircle } from 'lucide-react';
import api from '../../services/api';

export default function Trash() {
  const [notes, setNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    try {
      // Assuming backend has an endpoint or filter for trashed notes
      const { data } = await api.get('/notes?isTrashed=true');
      // Filter manually just in case
      setNotes(data.filter((n: any) => n.isTrashed));
    } catch (err) {
      console.error('Failed to load trash', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>最近删除</h1>
        <button className="btn btn-outline" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}>
          清空回收站
        </button>
      </header>

      {isLoading ? (
        <div>加载中...</div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-tertiary)' }}>
          <Trash2 size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
          <p>回收站空空如也</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {notes.map(note => (
            <div key={note.id} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{note.title || '无标题'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>删除于 2026/05/10</div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button title="还原" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer' }}>
                  <RotateCcw size={16} />
                </button>
                <button title="永久删除" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer' }}>
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

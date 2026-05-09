import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import api from '../../services/api';
import { ChevronLeft, Gift, MoreVertical, Play, FastForward, Edit3, Sparkles, MessageSquarePlus } from 'lucide-react';

import '../../styles/editor.css';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [noteData, setNoteData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [activeTab, setActiveTab] = useState('note'); // 'transcript', 'note', 'sprout', 'append'

  // Load Note
  useEffect(() => {
    const loadNote = async () => {
      try {
        const { data } = await api.get(`/notes/${id}`);
        setNoteData(data);
        setTitle(data.title === 'Untitled' ? '' : data.title);
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(data.contentJson || '');
        }
      } catch (error) {
        console.error('Failed to load note', error);
      }
    };
    if (id) loadNote();
  }, [id]);

  const saveNote = useCallback(async (newTitle: string, contentJson: any) => {
    setIsSaving(true);
    try {
      await api.put(`/notes/${id}`, {
        title: newTitle || '无标题笔记',
        contentJson,
        contentText: editor?.getText()
      });
    } catch (error) {
      console.error('Failed to save note', error);
    } finally {
      setIsSaving(false);
    }
  }, [id]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder: '在此记录你的灵感和想法...' }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      saveNote(title, editor.getJSON());
    }
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (editor) saveNote(newTitle, editor.getJSON());
  };

  if (!editor || !noteData) return <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-panel)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-input)' }}>
          <ChevronLeft size={20} color="var(--text-primary)" />
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{ background: 'var(--bg-input)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Gift size={16} color="var(--text-secondary)" />
          </button>
          <button style={{ background: 'var(--bg-input)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <MoreVertical size={16} color="var(--text-secondary)" />
          </button>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 10%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Note Header Info */}
        <div className="note-header-layout">
          <input 
            type="text" 
            className="note-title-input" 
            placeholder="无标题笔记" 
            value={title} 
            onChange={handleTitleChange}
          />
          <div className="note-meta-row">
            <span>创建时间 {new Date(noteData.createdAt).toLocaleString('zh-CN')}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{isSaving ? '保存中...' : '已保存'}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <span className="btn btn-outline text-xs" style={{ padding: '2px 8px' }}>+</span>
            <span className="note-tag">录音笔记</span>
            <span className="note-tag">大模型选型</span>
            <span className="note-tag">产品构想</span>
          </div>

          {/* Audio Player Mock */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-input)', padding: '16px 24px', borderRadius: 'var(--radius-pill)', gap: '24px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>00:00:00</span>
            <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--border-color)', borderRadius: '2px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '30%', backgroundColor: 'var(--primary-color)', borderRadius: '2px' }} />
              <div style={{ position: 'absolute', left: '30%', top: '50%', transform: 'translate(-50%, -50%)', width: '12px', height: '12px', backgroundColor: 'var(--primary-color)', borderRadius: '50%' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)' }}>00:00:48</span>
            
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginLeft: '24px' }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><FastForward size={18} style={{ transform: 'rotate(180deg)' }} /></button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}><Play size={24} fill="currentColor" /></button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><FastForward size={18} /></button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>1.0x</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="note-tabs">
          <div className={`note-tab ${activeTab === 'transcript' ? 'active' : ''}`} onClick={() => setActiveTab('transcript')}>录音原文</div>
          <div className={`note-tab ${activeTab === 'note' ? 'active' : ''}`} onClick={() => setActiveTab('note')}>笔记内容</div>
          <div className={`note-tab ${activeTab === 'sprout' ? 'active' : ''}`} onClick={() => setActiveTab('sprout')}>发芽</div>
          <div className={`note-tab ${activeTab === 'append' ? 'active' : ''}`} onClick={() => setActiveTab('append')}>追加笔记</div>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1 }}>
          {activeTab === 'note' && (
            <EditorContent editor={editor} />
          )}
          {activeTab !== 'note' && (
            <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '40px' }}>
              此功能正在开发中...
            </div>
          )}
        </div>
      </main>

      {/* Detail Page Floating Action Bar */}
      <div className="floating-action-bar" style={{ gap: '24px', padding: '16px 32px' }}>
        <button className="fab-btn">
          <MessageSquarePlus size={20} />
          <span>追加笔记</span>
        </button>
        <button className="fab-btn">
          <Edit3 size={20} />
          <span>AI助手</span>
        </button>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fef3c7', color: '#b45309', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>剩余5次</div>
          <button className="fab-btn active" style={{ color: 'var(--accent-color)' }}>
            <Sparkles size={20} />
            <span>发芽</span>
          </button>
        </div>
      </div>

    </div>
  );
}

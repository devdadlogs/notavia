import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import api from '../../services/api';
import { ChevronLeft, Gift, MoreVertical, Play, FastForward, Edit3, Sparkles, MessageSquarePlus, Menu, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import AIPanel from '../../components/editor/AIPanel';
import { aiService } from '../../services/ai';

// Yjs Imports
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import Collaboration from '@tiptap/extension-collaboration';

import '../../styles/editor.css';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toggleSidebar = useUIStore(state => state.toggleSidebar);
  const [isSaving, setIsSaving] = useState(false);
  const [noteData, setNoteData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [activeTab, setActiveTab] = useState('note');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [syncState, setSyncState] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [sproutResults, setSproutResults] = useState<any[]>([]);
  const [isSprouting, setIsSprouting] = useState(false);

  const handleSprout = async () => {
    setActiveTab('sprout');
    if (!editor || editor.getText().trim() === '') return;
    setIsSprouting(true);
    try {
      const results = await aiService.sprout(id!, editor.getText());
      setSproutResults(results);
    } catch (err) {
      console.error('Sprout failed', err);
    } finally {
      setIsSprouting(false);
    }
  };

  // 1. Initialize Yjs Document
  const ydoc = useMemo(() => new Y.Doc(), [id]);

  // 2. Setup Yjs Providers (IndexedDB + WebSocket)
  useEffect(() => {
    if (!id) return;

    // Offline persistence
    const indexeddbProvider = new IndexeddbPersistence(`notavia-note-${id}`, ydoc);
    
    // Real-time sync via Go WebSocket hub
    const wsUrl = `ws://localhost:3001/ws/yjs`;
    const wsProvider = new WebsocketProvider(wsUrl, id, ydoc);

    wsProvider.on('status', (event: { status: string }) => {
      setSyncState(event.status === 'connected' ? 'connected' : 'offline');
    });

    return () => {
      wsProvider.destroy();
      indexeddbProvider.destroy();
    };
  }, [id, ydoc]);

  const saveNote = useCallback(async (newTitle: string, contentJson: any, contentText: string) => {
    setIsSaving(true);
    try {
      await api.put(`/notes/${id}`, {
        title: newTitle || '无标题笔记',
        contentJson: typeof contentJson === 'object' ? JSON.stringify(contentJson) : contentJson,
        contentText: contentText || ''
      });
    } catch (error) {
      console.error('Failed to save note', error);
    } finally {
      setIsSaving(false);
    }
  }, [id]);

  // 3. Configure Tiptap with Collaboration Extension
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }), // History must be disabled for Yjs
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder: '在此记录你的灵感和想法...' }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    onUpdate: ({ editor }) => {
      // Debounced save to traditional DB for fallback/search
      saveNote(title, editor.getJSON(), editor.getText());
    }
  });

  // Load Note Metadata and fallback content
  useEffect(() => {
    const loadNote = async () => {
      try {
        const { data } = await api.get(`/notes/${id}`);
        setNoteData(data);
        setTitle(data.title === 'Untitled' ? '' : data.title);
        
        // If Yjs document is completely empty, populate it from the database fallback
        if (editor && !editor.isDestroyed && editor.getText().trim() === '') {
          let content = data.contentJson;
          if (typeof content === 'string' && content) {
            try { content = JSON.parse(content); } catch (e) { content = ''; }
            if (content) {
              editor.commands.setContent(content);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load note', error);
      }
    };
    if (id && editor) loadNote();
  }, [id, editor]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (editor) saveNote(newTitle, editor.getJSON(), editor.getText());
  };

  // Insert AI-generated text into the editor
  const handleInsertAIText = (text: string) => {
    if (editor) {
      editor.chain().focus().insertContent('\n\n' + text).run();
      setShowAIPanel(false);
    }
  };

  if (!editor || !noteData) return <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-panel)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={toggleSidebar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <Menu size={24} />
          </button>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-input)' }}>
            <ChevronLeft size={20} color="var(--text-primary)" />
          </button>
        </div>
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
          <div className="note-meta-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>创建时间 {new Date(noteData.createdAt).toLocaleString('zh-CN')}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{isSaving ? '保存中...' : '已保存'}</span>
            
            {/* Sync State Indicator */}
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '4px', 
              fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
              backgroundColor: syncState === 'connected' ? 'var(--accent-light)' : '#fee2e2',
              color: syncState === 'connected' ? '#059669' : '#dc2626',
              fontWeight: 500
            }}>
              {syncState === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {syncState === 'connected' ? '实时协同已连接' : '离线 (本地保存)'}
            </div>
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
          <div className={`note-tab ${activeTab === 'sprout' ? 'active' : ''}`} onClick={handleSprout}>发芽</div>
          <div className={`note-tab ${activeTab === 'append' ? 'active' : ''}`} onClick={() => setActiveTab('append')}>追加笔记</div>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1 }}>
          {activeTab === 'note' && (
            <EditorContent editor={editor} />
          )}
          {activeTab === 'sprout' && (
            <div style={{ padding: '24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', color: 'var(--accent-color)' }}>
                <Sparkles size={20} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>语义关联发现</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>基于本地向量检索</span>
              </div>
              
              {isSprouting ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                  <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                  <div>正在搜索您的本地知识库...</div>
                </div>
              ) : sproutResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sproutResults.map((result: any) => (
                    <div key={result.noteId} className="card card-hoverable" style={{ cursor: 'pointer', borderLeft: '4px solid var(--accent-color)' }} onClick={() => navigate(`/n/${result.noteId}`)}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>{result.title || '无标题'}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {result.content}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px' }}>
                          相似度: {(result.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '60px 0' }}>
                  没有找到语义相关的笔记
                </div>
              )}
            </div>
          )}
          {activeTab !== 'note' && activeTab !== 'sprout' && (
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
        <button className="fab-btn" onClick={() => setShowAIPanel(true)}>
          <Edit3 size={20} />
          <span>AI助手</span>
        </button>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fef3c7', color: '#b45309', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>本地AI</div>
          <button className="fab-btn active" style={{ color: 'var(--accent-color)' }} onClick={handleSprout}>
            <Sparkles size={20} />
            <span>发芽</span>
          </button>
        </div>
      </div>

      {/* AI Panel Overlay + Drawer */}
      {showAIPanel && (
        <>
          <div className="ai-overlay" onClick={() => setShowAIPanel(false)} />
          <AIPanel
            noteId={id!}
            editorText={editor.getText()}
            onInsertText={handleInsertAIText}
            onClose={() => setShowAIPanel(false)}
          />
        </>
      )}

    </div>
  );
}

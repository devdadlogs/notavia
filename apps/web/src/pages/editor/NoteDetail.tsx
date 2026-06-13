import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { ResizableImage } from '../../components/editor/extensions/ResizableImage';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Markdown } from 'tiptap-markdown';
import api from '../../services/api';
import { ChevronLeft, Gift, MoreVertical, Play, FastForward, Edit3, Sparkles, MessageSquarePlus, Menu, Wifi, WifiOff, Loader2, Pause, Volume2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import AIPanel from '../../components/editor/AIPanel';
import EditorToolbar from '../../components/editor/EditorToolbar';
import { BlockHoverControls } from '../../components/editor/BlockHoverControls';
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
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guard flag: prevent content from being loaded from DB more than once per note open
  const contentLoadedRef = useRef(false);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const { data } = await api.post(`/notes/${id}/audio`, formData);
      setNoteData(prev => prev ? { ...prev, audioUrl: data.audioUrl } : null);
    } catch (err) {
      console.error('Audio upload failed', err);
    }
  };

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
  const [yjsSynced, setYjsSynced] = useState(false);

  // 2. Setup Yjs Providers (IndexedDB + WebSocket)
  useEffect(() => {
    if (!id) return;
    setYjsSynced(false);
    contentLoadedRef.current = false; // Reset on note change

    // Offline persistence
    const indexeddbProvider = new IndexeddbPersistence(`notavia-note-${id}`, ydoc);
    
    let idbSynced = false;
    let wsSynced = false;

    const checkAllSynced = () => {
      // Only mark yjsSynced after BOTH IndexedDB and WebSocket have had a chance to sync.
      // This prevents loading from DB before WebSocket delivers existing content from other browsers.
      if (idbSynced && wsSynced) {
        console.log('✅ Both Yjs IndexedDB + WebSocket synced for', id);
        setYjsSynced(true);
      }
    };

    indexeddbProvider.on('synced', () => {
      console.log('✅ Yjs IndexedDB synced for', id);
      idbSynced = true;
      
      // If IndexedDB already has content, we don't need to wait for WebSocket to load the editor
      const xmlFragment = ydoc.getXmlFragment('default');
      if (xmlFragment && xmlFragment.length > 0) {
        console.log('⚡ IndexedDB has content, rendering instantly (skipping WebSocket wait)');
        setYjsSynced(true);
      } else {
        checkAllSynced();
      }
    });

    // Real-time sync via Go WebSocket hub
    const wsUrl = `ws://localhost:3001/ws/yjs`;
    const wsProvider = new WebsocketProvider(wsUrl, id, ydoc);

    wsProvider.on('status', (event: { status: string }) => {
      setSyncState(event.status === 'connected' ? 'connected' : 'offline');
    });

    wsProvider.on('sync', (synced: boolean) => {
      if (synced) {
        console.log('✅ Yjs WebSocket synced for', id);
        wsSynced = true;
        checkAllSynced();
      }
    });

    // Fallback: if WebSocket fails to connect or doesn't sync within 200ms, proceed anyway
    const wsFallbackTimer = setTimeout(() => {
      if (!wsSynced) {
        console.log('⚠️ WebSocket sync timed out (200ms), proceeding with IndexedDB/DB fallback');
        wsSynced = true;
        checkAllSynced();
      }
    }, 200);

    return () => {
      clearTimeout(wsFallbackTimer);
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

  const saveNoteContent = useCallback(async (contentJson: any, contentText: string) => {
    setIsSaving(true);
    try {
      await api.put(`/notes/${id}`, {
        contentJson: typeof contentJson === 'object' ? JSON.stringify(contentJson) : contentJson,
        contentText: contentText || ''
      });
    } catch (error) {
      console.error('Failed to save note content', error);
    } finally {
      setIsSaving(false);
    }
  }, [id]);

  // 3. Configure Tiptap with Collaboration Extension + formatting extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,  // Required for Yjs collaboration
        // StarterKit already includes Link and Underline — don't register separately
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ResizableImage,
      Markdown,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      // NOTE: Underline and Link are already bundled inside StarterKit in Tiptap v3
      Placeholder.configure({ placeholder: '在此记录你的灵感和想法...' }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    onUpdate: ({ editor }) => {
      // Debounced save to traditional DB for fallback/search
      saveNoteContent(editor.getJSON(), editor.getText());
    }
  });

  // Load Note Metadata — only populate editor AFTER ALL Yjs providers sync
  useEffect(() => {
    const loadNote = async () => {
      try {
        const { data } = await api.get(`/notes/${id}`);
        setNoteData(data);
        setTitle(data.title === 'Untitled' ? '' : data.title);
        
        if (!editor || editor.isDestroyed) return;

        // CRITICAL: Guard against double-loading content from DB.
        // This prevents the cross-browser duplication bug where:
        //   Browser A loads content → Yjs syncs via WebSocket to Browser B
        //   Browser B IndexedDB is empty → it also loads from DB → DUPLICATE
        if (contentLoadedRef.current) return;

        // If Yjs document is still empty after ALL providers synced, populate from DB
        if (editor.getText().trim() === '') {
          const content = data.contentJson || data.contentText || '';
          if (content) {
            contentLoadedRef.current = true; // Mark as loaded BEFORE setContent to prevent re-entry
            try {
              const jsonContent = JSON.parse(content);
              editor.commands.setContent(jsonContent);
            } catch (e) {
              editor.commands.setContent(content);
            }
          }
        } else {
          // Yjs already has content (from WebSocket or IndexedDB), do NOT overwrite
          contentLoadedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load note', error);
      }
    };
    // Wait for BOTH editor ready AND ALL Yjs providers sync complete
    if (id && editor && yjsSynced) loadNote();
  }, [id, editor, yjsSynced]);

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

          {/* Audio Player */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-input)', padding: '16px 24px', borderRadius: 'var(--radius-pill)', gap: '24px' }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="audio/*" 
              onChange={handleAudioUpload} 
            />
            
            <audio 
              ref={audioRef}
              src={noteData?.audioUrl ? `http://localhost:3001${noteData.audioUrl}` : undefined}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />

            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {new Date(currentTime * 1000).toISOString().substr(11, 8)}
            </span>
            
            <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--border-color)', borderRadius: '2px', position: 'relative', cursor: 'pointer' }} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pct = x / rect.width;
              if (audioRef.current) audioRef.current.currentTime = pct * duration;
            }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(currentTime / duration) * 100 || 0}%`, backgroundColor: 'var(--primary-color)', borderRadius: '2px' }} />
              <div style={{ position: 'absolute', left: `${(currentTime / duration) * 100 || 0}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '12px', height: '12px', backgroundColor: 'var(--primary-color)', borderRadius: '50%' }} />
            </div>
            
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
              {new Date(duration * 1000).toISOString().substr(11, 8)}
            </span>
            
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginLeft: '24px' }}>
              <button 
                onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 5; }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <FastForward size={18} style={{ transform: 'rotate(180deg)' }} />
              </button>
              
              <button 
                onClick={() => {
                  if (!noteData?.audioUrl) {
                    fileInputRef.current?.click();
                    return;
                  }
                  if (isPlaying) {
                    audioRef.current?.pause();
                  } else {
                    audioRef.current?.play();
                  }
                  setIsPlaying(!isPlaying);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
              </button>
              
              <button 
                onClick={() => { if (audioRef.current) audioRef.current.currentTime += 5; }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <FastForward size={18} />
              </button>
              
              {!noteData?.audioUrl && (
                <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600 }}>点击上传录音</span>
              )}
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
            <div>
              <EditorToolbar editor={editor} noteTitle={title} />
              <BlockHoverControls editor={editor} />
              <div style={{ padding: '0 10%' }}>
                <EditorContent editor={editor} />
              </div>
            </div>
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
          {activeTab === 'transcript' && (
            <div className="fade-in" style={{ padding: '24px 0', lineHeight: 1.8, color: 'var(--text-primary)' }}>
              {noteData?.audioUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', fontSize: '14px' }}>
                    <p style={{ marginBottom: '8px', fontWeight: 600 }}>AI 自动生成摘要：</p>
                    <p style={{ color: 'var(--text-secondary)' }}>这是一段关于本地 AI 部署和知识主权的讨论。用户重点提到了如何通过 Ollama 和 Docker 在个人服务器上运行大模型，以确保数据不外传。</p>
                  </div>
                  <p>00:01 今天我们来聊聊 NovaNote 的核心架构...</p>
                  <p>00:15 为什么要坚持本地化部署？因为数据主权是未来的核心竞争力...</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                  请先上传录音文件以生成原文
                </div>
              )}
            </div>
          )}
          {activeTab === 'append' && (
            <div className="fade-in" style={{ padding: '24px 0' }}>
              <textarea 
                placeholder="在此输入追加内容..." 
                style={{ width: '100%', minHeight: '200px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none', resize: 'none' }}
              />
              <button className="btn btn-primary" style={{ marginTop: '16px' }}>保存追加</button>
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

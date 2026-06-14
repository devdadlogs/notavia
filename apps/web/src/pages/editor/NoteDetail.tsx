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
import { ChevronLeft, Gift, MoreVertical, Play, FastForward, Edit3, Sparkles, MessageSquarePlus, Menu, Wifi, WifiOff, Loader2, Pause, Volume2, Mic } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import AIPanel from '../../components/editor/AIPanel';
import EditorToolbar from '../../components/editor/EditorToolbar';
import AISlashCommand from '../../components/editor/AISlashCommand';
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
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editTranscriptText, setEditTranscriptText] = useState("");
  const [appendText, setAppendText] = useState("");
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showSaveToast, setShowSaveToast] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioVolumes, setAudioVolumes] = useState([4, 4, 4, 4, 4]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // Set up AudioContext for real-time visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateWaveform = () => {
        analyser.getByteFrequencyData(dataArray);
        const step = Math.floor(dataArray.length / 5);
        const newVolumes = [];
        for (let i = 0; i < 5; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const avg = sum / step;
          let height = Math.max(4, (avg / 255) * 16);
          newVolumes.push(height);
        }
        setAudioVolumes(newVolumes);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        
        // upload using existing endpoint
        const formData = new FormData();
        formData.append('audio', file);
        try {
          const { data } = await api.post(`/notes/${id}/audio`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          setNoteData((prev: any) => prev ? { ...prev, audioUrl: data.audioUrl } : null);
        } catch (err) {
          console.error('Audio upload failed', err);
        }
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert('无法访问麦克风，请检查权限');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      
      // Cleanup audio context
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      setAudioVolumes([4, 4, 4, 4, 4]);
    }
  };

  // Guard flag: prevent content from being loaded from DB more than once per note open
  const contentLoadedRef = useRef(false);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const { data } = await api.post(`/notes/${id}/audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setNoteData(prev => prev ? { ...prev, audioUrl: data.audioUrl } : null);
    } catch (err) {
      console.error('Audio upload failed', err);
    }
  };

  const handleSprout = () => {
    setActiveTab('note');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveNoteContent(editor.getJSON(), editor.getText({ blockSeparator: '\n' }));
      }, 1000); // 1-second debounce
    }
  });

  // Handle offline/online transitions to flush offline edits to DB
  useEffect(() => {
    const handleOnline = () => {
      if (editor && !editor.isDestroyed) {
        saveNote(title, editor.getJSON(), editor.getText({ blockSeparator: '\n' }));
      }
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [editor, saveNote, title]);

  // Auto-sprout effect (Semantic Bi-linking)
  useEffect(() => {
    if (!editor || editor.isDestroyed || activeTab !== 'note') return;

    try {
      const text = editor.getText({ blockSeparator: '\n' });
      if (text.length < 50) {
        setSproutResults([]);
        return;
      }

      const timer = setTimeout(async () => {
        setIsSprouting(true);
        try {
          const results = await aiService.sprout(id!, text);
          setSproutResults(results);
        } catch (err) {
          console.error('Auto sprout failed', err);
        } finally {
          setIsSprouting(false);
        }
      }, 2000); // 2 seconds of inactivity triggers semantic search

      return () => clearTimeout(timer);
    } catch (e) {
      // Editor schema might not be fully initialized yet
    }
  }, [editor, editor?.state?.doc?.content?.size, activeTab, id]);

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

  // Polling for transcript completion
  useEffect(() => {
    if (!id || !noteData?.audioUrl || noteData?.transcript) return;
    
    const intervalId = setInterval(async () => {
      try {
        const { data } = await api.get(`/notes/${id}`);
        if (data.transcript) {
          setNoteData(data);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Polling transcript failed", err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [id, noteData?.audioUrl, noteData?.transcript]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (editor) saveNote(newTitle, editor.getJSON(), editor.getText());
  };

  // Insert AI-generated text into the editor
  const handleInsertAIText = (text: string, mode: 'cursor' | 'bottom' | 'top') => {
    if (editor) {
      if (mode === 'bottom') {
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, '\n\n' + text).run();
      } else if (mode === 'top') {
        editor.chain().focus().insertContentAt(0, `> 🏷️ 标签：${text}\n\n`).run();
      } else {
        editor.chain().focus().insertContent(text).run();
      }
      setShowAIPanel(false);
    }
  };

  // Handle Cmd+S / Ctrl+S keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // Prevent browser's "Save Page" dialog
        if (editor && !editor.isDestroyed) {
          saveNote(title, editor.getJSON(), editor.getText({ blockSeparator: '\n' }));
          
          // Show toast notification
          setShowSaveToast(true);
          setTimeout(() => setShowSaveToast(false), 2000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, saveNote, title]);

  if (!editor || !noteData) return <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;

  // Deduplicate sprout results by noteId and apply a stricter similarity threshold (0.75)
  const uniqueSprouts = sproutResults
    .filter(r => r.score >= 0.75)
    .reduce((acc: any[], current: any) => {
      if (!acc.find(item => item.noteId === current.noteId)) {
        acc.push(current);
      }
      return acc;
    }, [])
    .slice(0, 3);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-panel)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', 
        borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 50, 
        backgroundColor: 'var(--bg-panel)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={toggleSidebar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <Menu size={24} />
          </button>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-input)' }}>
            <ChevronLeft size={20} color="var(--text-primary)" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Corner Sync Indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            backgroundColor: syncState === 'offline' ? '#fee2e2' : (isSaving ? '#fef3c7' : 'var(--accent-light)'),
            color: syncState === 'offline' ? '#dc2626' : (isSaving ? '#d97706' : '#059669'),
            fontSize: '12px', fontWeight: 500, marginRight: '8px',
            transition: 'all 0.3s ease'
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: syncState === 'offline' ? '#ef4444' : (isSaving ? '#f59e0b' : '#10b981'),
              boxShadow: isSaving ? '0 0 8px #f59e0b' : 'none'
            }} />
            {syncState === 'offline' ? '🔴 离线记录中' : (isSaving ? '🟡 同步中' : '🟢 已同步')}
          </div>

          <button style={{ background: 'var(--bg-input)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Gift size={16} color="var(--text-secondary)" />
          </button>
          <button style={{ background: 'var(--bg-input)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <MoreVertical size={16} color="var(--text-secondary)" />
          </button>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 5%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Note Header Info */}
        <div className="note-header-layout">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {noteData?.audioUrl && (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e0e7ff', color: '#4f46e5', borderRadius: '50%', width: '32px', height: '32px', flexShrink: 0 }}>
                <Mic size={18} />
              </span>
            )}
            <input 
              type="text" 
              className="note-title-input" 
              placeholder="无标题笔记" 
              value={title} 
              onChange={handleTitleChange}
              style={{ flex: 1 }}
            />
          </div>
          <div className="note-meta-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>创建时间 {new Date(noteData.createdAt).toLocaleString('zh-CN')}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{isSaving ? '保存中...' : '已保存'}</span>
            
            {/* Sync State Indicator (Moved to top right header) */}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <span className="btn btn-outline text-xs" style={{ padding: '2px 8px' }}>+</span>
            {noteData.tags && noteData.tags.map((t: any) => (
              <span key={t.tagId || t.id} className="note-tag">{t.tag?.name || t.name || '标签'}</span>
            ))}
          </div>

          {/* Audio Player Area */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-input)', padding: '16px 24px', borderRadius: 'var(--radius-pill)', gap: '24px' }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="audio/*" 
              onChange={handleAudioUpload} 
            />
            
            {noteData?.audioUrl ? (
              <>
                <audio 
                  ref={audioRef}
                  src={`http://localhost:3001${noteData.audioUrl}`}
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                  onEnded={() => setIsPlaying(false)}
                />

                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {new Date(currentTime * 1000).toISOString().substring(11, 19)}
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
                  {new Date(duration * 1000).toISOString().substring(11, 19)}
                </span>
                
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginLeft: '24px' }}>
                  <button onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 5; }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <FastForward size={18} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  
                  <button onClick={() => {
                    if (isPlaying) audioRef.current?.pause();
                    else audioRef.current?.play();
                    setIsPlaying(!isPlaying);
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </button>
                  
                  <button onClick={() => { if (audioRef.current) audioRef.current.currentTime += 5; }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <FastForward size={18} />
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isRecording ? (
                    <>
                      <div className="audio-wave">
                        {audioVolumes.map((vol, i) => (
                          <div 
                            key={i} 
                            className="audio-wave-bar" 
                            style={{ height: `${vol}px`, animation: 'none', transition: 'height 0.05s ease' }}
                          ></div>
                        ))}
                      </div>
                      正在录音，请讲话...
                    </>
                  ) : '当前笔记暂无录音'}
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {isRecording ? (
                    <button className="btn btn-primary" style={{ backgroundColor: 'var(--danger-color)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '16px' }} onClick={stopRecording}>
                      停止录音并保存
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-outline text-xs" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)', borderRadius: '16px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={startRecording}>
                        <Mic size={14} /> 开始录音
                      </button>
                      <button className="btn btn-outline text-xs" style={{ borderRadius: '16px', padding: '6px 16px' }} onClick={() => fileInputRef.current?.click()}>
                        上传音频文件
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="note-tabs">
          <div className={`note-tab ${activeTab === 'transcript' ? 'active' : ''}`} onClick={() => setActiveTab('transcript')}>录音原文</div>
          <div className={`note-tab ${activeTab === 'note' ? 'active' : ''}`} onClick={() => setActiveTab('note')}>笔记内容</div>
          <div className={`note-tab ${activeTab === 'append' ? 'active' : ''}`} onClick={() => setActiveTab('append')}>追加笔记</div>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1 }}>
          {activeTab === 'note' && (
            <div>
              <EditorToolbar editor={editor} noteTitle={title} />
              <BlockHoverControls editor={editor} />
              <AISlashCommand editor={editor} />
              <div style={{ width: '100%' }}>
                <EditorContent editor={editor} />
              </div>
              {/* Auto Sprout Recommendations (Smart Bi-linking) */}
              {editor && editor.getText().length > 50 && (
                <div className="fade-in" style={{ marginTop: '64px', paddingTop: '32px', borderTop: '1px dashed var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-tertiary)' }}>
                    <Sparkles size={16} />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>智能关联推荐 (Smart Bi-linking)</span>
                  </div>
                  {isSprouting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                      <Loader2 size={14} className="spin" /> 正在思考...
                    </div>
                  ) : uniqueSprouts.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {uniqueSprouts.map((result: any) => (
                        <div key={result.noteId} className="card card-hoverable" style={{ padding: '16px', cursor: 'pointer', borderTop: '3px solid var(--accent-light)', backgroundColor: 'var(--bg-input)' }} onClick={() => navigate(`/n/${result.noteId}`)}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>{result.title || '无标题'}</h4>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {result.content.replace(/【笔记标题：.*?】\n/, '')}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px' }}>
                              相关度: {(result.score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>暂无高度相关的笔记</div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeTab === 'transcript' && (
            <div className="fade-in" style={{ padding: '24px 0', lineHeight: 1.8, color: 'var(--text-primary)' }}>
              {noteData?.transcript ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {noteData.transcriptSummary && (
                    <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', fontSize: '14px' }}>
                      <p style={{ marginBottom: '8px', fontWeight: 600 }}>AI 自动生成摘要：</p>
                      <p style={{ color: 'var(--text-secondary)' }}>{noteData.transcriptSummary}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>录音原文：</p>
                    {!isEditingTranscript && (
                      <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '13px' }} onClick={() => {
                        setEditTranscriptText(noteData.transcript);
                        setIsEditingTranscript(true);
                      }}>
                        <Edit3 size={14} style={{ marginRight: '4px' }} /> 编辑原文
                      </button>
                    )}
                  </div>
                  {isEditingTranscript ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <textarea 
                        value={editTranscriptText}
                        onChange={(e) => setEditTranscriptText(e.target.value)}
                        style={{ 
                          width: '100%', 
                          minHeight: '400px', 
                          padding: '16px', 
                          backgroundColor: '#fff', 
                          border: '1px solid var(--accent-color)', 
                          borderRadius: '12px', 
                          fontSize: '14px', 
                          lineHeight: '1.8', 
                          color: 'var(--text-primary)', 
                          resize: 'vertical', 
                          outline: 'none', 
                          fontFamily: 'inherit',
                          boxShadow: '0 0 0 2px rgba(79, 70, 229, 0.1)'
                        }} 
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button className="btn btn-outline" onClick={() => setIsEditingTranscript(false)}>取消</button>
                        <button className="btn btn-primary" onClick={async () => {
                          if (editTranscriptText !== noteData.transcript) {
                            try {
                              await api.put(`/notes/${id}`, { transcript: editTranscriptText });
                              setNoteData((prev: any) => ({ ...prev, transcript: editTranscriptText }));
                            } catch (err) {
                              console.error('Failed to update transcript', err);
                            }
                          }
                          setIsEditingTranscript(false);
                        }}>保存修改</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', padding: '16px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '14px' }}>
                      {noteData.transcript}
                    </div>
                  )}
                </div>
              ) : noteData?.audioUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '16px', color: 'var(--text-secondary)' }}>
                  <span className="spin" style={{ color: 'var(--primary-color)' }}><Loader2 size={32} /></span>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>正在通过 AI 提取语音内容...</p>
                  <p style={{ fontSize: '13px', textAlign: 'center', maxWidth: '400px' }}>
                    这可能需要几秒到一分钟的时间，请稍候刷新查看结果。
                  </p>
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
                value={appendText}
                onChange={(e) => setAppendText(e.target.value)}
                placeholder="在此输入追加内容..." 
                style={{ width: '100%', minHeight: '200px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6' }}
              />
              <button 
                className="btn btn-primary" 
                style={{ marginTop: '16px' }}
                disabled={!appendText.trim()}
                onClick={() => {
                  if (!editor || !appendText.trim()) return;
                  // Append to the end of the document while preserving newlines
                  const formattedContent = appendText.split('\n').map(line => `<p>${line}</p>`).join('');
                  editor.chain().focus().insertContentAt(editor.state.doc.content.size, `<p></p>${formattedContent}`).run();
                  setAppendText("");
                  setActiveTab('note');
                  window.scrollTo(0, 0);
                }}
              >保存追加</button>
            </div>
          )}
        </div>
      </main>

      {/* Detail Page Floating Action Bar */}
      <div className="floating-action-bar" style={{ gap: '24px', padding: '16px 32px' }}>
        <button className="fab-btn" onClick={() => { setActiveTab('append'); window.scrollTo(0, 0); }}>
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
      <div className="ai-overlay" style={{ display: showAIPanel ? 'block' : 'none' }} onClick={() => setShowAIPanel(false)} />
      <AIPanel
        noteId={id!}
        editorText={editor?.getText() || ''}
        onInsertText={handleInsertAIText}
        onClose={() => setShowAIPanel(false)}
        isOpen={showAIPanel}
      />

      {/* Toast Notification for manual save */}
      {showSaveToast && (
        <div style={{
          position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)',
          padding: '12px 24px', borderRadius: '30px', zIndex: 9999,
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'fade-in 0.3s ease-out'
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>内容已成功保存</span>
        </div>
      )}
    </div>
  );
}

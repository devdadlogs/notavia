import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { Video } from './extensions/Video';
import { Audio } from './extensions/Audio';
import api from '../../services/api';
import { uploadFile } from '../../utils/fileUpload';
import { Image as ImageIcon, Smile, FileVideo, Music } from 'lucide-react';
import AISlashCommand from './AISlashCommand';

import '../../styles/editor.css';

interface BlockEditorProps {
  noteId: string;
}

export default function BlockEditor({ noteId }: BlockEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [noteData, setNoteData] = useState<any>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Load Note
  useEffect(() => {
    const loadNote = async () => {
      try {
        const { data } = await api.get(`/notes/${noteId}`);
        setNoteData(data);
        setTitle(data.title === 'Untitled' ? '' : data.title);
        setCoverImage(data.coverImage);
        setIcon(data.icon);
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(data.contentJson || '');
        }
      } catch (error) {
        console.error('Failed to load note', error);
      }
    };
    if (noteId) loadNote();
  }, [noteId]);

  const saveNote = useCallback(async (newTitle: string, contentJson: any, contentText: string, newCover: string | null, newIcon: string | null) => {
    setIsSaving(true);
    try {
      await api.put(`/notes/${noteId}`, {
        title: newTitle || 'Untitled',
        contentJson,
        contentText,
        coverImage: newCover,
        icon: newIcon
      });
    } catch (error) {
      console.error('Failed to save note', error);
    } finally {
      setIsSaving(false);
    }
  }, [noteId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Video,
      Audio,
      Placeholder.configure({ placeholder: 'Press "/" for commands, or start typing...' }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      saveNote(title, editor.getJSON(), editor.getText(), coverImage, icon);
    },
    editorProps: {
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          handleMediaUpload(file);
          return true; // handled
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          handleMediaUpload(event.clipboardData.files[0]);
          return true; // handled
        }
        return false;
      }
    }
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (editor) {
      saveNote(newTitle, editor.getJSON(), editor.getText(), coverImage, icon);
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!editor) return;
    try {
      const url = await uploadFile(file);
      const type = file.type.split('/')[0];
      
      if (type === 'image') {
        editor.chain().focus().setImage({ src: url }).run();
      } else if (type === 'video') {
        editor.chain().focus().setVideo({ src: url }).run();
      } else if (type === 'audio') {
        editor.chain().focus().setAudio({ src: url }).run();
      }
    } catch (error) {
      console.error('Upload failed', error);
      alert('Upload failed. Note: Max size is 50MB.');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const url = await uploadFile(e.target.files[0]);
        setCoverImage(url);
        if (editor) saveNote(title, editor.getJSON(), editor.getText(), url, icon);
      } catch (error) {
        console.error('Cover upload failed', error);
      }
    }
  };

  const addRandomIcon = () => {
    const emojis = ['🚀', '🧠', '💡', '🔥', '✨', '📝', '🎯'];
    const random = emojis[Math.floor(Math.random() * emojis.length)];
    setIcon(random);
    if (editor) saveNote(title, editor.getJSON(), editor.getText(), coverImage, random);
  };

  if (!editor || !noteData) return <div>Loading editor...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'fixed', top: '16px', right: '24px', fontSize: '12px', color: 'var(--text-secondary)', zIndex: 100 }}>
        {isSaving ? 'Saving...' : 'Saved'}
      </div>
      
      {/* Cover Image Area */}
      <div className="editor-cover-container" style={{ position: 'relative', marginTop: '-40px', marginLeft: '-40px', marginRight: '-40px' }}>
        {coverImage ? (
          <img src={coverImage} alt="Cover" className="editor-cover" />
        ) : (
          <div className="editor-cover-placeholder"></div>
        )}
        <div className="editor-cover-actions">
          <input type="file" accept="image/*" ref={coverInputRef} style={{ display: 'none' }} onChange={handleCoverUpload} />
          <button className="btn btn-secondary" onClick={() => coverInputRef.current?.click()}>
            <ImageIcon size={14} /> Change Cover
          </button>
        </div>
      </div>

      <div style={{ padding: '0' }}>
        {/* Icon Area */}
        <div className="editor-icon-container">
          <button className="editor-icon" onClick={addRandomIcon} title="Change Icon">
            {icon || '📄'}
          </button>
        </div>

        {/* Title Input */}
        <input 
          type="text" 
          className="editor-title-input" 
          placeholder="Untitled" 
          value={title} 
          onChange={handleTitleChange}
        />

        {/* Action Bar (Notion style Add Cover/Icon) */}
        {(!coverImage || !icon) && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', marginTop: '-16px', opacity: 0.7 }}>
            {!icon && (
              <button className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)' }} onClick={addRandomIcon}>
                <Smile size={16} /> Add Icon
              </button>
            )}
            {!coverImage && (
              <button className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)' }} onClick={() => coverInputRef.current?.click()}>
                <ImageIcon size={16} /> Add Cover
              </button>
            )}
          </div>
        )}

        {/* Media Upload helper */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) handleMediaUpload(e.target.files[0]);
          }} 
        />
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
           <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Drag & Drop files here or click to insert:
           </span>
           <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => fileInputRef.current?.click()}><ImageIcon size={14} /> Image</button>
           <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => fileInputRef.current?.click()}><FileVideo size={14} /> Video</button>
           <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => fileInputRef.current?.click()}><Music size={14} /> Audio</button>
        </div>

        {/* Actual Editor Content */}
        <AISlashCommand editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

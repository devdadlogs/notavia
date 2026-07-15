import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import {
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  List, ListOrdered, CheckSquare, Quote, Minus,
  Image as ImageIcon, Table as TableIcon, Code, Paperclip, Link,
  FileVideo, Music, Lock, Globe, Plus, Hash
} from 'lucide-react';
import { uploadFile } from '../../utils/fileUpload';

interface BlockHoverControlsProps {
  editor: Editor | null;
}

export function BlockHoverControls({ editor }: BlockHoverControlsProps) {
  const [hoverState, setHoverState] = useState<{ top: number; left: number; pos: number; node: any } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const imgInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionPosRef = useRef<number | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean, text: string, url: string, pos: number }>({
    open: false, text: '', url: '', pos: 0
  });

  useEffect(() => {
    if (!editor) return;

    const handleMouseMove = (e: MouseEvent) => {
      // If menu is open, do not update hover position
      if (isMenuOpen) return;

      // Do not clear the hover state if the user is hovering over the + button itself!
      if (
        (btnRef.current && btnRef.current.contains(e.target as Node)) ||
        (menuRef.current && menuRef.current.contains(e.target as Node))
      ) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        return;
      }

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      const view = editor.view;
      const posAtCoords = view.posAtCoords({ left: e.clientX, top: e.clientY });
      
      if (!posAtCoords) {
        hideTimeoutRef.current = setTimeout(() => {
          setHoverState(null);
          setIsMenuOpen(false);
        }, 150);
        return;
      }

      const { pos } = posAtCoords;
      const resolvedPos = view.state.doc.resolve(pos);
      const node = resolvedPos.parent;

      // We specifically want to show the "+" sign on empty paragraphs.
      // (The user requested: "只有单独一行是空行才显示+号，比如在列表中不显示")
      // depth === 1 ensures it's a top-level block, not inside lists or tables.
      if (node.type.name === 'paragraph' && node.content.size === 0 && resolvedPos.depth === 1) {
        // We need the DOM node to get the exact Y position
        const domNode = view.nodeDOM(resolvedPos.before(resolvedPos.depth)) as HTMLElement;
        if (domNode && domNode.nodeType === 1) {
          const rect = domNode.getBoundingClientRect();
          // We place the button to the left of the text block
          const left = rect.left - 30; // slightly further left to ensure safe gap
          const top = rect.top;
          
          setHoverState({ top, left, pos: resolvedPos.before(resolvedPos.depth), node });
          return;
        }
      }

      hideTimeoutRef.current = setTimeout(() => {
        setHoverState(null);
        setIsMenuOpen(false);
      }, 150);
    };

    const handleDocumentClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    const scrollHandler = () => {
      if (!isMenuOpen) {
        setHoverState(null);
      } else {
        setHoverState(prev => {
          if (!prev) return prev;
          const domNode = editor.view.nodeDOM(prev.pos) as HTMLElement;
          if (domNode && domNode.nodeType === 1) {
            const rect = domNode.getBoundingClientRect();
            return { ...prev, top: rect.top, left: rect.left - 30 };
          }
          return prev;
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('scroll', scrollHandler, true);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [editor, isMenuOpen]);

  const handleMouseEnterBtn = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    // User requested: "鼠标hover（100毫秒）出现菜单"
    hoverTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(true);
    }, 100);
  };

  const handleMouseLeaveBtn = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || actionPosRef.current === null) return;
    try {
      const url = await uploadFile(file);
      editor?.chain().focus()
        .setNodeSelection(actionPosRef.current)
        .insertContent({ type: 'resizableImage', attrs: { src: url } })
        .run();
      setIsMenuOpen(false);
      setHoverState(null);
      actionPosRef.current = null;
    } catch (err) {
      console.error(err);
      alert("上传图片失败");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || actionPosRef.current === null) return;
    try {
      const url = await uploadFile(file);
      editor?.chain().focus()
        .setNodeSelection(actionPosRef.current)
        .insertContent({
          type: 'text',
          text: file.name,
          marks: [{ type: 'link', attrs: { href: url, download: true, target: '_blank' } }]
        })
        .run();
      setIsMenuOpen(false);
      setHoverState(null);
      actionPosRef.current = null;
    } catch (err) {
      console.error(err);
      alert("上传文件失败");
    }
  };

  const submitLink = () => {
    if (!linkDialog.url) return;
    editor?.chain().focus()
      .setNodeSelection(linkDialog.pos)
      .insertContent({
        type: 'text',
        text: linkDialog.text || linkDialog.url,
        marks: [{ type: 'link', attrs: { href: linkDialog.url } }]
      })
      .run();
    setLinkDialog({ ...linkDialog, open: false });
    setIsMenuOpen(false);
    setHoverState(null);
  };

  if (!editor || (!hoverState && !linkDialog.open)) return null;

  const insertBlock = (action: () => void) => {
    if (!hoverState) return;
    setIsMenuOpen(false);
    // Focus the editor, move cursor to the target block, and perform the action
    editor.chain().focus().setNodeSelection(hoverState.pos).run();
    action();
  };

  const spaceBelow = hoverState ? window.innerHeight - hoverState.top - 24 : 0;
  const spaceAbove = hoverState ? hoverState.top : 0;
  const openUpwards = spaceBelow < 420 && spaceAbove > spaceBelow;
  
  const dynamicMaxHeight = openUpwards 
    ? Math.max(100, Math.min(400, spaceAbove - 16)) 
    : Math.max(100, Math.min(400, spaceBelow - 16));

  const renderMenuItem = (icon: React.ReactNode, label: string, action: () => void) => (
    <button
      onClick={() => insertBlock(action)}
      style={{
        display: 'flex', alignItems: 'center', width: '100%', padding: '6px 12px',
        border: 'none', background: 'transparent', textAlign: 'left',
        cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)',
        gap: '12px'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-panel-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      {/* Hidden Inputs */}
      <input type="file" accept="image/png, image/jpeg, image/gif, image/webp" ref={imgInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />

      {/* Link Dialog */}
      {linkDialog.open && (
        <div style={{
          position: 'fixed',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'var(--bg-panel)',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          zIndex: 1000,
          width: '320px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--text-primary)' }}>文本</label>
            <input 
              autoFocus
              type="text" 
              placeholder="请输入文本" 
              value={linkDialog.text}
              onChange={e => setLinkDialog({ ...linkDialog, text: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #1677ff', borderRadius: '4px', background: 'var(--bg-color)', outline: 'none' }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--text-primary)' }}>
              <span style={{ color: 'red' }}>*</span> 链接地址
            </label>
            <input 
              type="text" 
              placeholder="请输入链接地址" 
              value={linkDialog.url}
              onChange={e => setLinkDialog({ ...linkDialog, url: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-color)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button 
              onClick={() => { setLinkDialog({ ...linkDialog, open: false }); setIsMenuOpen(false); }}
              style={{ padding: '6px 16px', background: 'var(--bg-panel-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-primary)' }}
            >取消</button>
            <button 
              onClick={submitLink}
              style={{ padding: '6px 16px', background: '#d0d7e6', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#555' }}
            >确定</button>
          </div>
        </div>
      )}

      {hoverState && (
        <button
          ref={btnRef}
          onMouseEnter={handleMouseEnterBtn}
        onMouseLeave={handleMouseLeaveBtn}
        style={{
          position: 'fixed',
          top: hoverState.top,
          left: hoverState.left,
          width: '20px', height: '20px',
          borderRadius: '50%',
          border: '1px solid #ccc',
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100,
          color: '#888',
          padding: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
        // In case position is fixed but we use window.scrollY, we must use absolute positioning to avoid jitter on scroll
      >
        <Plus size={14} />
      </button>
      )}

      {isMenuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            ...(openUpwards 
              ? { bottom: window.innerHeight - hoverState!.top + 4 }
              : { top: hoverState!.top + 24 }
            ),
            left: hoverState!.left,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 101,
            width: '220px',
            maxHeight: `${dynamicMaxHeight}px`,
            overflowY: 'auto',
            padding: '8px 0',
            fontFamily: 'inherit'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 12px', fontWeight: 500 }}>样式</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '4px 8px', gap: '4px' }}>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHeading({ level: 1 }).run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="H1"><Heading1 size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHeading({ level: 2 }).run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="H2"><Heading2 size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHeading({ level: 3 }).run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="H3"><Heading3 size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHeading({ level: 4 }).run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="H4"><Heading4 size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHeading({ level: 5 }).run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="H5"><Heading5 size={16} color="var(--text-secondary)"/></button>
            
            <button onClick={() => insertBlock(() => editor.chain().focus().toggleBulletList().run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="无序列表"><List size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().toggleOrderedList().run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="有序列表"><ListOrdered size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().toggleTaskList().run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="待办事项"><CheckSquare size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().toggleBlockquote().run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="引用"><Quote size={16} color="var(--text-secondary)"/></button>
            <button onClick={() => insertBlock(() => editor.chain().focus().setHorizontalRule().run())} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="分割线"><Minus size={16} color="var(--text-secondary)"/></button>
          </div>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 12px', fontWeight: 500 }}>通用</div>
          {renderMenuItem(<ImageIcon size={15}/>, "图片", () => {
             actionPosRef.current = hoverState!.pos;
             setIsMenuOpen(false);
             imgInputRef.current?.click();
          })}
          {renderMenuItem(<TableIcon size={15}/>, "表格", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          {renderMenuItem(<Code size={15}/>, "代码块", () => editor.chain().focus().toggleCodeBlock().run())}
          {renderMenuItem(<Paperclip size={15}/>, "文件", () => {
             actionPosRef.current = hoverState!.pos;
             setIsMenuOpen(false);
             fileInputRef.current?.click();
          })}
          {renderMenuItem(<Link size={15}/>, "链接", () => {
             setIsMenuOpen(false);
             setLinkDialog({ open: true, text: '', url: '', pos: hoverState!.pos });
          })}
          {renderMenuItem(<Minus size={15}/>, "分割线", () => editor.chain().focus().setHorizontalRule().run())}
          {renderMenuItem(<Hash size={15}/>, "流程图/UML", () => {})}
          {renderMenuItem(<Music size={15}/>, "音频", () => {})}
          {renderMenuItem(<Globe size={15}/>, "网页", () => {})}
          {renderMenuItem(<Lock size={15}/>, "加密文本", () => {})}

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 12px', fontWeight: 500 }}>第三方内容</div>
          {renderMenuItem(<FileVideo size={15} color="#00A1D6"/>, "哔哩哔哩", () => {})}
          {renderMenuItem(<FileVideo size={15} color="#FF3A3A"/>, "墨刀", () => {})}
          {renderMenuItem(<FileVideo size={15} color="#FF9900"/>, "腾讯视频", () => {})}
        </div>
      )}
    </>
  );
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Minus,
  Heading1, Heading2, Heading3, Highlighter,
  Palette, Download, RotateCcw, RotateCw,
  Type, ChevronDown, TableProperties, Trash2,
  Rows, Columns, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Table as TableIcon
} from 'lucide-react';
import { TableHoverControls } from './TableHoverControls';

interface ToolbarProps {
  editor: Editor | null;
  noteTitle?: string;
}

// ---- Toolbar Button ----
function ToolbarBtn({
  onClick, active = false, title, disabled = false, children
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '30px', height: '30px', borderRadius: '6px', border: 'none',
        background: active ? 'var(--primary-color)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s, color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 4px', flexShrink: 0 }} />;
}

// ---- Heading Dropdown ----
function HeadingDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current =
    editor.isActive('heading', { level: 1 }) ? 'H1' :
    editor.isActive('heading', { level: 2 }) ? 'H2' :
    editor.isActive('heading', { level: 3 }) ? 'H3' : '正文';

  const items = [
    { label: '正文', action: () => editor.chain().focus().setParagraph().run() },
    { label: 'H1 大标题', action: () => editor.chain().focus().setHeading({ level: 1 }).run() },
    { label: 'H2 中标题', action: () => editor.chain().focus().setHeading({ level: 2 }).run() },
    { label: 'H3 小标题', action: () => editor.chain().focus().setHeading({ level: 3 }).run() },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen(o => !o); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          height: '30px', padding: '0 8px', borderRadius: '6px', border: 'none',
          background: 'transparent', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: '13px', fontWeight: 500,
          fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        <Type size={14} />
        <span>{current}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '34px', left: 0, zIndex: 1000,
          background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', boxShadow: 'var(--shadow-md)', overflow: 'hidden',
          minWidth: '140px',
        }}>
          {items.map(item => (
            <button
              key={item.label}
              onMouseDown={(e) => { e.preventDefault(); item.action(); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', border: 'none', background: 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Color Picker ----
function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const colors = [
    '#000000', '#374151', '#6B7280', '#9CA3AF',
    '#DC2626', '#EA580C', '#D97706', '#65A30D',
    '#0891B2', '#2563EB', '#7C3AED', '#DB2777',
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen(o => !o); }}
        title="文字颜色"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '30px', height: '30px', borderRadius: '6px', border: 'none',
          background: 'transparent', color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        <Palette size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '34px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', boxShadow: 'var(--shadow-md)', padding: '8px',
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px',
          width: '160px',
        }}>
          {colors.map(color => (
            <button
              key={color}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().setColor(color).run();
                setOpen(false);
              }}
              title={color}
              style={{
                width: '20px', height: '20px', borderRadius: '4px', border: '2px solid transparent',
                background: color, cursor: 'pointer', padding: 0,
              }}
            />
          ))}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetColor().run();
              setOpen(false);
            }}
            style={{
              gridColumn: '1 / -1', padding: '4px', border: '1px solid var(--border-color)',
              borderRadius: '4px', background: 'transparent', cursor: 'pointer',
              fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'inherit',
            }}
          >
            清除颜色
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Markdown Export ----
function exportMarkdown(editor: Editor, title = 'note') {
  const md: string = (editor.storage as any).markdown?.getMarkdown?.() ?? editor.getText();
  const blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Custom Floating Selection Toolbar (replaces BubbleMenu which isn't a React component in Tiptap v3) ----
function useFloatingMenu(editor: Editor | null) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const update = useCallback(() => {
    if (!editor || editor.state.selection.empty) {
      setPos(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setPos(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) { setPos(null); return; }
    setPos({ top: rect.top + window.scrollY - 52, left: rect.left + rect.width / 2 });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', update);
    editor.on('focus', update);
    editor.on('blur', () => setPos(null));
    document.addEventListener('mouseup', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('focus', update);
      editor.off('blur', () => setPos(null));
      document.removeEventListener('mouseup', update);
    };
  }, [editor, update]);

  return pos;
}

// ---- Main Toolbar Component ----
export default function EditorToolbar({ editor, noteTitle }: ToolbarProps) {
  const floatingPos = useFloatingMenu(editor);
  const [, setTick] = useState(0);

  // Force re-render on editor transactions (e.g., selection change, formatting change)
  useEffect(() => {
    if (!editor) return;
    const update = () => setTick(t => t + 1);
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      {/* Fixed toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: '2px', padding: '6px 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-panel)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <HeadingDropdown editor={editor} />
        <ToolbarSep />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗 (Ctrl+B)">
          <Bold size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体 (Ctrl+I)">
          <Italic size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线 (Ctrl+U)">
          <Underline size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线">
          <Strikethrough size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码">
          <Code size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="高亮">
          <Highlighter size={15} />
        </ToolbarBtn>
        <ColorPicker editor={editor} />
        <ToolbarSep />

        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐">
          <AlignLeft size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中">
          <AlignCenter size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐">
          <AlignRight size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="两端对齐">
          <AlignJustify size={15} />
        </ToolbarBtn>
        <ToolbarSep />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
          <ListOrdered size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
          <Quote size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="插入分隔线">
          <Minus size={15} />
        </ToolbarBtn>
        <ToolbarSep />

        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="撤销 (Ctrl+Z)" disabled={!editor.can().undo()}>
          <RotateCcw size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="重做 (Ctrl+Shift+Z)" disabled={!editor.can().redo()}>
          <RotateCw size={15} />
        </ToolbarBtn>
        <ToolbarSep />

        <ToolbarBtn onClick={() => exportMarkdown(editor, noteTitle)} active={false} title="导出为 Markdown (.md)">
          <Download size={15} />
        </ToolbarBtn>
        <ToolbarSep />

        <ToolbarBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} active={false} title="插入 3x3 表格">
          <TableIcon size={15} />
        </ToolbarBtn>
      </div>

      {/* Table Context Toolbar */}
      {editor.can().addColumnBefore() && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: '2px', padding: '4px 12px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-panel-hover)',
          fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          <TableProperties size={14} style={{ marginRight: '8px' }} />
          <span style={{ marginRight: '12px', fontWeight: 500 }}>表格操作</span>
          
          <ToolbarBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="在上方插入行">
            <ArrowUp size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="在下方插入行">
            <ArrowDown size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行">
            <Rows size={14} color="var(--error-color)" />
          </ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="在左侧插入列">
            <ArrowLeft size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="在右侧插入列">
            <ArrowRight size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列">
            <Columns size={14} color="var(--error-color)" />
          </ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().deleteTable().run()} title="删除整个表格">
            <Trash2 size={14} color="var(--error-color)" />
          </ToolbarBtn>
        </div>
      )}

      {/* Advanced hover-based Table Controls overlay */}
      <TableHoverControls editor={editor} />

      {/* Floating selection toolbar */}
      {floatingPos && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: floatingPos.top,
            left: floatingPos.left,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '2px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '4px 6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
        >
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗">
            <Bold size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体">
            <Italic size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线">
            <Underline size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线">
            <Strikethrough size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="高亮">
            <Highlighter size={14} />
          </ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
            <Heading1 size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
            <Heading2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
            <Heading3 size={14} />
          </ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
            <List size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
            <ListOrdered size={14} />
          </ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐">
            <AlignLeft size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中">
            <AlignCenter size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐">
            <AlignRight size={14} />
          </ToolbarBtn>
        </div>
      )}
    </>
  );
}

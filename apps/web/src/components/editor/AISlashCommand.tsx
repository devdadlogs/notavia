import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Sparkles, Languages, Type, Wand2, Loader2 } from 'lucide-react';
import { aiService } from '../../services/ai';

interface AISlashCommandProps {
  editor: Editor | null;
}

export default function AISlashCommand({ editor }: AISlashCommandProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editor) return;

    const updateHandler = () => {
      const { selection } = editor.state;
      const { empty, $anchor } = selection;

      if (!empty) {
        if (show) setShow(false);
        return;
      }

      // Get text before cursor in current block
      const currentBlockText = $anchor.parent.textContent;
      const textBeforeCursor = currentBlockText.slice(0, $anchor.parentOffset);

      // Trigger if ends with /ai
      if (textBeforeCursor.endsWith('/ai')) {
        const { view } = editor;
        const coords = view.coordsAtPos(selection.from);
        
        const editorElement = editor.view.dom;
        const editorRect = editorElement.getBoundingClientRect();
        
        // Calculate position relative to the nearest positioned ancestor (offsetParent)
        setPos({
          top: coords.bottom - editorRect.top + editorElement.offsetTop + 5,
          left: coords.left - editorRect.left + editorElement.offsetLeft
        });
        
        setShow(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      } else {
        if (show) setShow(false);
      }
    };

    editor.on('selectionUpdate', updateHandler);
    editor.on('update', updateHandler);

    return () => {
      editor.off('selectionUpdate', updateHandler);
      editor.off('update', updateHandler);
    };
  }, [editor, show]);

  const handleAction = async (actionType: 'prompt' | 'polish' | 'translate' | 'continue') => {
    if (!editor) return;
    
    // 1. Delete the "/ai" trigger text
    const { state, view } = editor;
    const { $anchor } = state.selection;
    editor.chain().focus().deleteRange({ from: $anchor.pos - 3, to: $anchor.pos }).run();

    // 2. Extract current paragraph text if needed
    const currentParagraph = $anchor.parent.textContent.replace(/\/ai$/, '').trim();
    
    let aiPrompt = '';
    
    if (actionType === 'prompt') {
      if (!prompt.trim()) return;
      aiPrompt = prompt;
    } else if (actionType === 'polish') {
      if (!currentParagraph) {
        alert('没有可以润色的文本');
        setShow(false);
        return;
      }
      aiPrompt = `请润色这段文字，使其更加通顺、专业，直接输出润色后的结果，不要有任何多余的解释：\n${currentParagraph}`;
    } else if (actionType === 'translate') {
      if (!currentParagraph) {
        alert('没有可以翻译的文本');
        setShow(false);
        return;
      }
      aiPrompt = `请将以下文本翻译为英文，直接输出翻译结果，不要有任何多余的解释：\n${currentParagraph}`;
    } else if (actionType === 'continue') {
      if (!currentParagraph) {
        alert('没有可以续写的文本');
        setShow(false);
        return;
      }
      aiPrompt = `请紧接以下文本续写一段内容，保持相同的风格，直接输出续写的结果：\n${currentParagraph}`;
    }

    setIsProcessing(true);
    try {
      // Use standard chat endpoint for generation without RAG overhead (or we can use sprout)
      // We will use the existing AI chat service
      const response = await aiService.chat(aiPrompt); // We need a direct chat method, let's use global chat
      
      const aiText = response.text || response.reply || response;
      
      if (actionType === 'prompt' || actionType === 'continue') {
        // Append at cursor
        editor.chain().focus().insertContent(aiText).run();
      } else {
        // Replace current block (for polish and translate)
        const newPos = editor.state.selection.from;
        const $pos = editor.state.doc.resolve(newPos);
        const start = $pos.start();
        const end = $pos.end();
        editor.chain().focus()
          .deleteRange({ from: start, to: end })
          .insertContent(aiText)
          .run();
      }
    } catch (error) {
      console.error('AI Error:', error);
      alert('AI 生成失败，请重试');
    } finally {
      setIsProcessing(false);
      setShow(false);
      setPrompt('');
    }
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 100,
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-lg)',
        padding: '12px',
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      {isProcessing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)', padding: '8px' }}>
          <Loader2 size={16} className="spin" />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>AI 正在思考...</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <Sparkles size={16} color="var(--accent-color)" style={{ marginRight: '8px' }} />
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAction('prompt');
                } else if (e.key === 'Escape') {
                  setShow(false);
                  editor?.commands.focus();
                }
              }}
              placeholder="让 AI 帮你写点什么... (按回车)"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '13px',
                color: 'var(--text-primary)'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '0 4px', marginBottom: '4px' }}>针对当前段落</div>
            <button 
              onClick={() => handleAction('polish')}
              className="ai-slash-btn"
              style={btnStyle}
            >
              <Wand2 size={14} /> 润色当前段落
            </button>
            <button 
              onClick={() => handleAction('continue')}
              className="ai-slash-btn"
              style={btnStyle}
            >
              <Type size={14} /> 续写当前段落
            </button>
            <button 
              onClick={() => handleAction('translate')}
              className="ai-slash-btn"
              style={btnStyle}
            >
              <Languages size={14} /> 翻译为英文
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const btnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  borderRadius: '4px',
  textAlign: 'left' as const,
  width: '100%',
  transition: 'background 0.2s, color 0.2s'
};

import React, { useState } from 'react';
import { 
  X, Sparkles, FileText, ListChecks, PenLine, RefreshCw, Tag, Loader2, 
  ChevronDown, Copy, Check
} from 'lucide-react';
import { aiService } from '../../services/ai';

interface AIPanelProps {
  noteId: string;
  editorText: string; // Current plain text from the Tiptap editor
  onInsertText?: (text: string, mode: 'cursor' | 'bottom' | 'top') => void; // Callback to insert AI text into editor
  onClose: () => void;
  isOpen: boolean;
}

type AIAction = 'summarize-brief' | 'summarize-detailed' | 'extract' | 'continue' | 'rewrite-formal' | 'rewrite-casual' | 'rewrite-concise' | 'suggest-tags';

const AI_ACTIONS: { key: AIAction; icon: React.ReactNode; label: string; group: string }[] = [
  { key: 'summarize-brief', icon: <FileText size={16} />, label: '三句话总结', group: '总结' },
  { key: 'summarize-detailed', icon: <FileText size={16} />, label: '详细总结', group: '总结' },
  { key: 'extract', icon: <ListChecks size={16} />, label: '提炼要点', group: '分析' },
  { key: 'continue', icon: <PenLine size={16} />, label: 'AI 续写', group: '创作' },
  { key: 'rewrite-formal', icon: <RefreshCw size={16} />, label: '改写为正式风格', group: '改写' },
  { key: 'rewrite-casual', icon: <RefreshCw size={16} />, label: '改写为口语风格', group: '改写' },
  { key: 'rewrite-concise', icon: <RefreshCw size={16} />, label: '改写为精炼风格', group: '改写' },
  { key: 'suggest-tags', icon: <Tag size={16} />, label: '推荐标签', group: '标签' },
];

export default function AIPanel({ noteId, editorText, onInsertText, onClose, isOpen }: AIPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAction = async (action: AIAction) => {
    setIsLoading(true);
    setResult(null);
    setActiveAction(action);

    try {
      const onChunk = (text: string) => {
        setResult(text);
        setIsLoading(false); // Stop the spinner once streaming starts
      };

      let res = '';
      switch (action) {
        case 'summarize-brief':
          res = await aiService.summarize(noteId, 'brief', onChunk);
          break;
        case 'summarize-detailed':
          res = await aiService.summarize(noteId, 'detailed', onChunk);
          break;
        case 'extract':
          res = await aiService.extractKeyPoints(noteId, onChunk);
          break;
        case 'continue':
          res = await aiService.continueWriting(editorText, onChunk);
          break;
        case 'rewrite-formal':
          res = await aiService.rewrite(editorText, 'formal', onChunk);
          break;
        case 'rewrite-casual':
          res = await aiService.rewrite(editorText, 'casual', onChunk);
          break;
        case 'rewrite-concise':
          res = await aiService.rewrite(editorText, 'concise', onChunk);
          break;
        case 'suggest-tags':
          res = await aiService.suggestTags(noteId, onChunk);
          break;
      }
      // setResult(res) is already handled by onChunk, but just in case it wasn't streaming:
      if (!res && result) res = result; 
      setResult(res);
    } catch (err: any) {
      setResult(`❌ AI 处理失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInsertCursor = () => {
    if (result && onInsertText) {
      onInsertText(result, 'cursor');
    }
  };

  const handleInsertBottom = () => {
    if (result && onInsertText) {
      onInsertText(result, 'bottom');
    }
  };

  const handleInsertTop = () => {
    if (result && onInsertText) {
      onInsertText(result, 'top');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh',
      backgroundColor: 'var(--bg-panel)', borderLeft: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column', zIndex: 200,
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      visibility: isOpen ? 'visible' : 'hidden',
      boxShadow: isOpen ? '-8px 0 32px rgba(0,0,0,0.08)' : 'none'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px', borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} color="var(--accent-color)" />
          <span style={{ fontSize: '16px', fontWeight: 600 }}>AI 助手</span>
          <span style={{
            fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
            backgroundColor: 'var(--accent-light)', color: '#059669', fontWeight: 500
          }}>本地推理</span>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', padding: '4px'
        }}>
          <X size={20} />
        </button>
      </div>

      {/* Action Buttons Grid */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>
          选择 AI 操作
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {AI_ACTIONS.map(action => (
            <button
              key={action.key}
              onClick={() => handleAction(action.key)}
              disabled={isLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: 'var(--radius-pill)',
                border: activeAction === action.key ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                backgroundColor: activeAction === action.key ? 'var(--accent-light)' : 'transparent',
                color: activeAction === action.key ? '#059669' : 'var(--text-primary)',
                cursor: isLoading ? 'wait' : 'pointer',
                fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
                transition: 'all var(--transition-fast)',
                opacity: isLoading && activeAction !== action.key ? 0.5 : 1
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {isLoading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '16px', padding: '60px 0',
            color: 'var(--text-secondary)'
          }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '14px' }}>AI 正在本地推理中...</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              数据未离开您的服务器 🔒
            </div>
          </div>
        )}

        {!isLoading && result && (
          <div>
            <div style={{
              fontSize: '14px', lineHeight: 1.8, color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap', padding: '20px',
              backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)'
            }}>
              {result}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button onClick={handleCopy} className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制'}
              </button>
              {onInsertText && (
                <>
                  <button onClick={handleInsertCursor} className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--text-secondary)' }}>
                    <PenLine size={14} />
                    插到光标处
                  </button>
                  <button onClick={handleInsertBottom} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'var(--accent-color)', borderRadius: 'var(--radius-pill)' }}>
                    <ListChecks size={14} />
                    追加到末尾
                  </button>
                  {activeAction === 'suggest-tags' && (
                    <button onClick={handleInsertTop} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#8b5cf6', borderRadius: 'var(--radius-pill)', borderColor: '#8b5cf6' }}>
                      <Sparkles size={14} />
                      置于文档顶部
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {!isLoading && !result && (
          <div style={{
            textAlign: 'center', color: 'var(--text-tertiary)', padding: '60px 0',
            fontSize: '14px'
          }}>
            <Sparkles size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
            <div>选择上方的 AI 操作</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>所有处理均在您的私有服务器上完成</div>
          </div>
        )}
      </div>
    </div>
  );
}

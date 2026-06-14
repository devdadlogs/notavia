import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Search, Gift, Play, MoreHorizontal, Mic, Edit3, Plus, Menu, Loader2, Trash2, Upload } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { uploadFile } from '../../utils/fileUpload';

export default function Dashboard() {
  const [notes, setNotes] = useState<any[]>([]);
  const [clipUrl, setClipUrl] = useState('');
  const [isClipping, setIsClipping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const toggleSidebar = useUIStore(state => state.toggleSidebar);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const { data } = await api.get('/notes');
        setNotes(data);
      } catch (err) {
        console.error('Failed to fetch notes', err);
      }
    };
    fetchNotes();
  }, []);

  const createNote = async () => {
    try {
      const { data } = await api.post('/notes', { title: '新笔记' });
      navigate(`/n/${data.id}`);
    } catch (err) {
      console.error('Failed to create note', err);
    }
  };

  const handleClip = async () => {
    if (!clipUrl) return;
    setIsClipping(true);
    try {
      const { data } = await api.post('/notes/clipper', { url: clipUrl });
      setNotes(prev => [data, ...prev]);
      setClipUrl('');
      // Optionally navigate to the new note
      // navigate(`/n/${data.id}`);
    } catch (err) {
      console.error('Web clipper failed', err);
      alert('链接提取失败，请检查链接是否正确或网络是否通畅');
    } finally {
      setIsClipping(false);
    }
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这条笔记吗？')) return;
    
    try {
      await api.delete(`/notes/${id}`);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  // Dynamic loader for Mammoth (.docx parser)
  const loadMammoth = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).mammoth) {
        resolve((window as any).mammoth);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = () => resolve((window as any).mammoth);
      script.onerror = () => reject(new Error('Failed to load mammoth library'));
      document.head.appendChild(script);
    });
  };

  // Dynamic loader for PDF.js (.pdf parser)
  const loadPdfJS = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = async () => {
        const pdfjsLib = (window as any).pdfjsLib;
        try {
          // Fetch worker code and make a local Blob URL to fully bypass modern browser same-origin restrictions on Web Workers
          const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          const response = await fetch(workerUrl);
          const workerCode = await response.text();
          const blob = new Blob([workerCode], { type: 'text/javascript' });
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('Worker CORS fallback direct CDN loading');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }
        resolve(pdfjsLib);
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js library'));
      document.head.appendChild(script);
    });
  };

  // Helper: render a single PDF page to a canvas and upload as image, returns the uploaded URL
  const renderPdfPageAsImage = async (page: any, pageNum: number): Promise<string> => {
    const scale = 2; // High-res rendering
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert canvas to blob and upload
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const imageFile = new File([blob], `pdf-page-${pageNum}.png`, { type: 'image/png' });
    const url = await uploadFile(imageFile);
    return url;
  };

  // Extract text + images page-by-page from PDF. Scanned pages are rendered as images and uploaded.
  const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const pdfjsLib = await loadPdfJS();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullHtml = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items;
      
      let lastY = -1;
      let lineText = '';
      let pageText = '';
      
      for (const item of items) {
        if (!item || typeof item.str !== 'string') continue;
        const transform = item.transform;
        if (!transform || transform.length < 6) continue;

        if (lastY !== -1 && Math.abs(transform[5] - lastY) > 5) {
          if (lineText.trim()) {
            pageText += `<p>${lineText.trim()}</p>\n`;
          }
          lineText = '';
        }
        lineText += item.str;
        lastY = transform[5];
      }
      if (lineText.trim()) {
        pageText += `<p>${lineText.trim()}</p>\n`;
      }

      // Check if this page has meaningful text
      const pageRawText = pageText.replace(/<[^>]*>/g, '').trim();
      if (pageRawText.length >= 5) {
        // Text page - use extracted text
        fullHtml += `<h3>📄 第 ${i} 页</h3>\n${pageText}\n`;
      } else {
        // Scanned / image page - render as image and upload
        try {
          const imageUrl = await renderPdfPageAsImage(page, i);
          fullHtml += `<h3>📄 第 ${i} 页 (图片)</h3>\n<img src="http://localhost:3001${imageUrl}" alt="PDF第${i}页" style="max-width:100%" />\n`;
        } catch (imgErr) {
          console.warn(`Page ${i} image render failed`, imgErr);
          fullHtml += `<h3>📄 第 ${i} 页</h3>\n<p>(该页为图片，渲染失败)</p>\n`;
        }
      }
    }

    return fullHtml;
  };

  // Multi-format file importer (Docx, Markdown, Text, HTML, PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-uploading the same file triggers onChange
    e.target.value = '';

    setIsImporting(true);
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "") || file.name;
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    try {
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt || '')) {
        try {
          const uploadedUrl = await uploadFile(file);
          const tiptapJson = {
            type: 'doc',
            content: [
              {
                type: 'resizableImage',
                attrs: {
                  src: `http://localhost:3001${uploadedUrl}`,
                  alt: fileNameWithoutExt,
                  title: fileNameWithoutExt,
                  width: '100%',
                  align: 'center'
                }
              }
            ]
          };

          const { data } = await api.post('/notes', { 
            title: fileNameWithoutExt,
            contentJson: JSON.stringify(tiptapJson)
          });
          setNotes(prev => [data, ...prev]);
          navigate(`/n/${data.id}`);
        } catch (err) {
          console.error('Image upload or note creation failed', err);
          alert('图片导入失败，请检查网络或重试。');
        } finally {
          setIsImporting(false);
        }
        return;
      } else if (fileExt === 'docx') {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          try {
            const mammoth = await loadMammoth();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            const htmlContent = result.value;
            
            const { data } = await api.post('/notes', { 
              title: fileNameWithoutExt,
              contentText: htmlContent 
            });
            setNotes(prev => [data, ...prev]);
            navigate(`/n/${data.id}`);
          } catch (err) {
            console.error('Word document parsing failed', err);
            alert('Word文档解析失败，请确保文件没有加密且格式正确。');
          } finally {
            setIsImporting(false);
          }
        };
        reader.readAsArrayBuffer(file);
        return;
      } else if (fileExt === 'pdf') {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          try {
            const htmlContent = await extractTextFromPdf(arrayBuffer);
            
            const { data } = await api.post('/notes', { 
              title: fileNameWithoutExt,
              contentText: htmlContent 
            });
            setNotes(prev => [data, ...prev]);
            navigate(`/n/${data.id}`);
          } catch (err: any) {
            console.error('PDF parsing failed', err);
            alert('PDF文档解析失败: ' + (err.message || '未知错误'));
          } finally {
            setIsImporting(false);
          }
        };
        reader.readAsArrayBuffer(file);
        return;
      } else if (['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
        // Excel / CSV: parse with SheetJS and convert to HTML table
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const XLSX = await import('xlsx');
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: fileExt === 'csv' ? 'string' : 'array' });

            // Convert each sheet to an HTML table string
            let htmlContent = '';
            let plainText = '';

            for (const sheetName of workbook.SheetNames) {
              const sheet = workbook.Sheets[sheetName];
              const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
              if (!rows.length) continue;

              htmlContent += `<h2>📊 ${sheetName}</h2>\n<table border="1" style="border-collapse:collapse;width:100%">\n`;
              rows.forEach((row, i) => {
                htmlContent += '<tr>';
                row.forEach(cell => {
                  const tag = i === 0 ? 'th' : 'td';
                  htmlContent += `<${tag} style="padding:6px 10px;border:1px solid #ccc">${String(cell ?? '').replace(/</g,'&lt;')}</${tag}>`;
                });
                htmlContent += '</tr>\n';
              });
              htmlContent += '</table>\n<p></p>\n';
              plainText += XLSX.utils.sheet_to_csv(sheet) + '\n\n';
            }

            const { data: noteData } = await api.post('/notes', {
              title: fileNameWithoutExt,
              contentText: htmlContent,
            });
            setNotes(prev => [noteData, ...prev]);
            navigate(`/n/${noteData.id}`);
          } catch (err) {
            console.error('Excel/CSV parsing failed', err);
            alert('表格文件解析失败，请确保文件格式正确。');
          } finally {
            setIsImporting(false);
          }
        };
        if (fileExt === 'csv') {
          reader.readAsText(file, 'UTF-8');
        } else {
          reader.readAsArrayBuffer(file);
        }
        return;
      } else {
        // Plain Text, Markdown, HTML files
        const reader = new FileReader();
        reader.onload = async (event) => {
          const rawContent = event.target?.result as string;
          
          try {
            // Create a new note using raw content
            const { data } = await api.post('/notes', { 
              title: fileNameWithoutExt,
              contentText: rawContent 
            });
            setNotes(prev => [data, ...prev]);
            navigate(`/n/${data.id}`);
          } catch (err) {
            console.error('File import failed', err);
            alert('文件导入失败，请重试。');
          } finally {
            setIsImporting(false);
          }
        };
        reader.readAsText(file);
      }

    } catch (err) {
      console.error('Import failed', err);
      alert('导入失败: ' + (err as Error).message);
      setIsImporting(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ 
        display: 'flex', alignItems: 'center', padding: '16px 32px', gap: '24px',
        position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'var(--bg-color)',
        backdropFilter: 'blur(8px)'
      }}>
        <button onClick={toggleSidebar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
          <Menu size={24} />
        </button>
        <div className="search-input-wrapper">
          <Search size={18} color="var(--text-tertiary)" />
          <input type="text" className="search-input" placeholder="搜索笔记" />
        </div>
        <button style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Gift size={18} color="var(--text-secondary)" />
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '0 32px 100px 32px' }}>
        
        {/* Welcome Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '24px' }}>💬</span>
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>欢迎来到Get笔记</h1>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>现在，开始你的灵感之旅吧</p>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '12px' }}>聊一聊 ›</button>
        </div>

        {/* Web Clipper */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>链接一键记 & 导入文件</h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="url" 
              placeholder="输入网页或文章链接，AI自动提取核心摘要..." 
              value={clipUrl}
              onChange={(e) => setClipUrl(e.target.value)}
              style={{ flex: 1, backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', outline: 'none' }}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleClip}
              disabled={isClipping || !clipUrl}
              style={{ borderRadius: '12px', minWidth: '100px' }}
            >
              {isClipping ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 size={16} className="spin" /> 提取中</span> : '开始提取'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0 16px', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.2s', gap: '8px' }} className="btn-hover-effect">
              {isImporting ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
              <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>导入文件</span>
              <input type="file" accept=".txt,.md,.markdown,.html,.htm,.docx,.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isImporting} />
            </label>
          </div>
        </div>

        {/* Recently Used */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>最近使用</h2>
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
            {/* Mock Card */}
            <div className="card card-hoverable" style={{ minWidth: '240px', cursor: 'pointer' }} onClick={() => notes[0] && navigate(`/n/${notes[0].id}`)}>
              <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>学习笔记</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>4088个内容 · 856003人在用</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#e2e8f0' }} />
                Get达人 创建
              </div>
            </div>
          </div>
        </div>

        {/* Note List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>笔记列表</h2>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {notes.map(note => (
              <div key={note.id} className="card card-hoverable" style={{ padding: '24px', cursor: 'pointer' }} onClick={() => navigate(`/n/${note.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{note.title || '无标题笔记'}</h3>
                  {note.audioUrl && (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e0e7ff', color: '#4f46e5', borderRadius: '50%', width: '24px', height: '24px' }}>
                      <Mic size={14} />
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {(note.contentText || '点击此处开始记录你的灵感和想法...').replace(/#{1,6}\s?/g, '').replace(/\*\*/g, '').replace(/[-*]\s/g, '').replace(/\n/g, ' ')}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {new Date(note.updatedAt).toLocaleString('zh-CN')} 更新
                  </span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                      onClick={(e) => handleDeleteNote(note.id, e)}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Floating Action Bar */}
      <div className="floating-action-bar">
        <button className="fab-btn" onClick={createNote}>
          <Plus size={20} />
          <span>更多</span>
        </button>
        <button className="fab-btn primary" onClick={createNote} style={{ backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-pill)', padding: '8px 24px' }}>
          <Mic size={18} />
          <span>录音</span>
        </button>
        <button className="fab-btn" onClick={createNote}>
          <Edit3 size={20} />
          <span>文字</span>
        </button>
      </div>

    </div>
  );
}

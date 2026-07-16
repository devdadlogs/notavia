import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, FilePlus2, Link2, Loader2, Search, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { creatorService, type Material } from '../../services/creator';

export default function MaterialsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Material[]>([]);
  const [q, setQ] = useState('');
  const [insights, setInsights] = useState<Record<string, Array<{type:string;content:string}>>>({});
  const [clipUrl, setClipUrl] = useState('');
  const [clipping, setClipping] = useState(false);
  const [message, setMessage] = useState('');
  const load = () => creatorService.listMaterials(q).then(setItems);
  useEffect(() => {
    void creatorService.listMaterials('').then(setItems);
  }, []);
  const createMaterial = async () => {
    const { data } = await api.post('/notes', { title: '新素材', contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}', contentText: '' });
    navigate(`/n/${data.id}`);
  };
  const importLink = async () => {
    const url = clipUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setMessage('请输入以 http:// 或 https:// 开头的完整网址'); return; }
    setClipping(true); setMessage('');
    try {
      const { data } = await api.post('/notes/clipper', { url });
      setClipUrl(''); setItems(current => [data, ...current]); setMessage('网页已保存到素材库');
    } catch { setMessage('抓取失败，请检查网址或网页访问权限'); }
    finally { setClipping(false); }
  };
  const extract = async (noteId:string) => { setInsights(current => ({ ...current, [noteId]: [] })); const items = await creatorService.extractInsights(noteId); setInsights(current => ({ ...current, [noteId]: items })); };
  const trashMaterial = async (item: Material) => {
    if (!window.confirm(`确定将“${item.title || '无标题素材'}”移到最近删除吗？`)) return;
    try {
      await api.delete(`/notes/${item.id}`);
      setItems(current => current.filter(material => material.id !== item.id));
      setMessage('素材已移到最近删除');
    } catch {
      setMessage('删除失败，请稍后重试');
    }
  };
  return <div className="creator-page materials-page">
    <header className="materials-header"><div><div className="creator-kicker"><span /> YOUR SOURCE ROOM</div><h1>素材库</h1><p>原文、出处和你当时的想法，都留在这里。</p></div><button className="btn btn-primary" onClick={createMaterial}><FilePlus2 size={16} /> 手写一条</button></header>
    <section className="material-import"><div className="material-import-copy"><Link2 size={22}/><div><strong>从一个链接开始</strong><span>粘贴网址，自动保存网页正文和来源</span></div></div><div className="material-import-form"><input aria-label="导入网页链接" value={clipUrl} onChange={e=>setClipUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&importLink()} placeholder="https://…"/><button onClick={importLink} disabled={clipping}>{clipping?<Loader2 className="spin" size={17}/>:<ArrowRight size={17}/>} {clipping?'读取中':'保存网页'}</button></div>{message&&<div className="material-message">{message}</div>}</section>
    <div className="materials-toolbar"><div><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="搜索标题或正文" /></div><button className="btn btn-outline" onClick={load}>搜索</button><span>{items.length} 条素材</span></div>
    {items.length===0?<div className="materials-empty"><div>还没有素材</div><p>粘贴上方的网址，或手写第一条。积累从一条真实材料开始。</p></div>:<div className="materials-grid">{items.map(item => <article key={item.id} className="material-card"><div className="material-card-top"><span className={`source-badge source-${item.sourceType||'manual'}`}>{item.sourceType==='web'?'网页':item.sourceType==='audio'?'语音':'手写'}</span><div className="material-card-tools">{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label="打开原始链接"><ExternalLink size={15}/></a>}<button type="button" onClick={() => void trashMaterial(item)} aria-label={`删除素材：${item.title || '无标题素材'}`} title="移到最近删除"><Trash2 size={15}/></button></div></div><h3>{item.title || '无标题素材'}</h3><p>{item.contentText || item.transcript || '暂无文字内容'}</p>{insights[item.id]?.map((x,i)=><div key={i} className="insight-item"><b>{x.type}</b> {x.content}</div>)}<div className="material-card-actions"><button onClick={() => navigate(`/n/${item.id}`)}>查看原文</button><button onClick={()=>extract(item.id)}>AI 提炼</button></div></article>)}</div>}
  </div>;
}

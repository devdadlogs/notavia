import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FilePlus2, Search } from 'lucide-react';
import api from '../../services/api';
import { creatorService, type Material } from '../../services/creator';

export default function MaterialsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Material[]>([]);
  const [q, setQ] = useState('');
  const [insights, setInsights] = useState<Record<string, Array<{type:string;content:string}>>>({});
  const load = () => creatorService.listMaterials(q).then(setItems);
  useEffect(() => {
    void creatorService.listMaterials('').then(setItems);
  }, []);
  const createMaterial = async () => {
    const { data } = await api.post('/notes', { title: '新素材', contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}', contentText: '' });
    navigate(`/n/${data.id}`);
  };
  const extract = async (noteId:string) => { setInsights(current => ({ ...current, [noteId]: [] })); const items = await creatorService.extractInsights(noteId); setInsights(current => ({ ...current, [noteId]: items })); };
  return <div style={{ padding: '36px 44px', maxWidth: 1200, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h1>素材库</h1><p style={{ color: 'var(--text-secondary)' }}>旧笔记、网页、语音和文章都在这里，原文和来源不会丢。</p></div><button className="btn btn-primary" onClick={createMaterial}><FilePlus2 size={16} /> 新增素材</button></div>
    <div style={{ display: 'flex', gap: 8, margin: '24px 0' }}><div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-tertiary)' }} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="按标题或正文搜索素材" style={{ width: '100%', padding: '11px 12px 11px 38px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-input)' }} /></div><button className="btn btn-outline" onClick={load}>搜索</button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>{items.map(item => <div key={item.id} className="glass-panel" style={{ padding: 18 }}><div style={{ fontSize: 12, color: '#059669', marginBottom: 8 }}>{item.sourceType || 'manual'}</div><h3 style={{ margin: '0 0 8px' }}>{item.title || '无标题素材'}</h3><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, height: 62, overflow: 'hidden' }}>{item.contentText || item.transcript || '暂无文字内容'}</p>{insights[item.id]?.map((x,i)=><div key={i} style={{fontSize:12,padding:'6px 8px',marginBottom:5,background:'var(--bg-input)',borderRadius:6}}><b style={{color:'#059669'}}>{x.type}</b> {x.content}</div>)}<div style={{ display: 'flex', gap: 8, marginTop:8 }}><button className="btn btn-outline" onClick={() => navigate(`/n/${item.id}`)}>查看原文</button><button className="btn btn-outline" onClick={()=>extract(item.id)}>AI 提炼</button>{item.sourceUrl && <a className="btn btn-outline" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}</div></div>)}</div>
  </div>;
}

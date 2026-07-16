import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, FilePlus2, Lightbulb, Link2, Loader2, PenLine, Send, Sparkles } from 'lucide-react';
import api from '../../services/api';
import { creatorService, type Material, type Topic } from '../../services/creator';

const statusLabel: Record<string, string> = { idea: '想法', preparing: '准备中', writing: '写作中', ready: '待发布', published: '已发布', archived: '归档' };

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<Material[]>([]);
  const [metrics, setMetrics] = useState({ activeDays: 0, completedWorks: 0, aiRetentionRate: 0, averageCreationMinutes: 0 });
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [clipUrl, setClipUrl] = useState('');
  const [clipping, setClipping] = useState(false);
  const [clipError, setClipError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { Promise.all([creatorService.listTopics(), creatorService.metrics(), creatorService.listMaterials()]).then(([t, m, materials]) => { setTopics(t); setMetrics(m); setRecentMaterials(materials.slice(0,4)); }).finally(()=>setLoaded(true)); }, []);
  const create = async () => {
    if (!title.trim()) return;
    const topic = await creatorService.createTopic({ title: title.trim(), status: 'idea' });
    navigate(`/topics/${topic.id}`);
  };
  const importLink = async () => {
    const url = clipUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setClipError('请输入以 http:// 或 https:// 开头的完整网址'); return; }
    setClipping(true); setClipError('');
    try {
      const { data } = await api.post('/notes/clipper', { url });
      navigate(`/n/${data.id}`);
    } catch (error: unknown) {
      const serverMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setClipError(serverMessage || '网页抓取失败，请稍后重试。');
    } finally { setClipping(false); }
  };

  const active = topics.filter(t => ['preparing', 'writing'].includes(t.status));
  const ready = topics.filter(t => t.status === 'ready');
  return <div className="creator-page">
    <header className="creator-hero">
      <div className="creator-kicker"><span /> NOTAVIA CREATOR</div>
      <h1>把见过的、想过的，<br/><em>变成你的作品。</em></h1>
      <p>收好每一条来源。写作时，Notavia 帮你把过去的积累找回来。</p>
      <div className="capture-bar">
        <div className="capture-icon"><Link2 size={21}/></div>
        <input aria-label="粘贴网页链接" value={clipUrl} onChange={e => setClipUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && importLink()} placeholder="粘贴文章、公众号或网页链接…" />
        <button onClick={importLink} disabled={clipping}>{clipping ? <Loader2 className="spin" size={18}/> : <ArrowRight size={18}/>}<span>{clipping ? '正在读取' : '导入素材'}</span></button>
      </div>
      <div className="capture-meta"><span>自动保留标题、正文和原始链接</span><button onClick={() => navigate('/materials')}><FilePlus2 size={14}/> 也可以手写、录音或导入文件</button></div>
      {clipError && <div className="capture-error">{clipError}</div>}
      <button className="hero-topic-action" onClick={() => setCreating(true)}><Lightbulb size={16}/> 我已经有选题了</button>
    </header>
    {loaded&&topics.length===0&&recentMaterials.length===0&&<section className="getting-started"><div><span>刚刚开始</span><h2>用一条真实素材，建立你的第一条创作线索。</h2><p>先收下一篇文章、一段录音或一个想讲清楚的问题。后面的检索、引用和改写都会从这里开始。</p></div><div className="getting-started-actions"><button onClick={()=>document.querySelector<HTMLInputElement>('.capture-bar input')?.focus()}><b>01</b><span><strong>导入一条素材</strong><small>粘贴文章或公众号链接</small></span><ArrowRight size={17}/></button><button onClick={()=>navigate('/materials')}><b>02</b><span><strong>手写或录音</strong><small>记下自己的经历和判断</small></span><ArrowRight size={17}/></button><button onClick={()=>setCreating(true)}><b>03</b><span><strong>创建第一个选题</strong><small>从一个明确问题开始</small></span><ArrowRight size={17}/></button></div></section>}
    {creating && <div className="glass-panel" style={{ padding: 18, display: 'flex', gap: 10, marginBottom: 24 }}><input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="这次想把什么问题讲清楚？" style={{ flex: 1, padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-input)' }}/><button className="btn btn-primary" onClick={create}>开始</button><button className="btn btn-outline" onClick={() => setCreating(false)}>取消</button></div>}
    <div className="creator-metrics">
      {[['30天使用', `${metrics.activeDays} 天`, <Sparkles/>], ['完成作品', `${metrics.completedWorks} 篇`, <BookOpen/>], ['AI内容保留', `${Math.round(metrics.aiRetentionRate * 100)}%`, <PenLine/>], ['平均耗时', metrics.averageCreationMinutes ? `${metrics.averageCreationMinutes} 分钟` : '待记录', <Send/>]].map(([label,value,icon]) => <div className="metric-item" key={String(label)}><div>{icon}</div><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <Section title="正在创作" empty="还没有正在创作的选题" topics={active} onOpen={id => navigate(`/topics/${id}`)}/>
    <Section title="待发布" empty="完成风格检查后，作品会出现在这里" topics={ready} onOpen={id => navigate(`/topics/${id}`)}/>
    <section style={{marginBottom:28}}><h2 style={{fontSize:18}}>最近加入的素材</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>{recentMaterials.map(m=><button key={m.id} onClick={()=>navigate(`/n/${m.id}`)} className="glass-panel" style={{textAlign:'left',padding:16,border:'1px solid var(--border-color)',color:'inherit',cursor:'pointer'}}><b>{m.title||'无标题素材'}</b><p style={{fontSize:12,color:'var(--text-tertiary)',height:35,overflow:'hidden'}}>{m.contentText||m.transcript||'暂无文字内容'}</p></button>)}</div></section>
    <Section title="最近选题" empty="从一个你真正想讲清楚的问题开始" topics={topics.slice(0, 8)} onOpen={id => navigate(`/topics/${id}`)}/>
  </div>;
}

function Section({ title, empty, topics, onOpen }: { title:string; empty:string; topics:Topic[]; onOpen:(id:string)=>void }) {
  return <section style={{ marginBottom: 28 }}><h2 style={{ fontSize:18 }}>{title}</h2>{topics.length === 0 ? <div style={{ padding:24, border:'1px dashed var(--border-color)', color:'var(--text-tertiary)', borderRadius:10 }}>{empty}</div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>{topics.map(t => <button key={t.id} onClick={() => onOpen(t.id)} className="glass-panel" style={{ textAlign:'left', padding:18, cursor:'pointer', border:'1px solid var(--border-color)', color:'inherit' }}><div style={{ fontWeight:650, marginBottom:10 }}>{t.title}</div><span style={{ fontSize:12, color:'#059669' }}>{statusLabel[t.status]}</span><div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:8 }}>{t.materials?.length || 0} 条素材 · {t.works?.length || 0} 个版本</div></button>)}</div>}</section>;
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FilePlus2, Lightbulb, PenLine, Send, Sparkles } from 'lucide-react';
import { creatorService, type Material, type Topic } from '../../services/creator';

const statusLabel: Record<string, string> = { idea: '想法', preparing: '准备中', writing: '写作中', ready: '待发布', published: '已发布', archived: '归档' };

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<Material[]>([]);
  const [metrics, setMetrics] = useState({ activeDays: 0, completedWorks: 0, aiRetentionRate: 0, averageCreationMinutes: 0 });
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { Promise.all([creatorService.listTopics(), creatorService.metrics(), creatorService.listMaterials()]).then(([t, m, materials]) => { setTopics(t); setMetrics(m); setRecentMaterials(materials.slice(0,4)); }); }, []);
  const create = async () => {
    if (!title.trim()) return;
    const topic = await creatorService.createTopic({ title: title.trim(), status: 'idea' });
    navigate(`/topics/${topic.id}`);
  };

  const active = topics.filter(t => ['preparing', 'writing'].includes(t.status));
  const ready = topics.filter(t => t.status === 'ready');
  return <div style={{ padding: '36px 44px', maxWidth: 1280, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 34 }}>
      <div><div style={{ color: '#059669', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>NOTAVIA CREATOR</div><h1 style={{ margin: 0, fontSize: 34 }}>把素材，变成能发布的作品</h1><p style={{ color: 'var(--text-secondary)' }}>从私人素材出发，保留来源，保持七九自己的表达。</p></div>
      <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-outline" onClick={() => navigate('/materials')}><FilePlus2 size={16}/> 新增素材</button><button className="btn btn-primary" onClick={() => setCreating(true)}><Lightbulb size={16}/> 创建选题</button></div>
    </div>
    {creating && <div className="glass-panel" style={{ padding: 18, display: 'flex', gap: 10, marginBottom: 24 }}><input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="这次想把什么问题讲清楚？" style={{ flex: 1, padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-input)' }}/><button className="btn btn-primary" onClick={create}>开始</button><button className="btn btn-outline" onClick={() => setCreating(false)}>取消</button></div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 32 }}>
      {[['30天使用', `${metrics.activeDays} 天`, <Sparkles/>], ['完成作品', `${metrics.completedWorks} 篇`, <BookOpen/>], ['AI内容保留', `${Math.round(metrics.aiRetentionRate * 100)}%`, <PenLine/>], ['平均耗时', metrics.averageCreationMinutes ? `${metrics.averageCreationMinutes} 分钟` : '待记录', <Send/>]].map(([label,value,icon]) => <div className="glass-panel" style={{ padding: 20 }} key={String(label)}><div style={{ color:'#059669' }}>{icon}</div><div style={{ fontSize: 26, fontWeight: 750, marginTop: 14 }}>{value}</div><div style={{ color:'var(--text-secondary)', fontSize:13 }}>{label}</div></div>)}
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

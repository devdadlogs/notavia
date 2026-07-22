import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, FilePlus2, Lightbulb, Link2, Loader2, PenLine, Send, Sparkles } from 'lucide-react';
import api from '../../services/api';
import { creatorService, type Material, type MaterialIdea, type Topic } from '../../services/creator';

const statusLabel: Record<string, string> = { idea: '想法', preparing: '准备中', writing: '写作中', ready: '待发布', published: '已发布', archived: '归档' };

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<Material[]>([]);
  const [ideas, setIdeas] = useState<MaterialIdea[]>([]);
  const [metrics, setMetrics] = useState({ activeDays: 0, completedWorks: 0, aiRetentionRate: 0, averageCreationMinutes: 0 });
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [clipUrl, setClipUrl] = useState('');
  const [clipping, setClipping] = useState(false);
  const [clipError, setClipError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([creatorService.listTopics(), creatorService.metrics(), creatorService.listMaterials(), creatorService.listAllIdeas(6).catch(() => [])])
      .then(([t, m, loadedMaterials, loadedIdeas]) => {
        setTopics(t);
        setMetrics(m);
        setMaterials(loadedMaterials);
        setRecentMaterials(loadedMaterials.slice(0, 4));
        setIdeas(loadedIdeas);
      })
      .finally(() => setLoaded(true));
  }, []);
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
  const inbox = materials.filter(m => (m.materialStatus || 'inbox') === 'inbox');
  const distilled = materials.filter(m => m.materialStatus === 'distilled');
  const nextAction = inbox[0]
    ? { label: '先消化一条新素材', detail: inbox[0].title || '无标题素材', onClick: () => navigate(`/n/${inbox[0].id}`) }
    : distilled[0]
      ? { label: '把素材变成你的判断', detail: distilled[0].title || '无标题素材', onClick: () => navigate(`/n/${distilled[0].id}`) }
      : active[0]
        ? { label: '继续完成一篇作品', detail: active[0].title, onClick: () => navigate(`/topics/${active[0].id}`) }
        : { label: '从一个问题开始创作', detail: '创建一个选题', onClick: () => setCreating(true) };
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
    {loaded && <section className="creator-next-action"><div><span>现在最值得做</span><strong>{nextAction.label}</strong><p>{nextAction.detail}</p></div><button onClick={nextAction.onClick}>继续 <ArrowRight size={16}/></button></section>}
    <div className="creator-metrics">
      {[['30天使用', `${metrics.activeDays} 天`, <Sparkles/>], ['完成作品', `${metrics.completedWorks} 篇`, <BookOpen/>], ['AI内容保留', `${Math.round(metrics.aiRetentionRate * 100)}%`, <PenLine/>], ['平均耗时', metrics.averageCreationMinutes > 0 ? `${metrics.averageCreationMinutes.toFixed(1)} 分钟` : '待记录', <Send/>]].map(([label,value,icon]) => <div className="metric-item" key={String(label)}><div>{icon}</div><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <section className="creator-queue-section">
      <div className="creator-section-heading"><div><span>创作队列</span><h2>每条内容都有下一步</h2></div><p>先消化，再形成判断，最后进入写作和发布。</p></div>
      <div className="creator-queue">
        <QueueLane title="待消化" hint="先确认素材值不值得留下" count={inbox.length} items={inbox.slice(0, 3).map(material => ({ title: material.title || '无标题素材', meta: '阅读并 AI 提炼', onClick: () => navigate(`/n/${material.id}`) }))} empty="没有待消化素材" />
        <QueueLane title="形成判断" hint="写下你同意、反对或追问的事" count={distilled.length} items={distilled.slice(0, 3).map(material => ({ title: material.title || '无标题素材', meta: '写下我的判断', onClick: () => navigate(`/n/${material.id}`) }))} empty="先提炼一条素材" />
        <QueueLane title="正在写作" hint="围绕明确立场完成主版本" count={active.length} items={active.slice(0, 3).map(topic => ({ title: topic.title, meta: `${topic.materials?.length || 0} 条素材 · ${topic.ideas?.length || 0} 条观点`, onClick: () => navigate(`/topics/${topic.id}`) }))} empty="还没有写作中的选题" />
        <QueueLane title="待发布" hint="核对后登记实际发布结果" count={ready.length} items={ready.slice(0, 3).map(topic => ({ title: topic.title, meta: `${topic.works?.length || 0} 个版本待发布`, onClick: () => navigate(`/topics/${topic.id}`) }))} empty="还没有待发布作品" done />
      </div>
    </section>
    <section className="creator-idea-library">
      <div className="creator-section-heading"><div><span>观点库</span><h2>你反复思考过的判断</h2></div><p>{ideas.length} 条观点卡。它们会在创建选题和生成草稿时成为你的明确立场。</p></div>
      {ideas.length ? <div className="creator-idea-grid">{ideas.slice(0, 6).map(idea => <article key={idea.id} className="creator-idea-card"><p>{idea.content}</p>{idea.sourceExcerpt && <blockquote>{idea.sourceExcerpt}</blockquote>}<footer><button onClick={() => navigate(`/n/${idea.noteId}`)}>来自《{idea.sourceTitle || '来源素材'}》 <ArrowRight size={12}/></button><span>{idea.topicLinks?.length ? `已用于 ${idea.topicLinks.length} 个选题` : '尚未用于选题'}</span></footer></article>)}</div> : <div className="creator-library-empty"><Lightbulb size={18}/><div><strong>观点库还没有内容</strong><p>打开一条素材，写下“我怎么看”，它就会成为可复用的观点卡。</p></div></div>}
    </section>
    <Section title="正在创作" empty="还没有正在创作的选题" topics={active} onOpen={id => navigate(`/topics/${id}`)}/>
    <Section title="待发布" empty="完成风格检查后，作品会出现在这里" topics={ready} onOpen={id => navigate(`/topics/${id}`)}/>
    <section style={{marginBottom:28}}><h2 style={{fontSize:18}}>最近加入的素材</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>{recentMaterials.map(m=><button key={m.id} onClick={()=>navigate(`/n/${m.id}`)} className="glass-panel" style={{textAlign:'left',padding:16,border:'1px solid var(--border-color)',color:'inherit',cursor:'pointer'}}><b>{m.title||'无标题素材'}</b><p style={{fontSize:12,color:'var(--text-tertiary)',height:35,overflow:'hidden'}}>{m.contentText||m.transcript||'暂无文字内容'}</p></button>)}</div></section>
    <Section title="最近选题" empty="从一个你真正想讲清楚的问题开始" topics={topics.slice(0, 8)} onOpen={id => navigate(`/topics/${id}`)}/>
  </div>;
}

function QueueLane({ title, hint, count, items, empty, done = false }: { title: string; hint: string; count: number; items: Array<{ title: string; meta: string; onClick: () => void }>; empty: string; done?: boolean }) {
  return <section className={`creator-queue-lane${done ? ' is-done' : ''}`}><header><div><h3>{title}</h3><p>{hint}</p></div><span>{count}</span></header>{items.length ? <div>{items.map(item => <button key={`${item.title}-${item.meta}`} onClick={item.onClick}><strong>{item.title}</strong><small>{item.meta}</small><ArrowRight size={14}/></button>)}</div> : <div className="creator-queue-empty">{done ? <CheckCircle2 size={15}/> : null}{empty}</div>}</section>;
}

function Section({ title, empty, topics, onOpen }: { title:string; empty:string; topics:Topic[]; onOpen:(id:string)=>void }) {
  return <section style={{ marginBottom: 28 }}><h2 style={{ fontSize:18 }}>{title}</h2>{topics.length === 0 ? <div style={{ padding:24, border:'1px dashed var(--border-color)', color:'var(--text-tertiary)', borderRadius:10 }}>{empty}</div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>{topics.map(t => <button key={t.id} onClick={() => onOpen(t.id)} className="glass-panel" style={{ textAlign:'left', padding:18, cursor:'pointer', border:'1px solid var(--border-color)', color:'inherit' }}><div style={{ fontWeight:650, marginBottom:10 }}>{t.title}</div><span style={{ fontSize:12, color:'#059669' }}>{statusLabel[t.status]}</span><div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:8 }}>{t.materials?.length || 0} 条素材 · {t.works?.length || 0} 个版本</div></button>)}</div>}</section>;
}

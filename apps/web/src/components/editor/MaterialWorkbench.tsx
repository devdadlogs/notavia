import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { AlertCircle, Check, ExternalLink, FilePlus2, FolderPlus, Highlighter, Loader2, Pencil, Quote, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { creatorService, type Material, type MaterialIdea, type MaterialInsight, type Topic } from '../../services/creator';
import WebSnapshot from './WebSnapshot';
import EditorToolbar from './EditorToolbar';
import AISlashCommand from './AISlashCommand';
import { BlockHoverControls } from './BlockHoverControls';

type Props = {
  note: Material;
  editor: Editor | null;
  title: string;
  onNoteChange: (patch: Partial<Material>) => void;
};

const insightLabels: Record<MaterialInsight['type'], string> = {
  summary: '一句话说明',
  relevance: '为什么值得关注',
  viewpoint: '可复用观点',
  case: '可复用案例',
  experience: '人物经历',
  fact: '关键事实',
  verify: '发布前核实',
  angle: '可写角度',
};

const statusLabels = {
  inbox: '待消化',
  distilled: '已提炼',
  used: '已用于选题',
  later: '稍后处理',
};

export default function MaterialWorkbench({ note, editor, title, onNoteChange }: Props) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<MaterialInsight[]>(note.insights || []);
  const [insightStatus, setInsightStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>(note.insights?.length ? 'ready' : 'idle');
  const [ideas, setIdeas] = useState<MaterialIdea[]>(note.ideas || []);
  const [ideaContent, setIdeaContent] = useState('');
  const [sourceExcerpt, setSourceExcerpt] = useState('');
  const [editingIdea, setEditingIdea] = useState<MaterialIdea | null>(null);
  const [ideaPickerId, setIdeaPickerId] = useState('');
  const [ideaFeedback, setIdeaFeedback] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState(title);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void creatorService.listTopics().then(setTopics).catch(() => setTopics([]));
    void creatorService.listIdeas(note.id).then(setIdeas).catch(() => setMessage('想法加载失败，请刷新页面重试。'));
  }, [note.id]);

  useEffect(() => {
    let cancelled = false;
    void creatorService.getInsightStatus(note.id).then(result => {
      if (cancelled) return;
      setInsightStatus(result.status);
      if (result.status === 'processing') setMessage('AI 正在后台阅读素材，你可以继续摘录或离开页面。');
      if (result.status === 'error') setMessage(result.error || 'AI 提炼失败，可以重试。');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [note.id]);

  useEffect(() => {
    if (insightStatus !== 'processing') return;
    const interval = window.setInterval(() => {
      void creatorService.getInsightStatus(note.id).then(result => {
        if (result.status === 'processing') return;
        setInsightStatus(result.status);
        if (result.status === 'ready') {
          const nextInsights = result.items || [];
          setInsights(nextInsights);
          onNoteChange({ insights: nextInsights, materialStatus: note.materialStatus === 'used' ? 'used' : 'distilled' });
          setMessage('素材价值已提炼，可以选择下一步。');
        } else if (result.status === 'error') {
          setMessage(result.error || 'AI 提炼失败，可以重试。');
        }
      }).catch(() => setMessage('暂时无法查询提炼进度，系统会继续在后台处理。'));
    }, 2000);
    return () => window.clearInterval(interval);
  }, [insightStatus, note.id, note.materialStatus, onNoteChange]);

  const groupedInsights = useMemo(() => {
    const groups = new Map<MaterialInsight['type'], MaterialInsight[]>();
    for (const insight of insights) groups.set(insight.type, [...(groups.get(insight.type) || []), insight]);
    return [...groups.entries()];
  }, [insights]);

  const extractInsights = async () => {
    setInsightStatus('processing');
    setMessage('AI 正在后台阅读素材，你可以继续摘录或离开页面。');
    try {
      await creatorService.extractInsights(note.id);
    } catch {
      setInsightStatus('error');
      setMessage('AI 提炼失败，请检查模型配置后重试。');
    }
  };

  const saveIdea = async () => {
    const content = ideaContent.trim();
    if (!content) { setMessage('请先写下你的想法。'); return; }
    setBusy('idea-save'); setMessage('');
    try {
      if (editingIdea) {
        const updated = await creatorService.updateIdea(note.id, editingIdea.id, { content, sourceExcerpt });
        setIdeas(current => current.map(idea => idea.id === updated.id ? updated : idea));
      } else {
        const created = await creatorService.createIdea(note.id, { content, sourceExcerpt });
        setIdeas(current => [...current, created]);
      }
      setIdeaContent(''); setSourceExcerpt(''); setEditingIdea(null);
      setMessage(editingIdea ? '想法已更新。' : '想法已保存，你可以继续添加。');
    } catch {
      setMessage('想法保存失败，请重试。');
    } finally { setBusy(''); }
  };

  const captureSelection = () => {
    const selectedText = window.getSelection()?.toString().trim();
    if (!selectedText) {
      setMessage('请先在左侧原文中选中一段文字。');
      return;
    }

    setSourceExcerpt(selectedText.slice(0, 4000));
    setMessage('原文摘录已带入，请补充你的判断。');
  };

  const startEditingIdea = (idea: MaterialIdea) => {
    setEditingIdea(idea); setIdeaContent(idea.content); setSourceExcerpt(idea.sourceExcerpt || '');
  };

  const deleteIdea = async (idea: MaterialIdea) => {
    if (!window.confirm('确定删除这条想法吗？已关联选题中的这条想法也会移除。')) return;
    setBusy(`idea-delete-${idea.id}`); setMessage('');
    try {
      await creatorService.deleteIdea(note.id, idea.id);
      setIdeas(current => current.filter(item => item.id !== idea.id));
      if (editingIdea?.id === idea.id) { setEditingIdea(null); setIdeaContent(''); setSourceExcerpt(''); }
      setMessage('想法已删除。');
    } catch { setMessage('删除失败，请重试。'); }
    finally { setBusy(''); }
  };

  const updateIdeaTopic = async (idea: MaterialIdea, topic: Topic, linked: boolean) => {
    setBusy(`idea-topic-${idea.id}`); setMessage('');
    try {
      if (linked) await creatorService.removeIdea(topic.id, idea.id);
      else await creatorService.addIdea(topic.id, idea.id);
      setIdeas(current => current.map(item => item.id === idea.id ? {
        ...item,
        topicLinks: linked
          ? (item.topicLinks || []).filter(link => link.topicId !== topic.id)
          : [...(item.topicLinks || []).filter(link => link.topicId !== topic.id), { topicId: topic.id, title: topic.title }],
      } : item));
      setIdeaFeedback(current => ({ ...current, [idea.id]: linked ? `已从《${topic.title}》移除` : `已作为观点加入《${topic.title}》` }));
    } catch {
      setIdeaFeedback(current => ({ ...current, [idea.id]: `${linked ? '移除' : '加入'}失败，请重试` }));
    } finally { setBusy(''); }
  };

  const addToTopic = async (topicId: string) => {
    if (!topicId) return;
    setBusy('topic'); setMessage('');
    try {
      await creatorService.addMaterial(topicId, note.id);
      onNoteChange({ materialStatus: 'used' });
      navigate(`/topics/${topicId}`);
    } catch { setMessage('加入选题失败，请稍后重试。'); }
    finally { setBusy(''); }
  };

  const createTopic = async () => {
    const topicTitle = newTopicTitle.trim();
    if (!topicTitle) { setMessage('请先填写选题名称。'); return; }
    setBusy('topic'); setMessage('');
    try {
      const topic = await creatorService.createTopic({ title: topicTitle, status: 'idea' });
      await creatorService.addMaterial(topic.id, note.id);
      onNoteChange({ materialStatus: 'used' });
      window.location.assign(`/topics/${topic.id}`);
    } catch { setMessage('创建选题失败，请稍后重试。'); setBusy(''); }
  };

  const markForLater = async () => {
    setBusy('later'); setMessage('');
    try {
      await api.put(`/notes/${note.id}`, { materialStatus: 'later' });
      onNoteChange({ materialStatus: 'later' });
      setMessage('已放入稍后处理，素材不会丢失。');
    } catch { setMessage('状态更新失败，请稍后重试。'); }
    finally { setBusy(''); }
  };

  const isWeb = note.sourceType === 'web' && Boolean(note.sourceHtml);
  const hasAudio = Boolean(note.audioUrl);
  const status = note.materialStatus || 'inbox';

  return <div className="material-workbench">
    <section className="material-source-pane">
      <header className="material-pane-heading">
        <div><span>原始内容</span><p>保留来源，用来阅读、核对和引用</p></div>
        {note.sourceUrl && <a href={note.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>打开原文</a>}
      </header>

      {isWeb ? <WebSnapshot html={note.sourceHtml!} sourceUrl={note.sourceUrl} /> : hasAudio ? <div className="material-transcript">
        <h3>录音转写</h3>
        {note.transcriptSummary && <div className="transcript-summary"><strong>内容摘要</strong><p>{note.transcriptSummary}</p></div>}
        {note.transcript ? <p>{note.transcript}</p> : <div className="material-pending"><Loader2 className="spin" size={20}/>正在生成录音原文…</div>}
      </div> : <div className="material-manual-editor">
        <EditorToolbar editor={editor} noteTitle={title} />
        <BlockHoverControls editor={editor} />
        <AISlashCommand editor={editor} />
        <EditorContent editor={editor} />
      </div>}
    </section>

    <aside className="material-value-pane">
      <div className="material-value-sticky">
        <div className="material-status-row"><span className={`material-status material-status-${status}`}>{statusLabels[status]}</span><small>素材进度</small></div>

        <section className="material-panel-section">
          <div className="material-section-title"><div><Sparkles size={16}/><strong>素材价值</strong></div><button onClick={extractInsights} disabled={insightStatus === 'processing'}>{insightStatus === 'processing' ? <Loader2 className="spin" size={14}/> : null}{insightStatus === 'processing' ? '后台提炼中' : insights.length ? '重新提炼' : 'AI 提炼'}</button></div>
          {groupedInsights.length ? <div className="material-insight-list">{groupedInsights.map(([type, items]) => <div key={type} className={`material-insight material-insight-${type}`}><span>{insightLabels[type]}</span>{items.map((item, index) => <p key={item.id || index}>{item.content}</p>)}</div>)}</div> : <div className="material-empty-value"><p>先让 AI 判断这条素材有什么价值。</p><small>它会提取观点、案例、事实风险和可写角度。</small></div>}
        </section>

        <section className="material-panel-section">
          <div className="material-section-title"><strong>我的想法</strong><small>{ideas.length ? `${ideas.length} 条` : '真正属于你的内容'}</small></div>
          <button className="material-capture-selection" onClick={captureSelection}><Highlighter size={14}/>摘录左侧选中文字</button>
          {sourceExcerpt && <div className="material-idea-excerpt-draft"><Quote size={13}/><span>{sourceExcerpt}</span><button onClick={() => setSourceExcerpt('')}>移除</button></div>}
          <textarea value={ideaContent} onChange={event => setIdeaContent(event.target.value)} placeholder="这条素材让我想到什么？我同意什么，又反对什么？" />
          <div className="material-note-save-row">
            <button type="button" className="material-save-note" onClick={saveIdea} disabled={busy === 'idea-save' || !ideaContent.trim()}>{busy === 'idea-save' ? <><Loader2 className="spin" size={14}/>保存中…</> : editingIdea ? '更新想法' : '添加想法'}</button>
            {editingIdea && <button className="material-idea-cancel" onClick={() => { setEditingIdea(null); setIdeaContent(''); setSourceExcerpt(''); }}>取消编辑</button>}
          </div>
          {ideas.length > 0 && <div className="material-idea-list">{ideas.map(idea => <article key={idea.id} className="material-idea-card">
            {idea.sourceExcerpt && <blockquote>{idea.sourceExcerpt}</blockquote>}
            <p>{idea.content}</p>
            {(idea.topicLinks?.length || 0) > 0 && <div className="material-idea-links"><span>已作为观点用于</span>{idea.topicLinks!.map(link => <button key={link.topicId} onClick={() => navigate(`/topics/${link.topicId}`)}>{link.title}<ExternalLink size={10}/></button>)}</div>}
            {ideaFeedback[idea.id] && <div className={`material-idea-feedback${ideaFeedback[idea.id].includes('失败') ? ' is-error' : ''}`}>{ideaFeedback[idea.id].includes('失败') ? <AlertCircle size={12}/> : <Check size={12}/>} {ideaFeedback[idea.id]}</div>}
            <footer><time>{new Date(idea.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</time><div>
              <button onClick={() => startEditingIdea(idea)} aria-label="编辑想法"><Pencil size={13}/></button>
              <button onClick={() => void deleteIdea(idea)} disabled={busy === `idea-delete-${idea.id}`} aria-label="删除想法"><Trash2 size={13}/></button>
              <button className="material-idea-use" onClick={() => { setIdeaFeedback(current => ({ ...current, [idea.id]: '' })); setIdeaPickerId(current => current === idea.id ? '' : idea.id); }}>{(idea.topicLinks?.length || 0) > 0 ? '管理选题' : '作为观点用于选题'}</button>
            </div></footer>
            {ideaPickerId === idea.id && <div className="material-idea-topic-picker"><strong>选择要采用这条观点的选题</strong><small>生成草稿时，AI 会把它当作你的明确立场。</small><div>{topics.filter(topic => topic.status !== 'archived').map(topic => {
              const linked = idea.topicLinks?.some(link => link.topicId === topic.id);
              return <button key={topic.id} className={linked ? 'is-linked' : ''} disabled={busy === `idea-topic-${idea.id}`} onClick={() => void updateIdeaTopic(idea, topic, Boolean(linked))}>{linked ? <Check size={13}/> : null}<span>{topic.title}</span><em>{linked ? '移除' : '加入'}</em></button>;
            })}{topics.filter(topic => topic.status !== 'archived').length === 0 && <p>还没有可用选题，请先在下方创建选题。</p>}</div></div>}
          </article>)}</div>}
        </section>

        <section className="material-panel-section material-next-step">
          <div className="material-section-title"><strong>下一步</strong><small>让素材进入创作</small></div>
          <label>加入已有选题</label>
          <div className="material-topic-select material-topic-select-wide"><select value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)}><option value="">选择一个选题</option>{topics.filter(topic => topic.status !== 'archived').map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select><button onClick={() => void addToTopic(selectedTopic)} disabled={!selectedTopic || busy === 'topic'}>{busy === 'topic' ? <Loader2 className="spin" size={14}/> : null}加入并打开选题</button></div>
          {showNewTopic ? <div className="material-new-topic"><input autoFocus value={newTopicTitle} onChange={event => setNewTopicTitle(event.target.value)} placeholder="选题名称"/><div><button onClick={() => setShowNewTopic(false)}>取消</button><button onClick={createTopic} disabled={busy === 'topic'}><Check size={14}/>创建并继续</button></div></div> : <button className="material-action-secondary" onClick={() => setShowNewTopic(true)}><FilePlus2 size={15}/>从这条素材创建选题</button>}
          <button className="material-action-quiet" onClick={markForLater} disabled={busy === 'later'}><FolderPlus size={15}/>暂时收好，稍后处理</button>
        </section>
        {message && <div className="material-workbench-message">{message}</div>}
      </div>
    </aside>
  </div>;
}

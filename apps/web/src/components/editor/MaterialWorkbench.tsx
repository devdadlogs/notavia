import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { ArrowRight, Check, ExternalLink, FilePlus2, FolderPlus, Highlighter, Loader2, Sparkles } from 'lucide-react';
import api from '../../services/api';
import { creatorService, type Material, type MaterialInsight, type Topic } from '../../services/creator';
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
  const shouldAutoExtract = !note.insights?.length && note.materialStatus !== 'later' && Boolean(note.contentText?.trim() || note.transcript?.trim());
  const [insights, setInsights] = useState<MaterialInsight[]>(note.insights || []);
  const [creatorNotes, setCreatorNotes] = useState(note.creatorNotes || '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState(title);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [busy, setBusy] = useState<'insights' | 'notes' | 'topic' | 'later' | ''>(shouldAutoExtract ? 'insights' : '');
  const [message, setMessage] = useState('');
  const autoExtractStarted = useRef(false);

  useEffect(() => {
    void creatorService.listTopics().then(setTopics).catch(() => setTopics([]));
  }, []);

  useEffect(() => {
    if (!shouldAutoExtract || autoExtractStarted.current) return;
    autoExtractStarted.current = true;
    void creatorService.extractInsights(note.id).then(result => {
      setInsights(result);
      onNoteChange({ insights: result, materialStatus: note.materialStatus === 'used' ? 'used' : 'distilled' });
      setMessage('素材价值已自动提炼，可以选择下一步。');
    }).catch(() => {
      setMessage('自动提炼暂时失败，可以检查模型配置后重试。');
    }).finally(() => setBusy(''));
  }, [note.id, note.materialStatus, onNoteChange, shouldAutoExtract]);

  const groupedInsights = useMemo(() => {
    const groups = new Map<MaterialInsight['type'], MaterialInsight[]>();
    for (const insight of insights) groups.set(insight.type, [...(groups.get(insight.type) || []), insight]);
    return [...groups.entries()];
  }, [insights]);

  const extractInsights = async () => {
    setBusy('insights'); setMessage('');
    try {
      const result = await creatorService.extractInsights(note.id);
      setInsights(result);
      onNoteChange({ insights: result, materialStatus: note.materialStatus === 'used' ? 'used' : 'distilled' });
      setMessage('素材价值已提炼，可以选择下一步。');
    } catch {
      setMessage('AI 提炼失败，请检查模型配置后重试。');
    } finally { setBusy(''); }
  };

  const saveCreatorNotes = async () => {
    setBusy('notes'); setMessage('');
    try {
      await api.put(`/notes/${note.id}`, { creatorNotes });
      onNoteChange({ creatorNotes });
      setMessage('你的想法已保存。');
    } catch { setMessage('保存失败，请稍后重试。'); }
    finally { setBusy(''); }
  };

  const captureSelection = () => {
    const selectedText = window.getSelection()?.toString().trim();
    if (!selectedText) {
      setMessage('请先在左侧原文中选中一段文字。');
      return;
    }

    const quote = selectedText.slice(0, 2000).replace(/\n+/g, '\n> ');
    setCreatorNotes(current => `${current.trim()}${current.trim() ? '\n\n' : ''}> ${quote}`);
    setMessage('摘录已加入下方，补充你的判断后记得保存。');
  };

  const addToTopic = async (topicId: string) => {
    if (!topicId) return;
    setBusy('topic'); setMessage('');
    try {
      await creatorService.addMaterial(topicId, note.id);
      onNoteChange({ materialStatus: 'used' });
      setMessage('已加入选题，接下来可以继续补齐观点并开始写作。');
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
          <div className="material-section-title"><div><Sparkles size={16}/><strong>素材价值</strong></div><button onClick={extractInsights} disabled={busy === 'insights'}>{busy === 'insights' ? <Loader2 className="spin" size={14}/> : null}{insights.length ? '重新提炼' : 'AI 提炼'}</button></div>
          {groupedInsights.length ? <div className="material-insight-list">{groupedInsights.map(([type, items]) => <div key={type} className={`material-insight material-insight-${type}`}><span>{insightLabels[type]}</span>{items.map((item, index) => <p key={item.id || index}>{item.content}</p>)}</div>)}</div> : <div className="material-empty-value"><p>先让 AI 判断这条素材有什么价值。</p><small>它会提取观点、案例、事实风险和可写角度。</small></div>}
        </section>

        <section className="material-panel-section">
          <div className="material-section-title"><strong>我的摘录与判断</strong><small>真正属于你的内容</small></div>
          <button className="material-capture-selection" onClick={captureSelection}><Highlighter size={14}/>摘录左侧选中文字</button>
          <textarea value={creatorNotes} onChange={event => setCreatorNotes(event.target.value)} placeholder="这条素材让我想到什么？我同意什么，又反对什么？" />
          <button className="material-save-note" onClick={saveCreatorNotes} disabled={busy === 'notes'}>{busy === 'notes' ? '保存中…' : '保存我的想法'}</button>
        </section>

        <section className="material-panel-section material-next-step">
          <div className="material-section-title"><strong>下一步</strong><small>让素材进入创作</small></div>
          <label>加入已有选题</label>
          <div className="material-topic-select"><select value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)}><option value="">选择一个选题</option>{topics.filter(topic => topic.status !== 'archived').map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select><button aria-label="加入选题" onClick={() => void addToTopic(selectedTopic)} disabled={!selectedTopic || busy === 'topic'}><ArrowRight size={16}/></button></div>
          {showNewTopic ? <div className="material-new-topic"><input autoFocus value={newTopicTitle} onChange={event => setNewTopicTitle(event.target.value)} placeholder="选题名称"/><div><button onClick={() => setShowNewTopic(false)}>取消</button><button onClick={createTopic} disabled={busy === 'topic'}><Check size={14}/>创建并继续</button></div></div> : <button className="material-action-secondary" onClick={() => setShowNewTopic(true)}><FilePlus2 size={15}/>从这条素材创建选题</button>}
          <button className="material-action-quiet" onClick={markForLater} disabled={busy === 'later'}><FolderPlus size={15}/>暂时收好，稍后处理</button>
        </section>
        {message && <div className="material-workbench-message">{message}</div>}
      </div>
    </aside>
  </div>;
}

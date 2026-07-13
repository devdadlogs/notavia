import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { creatorService } from '../../services/creator';

export default function StyleProfilePage() {
  const [profile, setProfile] = useState({ biography: '', positioning: '', rulesJson: '[]', bannedPhrasesJson: '[]' });
  const [rulesText, setRulesText] = useState('');
  const [bannedText, setBannedText] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { creatorService.getStyleProfile().then(data => { setProfile(data); try { setRulesText(JSON.parse(data.rulesJson).join('\n')); setBannedText(JSON.parse(data.bannedPhrasesJson).join('\n')); } catch { setRulesText(data.rulesJson); setBannedText(data.bannedPhrasesJson); } }); }, []);
  const encode = (value: string) => JSON.stringify(value.split('\n').map(x => x.trim()).filter(Boolean));
  const save = async () => { await creatorService.updateStyleProfile({ ...profile, rulesJson: encode(rulesText), bannedPhrasesJson: encode(bannedText) }); setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const field = { width: '100%', padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-input)', color: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.6 };
  return <div style={{ padding: '36px 44px', maxWidth: 850, margin: '0 auto' }}><h1>我的表达规则</h1><p style={{ color: 'var(--text-secondary)' }}>AI 每次创作和检查都会读取这里。只有你明确保存的规则才会生效。</p>
    <label>个人经历和身份边界</label><textarea value={profile.biography} onChange={e => setProfile({ ...profile, biography: e.target.value })} style={{ ...field, minHeight: 120, margin: '8px 0 22px' }} />
    <label>内容定位</label><textarea value={profile.positioning} onChange={e => setProfile({ ...profile, positioning: e.target.value })} style={{ ...field, minHeight: 90, margin: '8px 0 22px' }} />
    <label>长期表达规则（每行一条）</label><textarea value={rulesText} onChange={e => setRulesText(e.target.value)} style={{ ...field, minHeight: 170, margin: '8px 0 22px' }} />
    <label>禁用表达（每行一条）</label><textarea value={bannedText} onChange={e => setBannedText(e.target.value)} style={{ ...field, minHeight: 100, margin: '8px 0 22px' }} />
    <button className="btn btn-primary" onClick={save}><Save size={16} />{saved ? '已保存' : '保存表达规则'}</button>
  </div>;
}

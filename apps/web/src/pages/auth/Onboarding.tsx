import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Cloud, Server, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import '../../styles/onboarding.css';

const starterRules = ['观点明确，直接给出结论', '表达自然，避免空话和重复', '不编造个人经历', '事实和时效性结论需要来源'];

export default function Onboarding() {
  const user = useAuthStore(s => s.user), updateUser = useAuthStore(s => s.updateUser), navigate = useNavigate();
  const [step, setStep] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(user?.name || ''), [biography, setBiography] = useState(''), [positioning, setPositioning] = useState('');
  const [rules, setRules] = useState(starterRules), [banned, setBanned] = useState(''), [provider, setProvider] = useState<'ollama'|'later'>('ollama');
  const toggleRule = (rule:string) => setRules(current => current.includes(rule) ? current.filter(x => x !== rule) : [...current, rule]);
  const finish = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await api.put('/auth/me/onboarding', { name, biography, positioning, rules, bannedPhrases: banned.split('\n').map(x=>x.trim()).filter(Boolean) });
      updateUser(data.user);
      navigate('/');
    } catch { setError('保存失败，请检查服务状态后重试'); }
    finally { setSaving(false); }
  };
  const steps = ['你的创作身份','你的表达习惯','你的数据边界'];
  return <main className="onboarding-page">
    <aside className="onboarding-rail"><div className="onboarding-brand"><span>N</span>NOTAVIA</div><h1>先让这里<br/>真正属于你。</h1><p>三步建立自己的创作工作台。这里不会预先塞入任何人的经历和风格。</p><ol>{steps.map((label,i)=><li className={i===step?'active':i<step?'done':''} key={label}><i>{i<step?<Check size={13}/>:i+1}</i><span>{label}</span></li>)}</ol></aside>
    <section className="onboarding-stage">
      <div className="onboarding-step-label">STEP {step+1} / 3</div>
      {step===0&&<div className="onboarding-form"><h2>你希望以什么身份创作？</h2><p>AI 只会使用你亲自填写的身份边界，不会替你编故事。</p><label>昵称或笔名<input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：木棉"/></label><label>个人经历和身份边界<textarea value={biography} onChange={e=>setBiography(e.target.value)} placeholder="写下可以在内容中使用的真实经历。也可以暂时留空。"/></label><label>内容方向和目标读者<textarea value={positioning} onChange={e=>setPositioning(e.target.value)} placeholder="例如：给刚进入职场的工程师分享真实经验。"/></label></div>}
      {step===1&&<div className="onboarding-form"><h2>什么样的文字才像你？</h2><p>先选几条可靠的起点，以后可以随时修改。</p><div className="rule-list">{starterRules.map(rule=><button className={rules.includes(rule)?'selected':''} onClick={()=>toggleRule(rule)} key={rule}><span>{rules.includes(rule)&&<Check size={14}/>}</span>{rule}</button>)}</div><label>不希望出现的表达（每行一条）<textarea value={banned} onChange={e=>setBanned(e.target.value)} placeholder={'例如：\n众所周知\n在这个快速变化的时代'}/></label></div>}
      {step===2&&<div className="onboarding-form"><h2>内容交给谁处理，由你决定。</h2><p>默认使用本地模型。以后启用云模型时，系统会再次明确提示数据去向。</p><div className="model-choice"><button className={provider==='ollama'?'selected':''} onClick={()=>setProvider('ollama')}><Server/><strong>本地 Ollama</strong><span>素材和提示词留在当前部署环境</span></button><button className={provider==='later'?'selected':''} onClick={()=>setProvider('later')}><Cloud/><strong>以后再配置</strong><span>需要更强模型时，再自行选择服务商</span></button></div><div className="privacy-note"><Sparkles size={16}/><span>启用第三方云模型前，需要单独确认。Notavia 不会把你的内容用于训练自己的模型。</span></div></div>}
      {error&&<div className="onboarding-error">{error}</div>}
      <footer>{step>0?<button className="back" onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>上一步</button>:<span/>}{step<2?<button className="next" onClick={()=>setStep(step+1)}>继续<ArrowRight size={16}/></button>:<button className="next" disabled={saving} onClick={finish}>{saving?'正在建立工作台':'进入我的工作台'}<ArrowRight size={16}/></button>}</footer>
    </section>
  </main>;
}

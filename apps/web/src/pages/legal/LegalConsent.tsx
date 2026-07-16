import { useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { PRIVACY_VERSION, TERMS_VERSION } from './LegalPage';
import '../../styles/legal.css';

export default function LegalConsent() {
  const [accepted,setAccepted]=useState(false), [saving,setSaving]=useState(false), [error,setError]=useState('');
  const updateUser=useAuthStore(s=>s.updateUser), navigate=useNavigate();
  const confirm=async()=>{if(!accepted){setError('请先阅读并勾选确认');return}setSaving(true);try{const {data}=await api.post('/auth/me/legal-acceptance',{accepted:true,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION});updateUser(data.user);navigate(data.user.onboardingCompletedAt?'/':'/onboarding')}catch{setError('保存确认失败，请稍后重试')}finally{setSaving(false)}};
  return <main className="legal-consent-page"><section><div className="legal-consent-icon"><ShieldCheck/></div><span className="legal-consent-kicker">使用前确认</span><h1>你的内容如何被处理，应该说清楚。</h1><p>我们更新了协议，明确自托管实例、AI 数据发送、内容权利和账号注销规则。请完整阅读后再继续。</p><div className="legal-consent-links"><Link to="/legal/terms"><strong>用户协议</strong><small>服务边界、内容权利与责任</small></Link><Link to="/legal/privacy"><strong>隐私政策</strong><small>收集范围、数据去向与用户权利</small></Link></div><label><input type="checkbox" checked={accepted} onChange={e=>{setAccepted(e.target.checked);setError('')}}/><span>我已阅读并同意 2026 年 7 月 16 日版《用户协议》和《隐私政策》</span></label>{error&&<div className="onboarding-error">{error}</div>}<button disabled={saving} onClick={confirm}><CheckCircle2 size={17}/>{saving?'正在保存':'同意并继续'}</button></section></main>;
}

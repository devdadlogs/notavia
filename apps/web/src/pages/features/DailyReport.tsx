import React from 'react';
import { FileText, Sparkles, TrendingUp, Zap } from 'lucide-react';

export default function DailyReport() {
  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: '#fef3c7', color: '#b45309', borderRadius: '20px', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
          <Sparkles size={14} /> AI 自动生成
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>Get 日报</h1>
        <p style={{ color: 'var(--text-secondary)' }}>2026年5月10日 · 星期日</p>
      </header>

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* Summary Card */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Zap size={20} color="var(--accent-color)" />
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>今日洞察总结</h2>
          </div>
          <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            今天你共记录了 3 篇笔记，核心关注点集中在 **"AI 本地化部署"** 和 **"知识管理工具架构"**。你对隐私主权的表现出了高度关注，这与 NovaNote Private 的定位非常契合。
          </p>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>知识增长</div>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>+12%</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
              <TrendingUp size={12} /> 高于上周平均水平
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>专注时长</div>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>4.5h</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              主要在 10:00 - 12:30 期间
            </div>
          </div>
        </div>

        {/* Keywords */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>今日关键词</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['本地AI', 'Docker', 'SQLite', '协同编辑', '隐私保护', 'Yjs', 'Qdrant'].map(tag => (
              <span key={tag} style={{ padding: '6px 12px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', fontSize: '13px' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

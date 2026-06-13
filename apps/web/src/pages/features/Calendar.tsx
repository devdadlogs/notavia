import React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarPage() {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date();
  
  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>日历</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-panel)', padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <ChevronLeft size={18} cursor="pointer" />
          <span style={{ fontSize: '15px', fontWeight: 600 }}>2026年 5月</span>
          <ChevronRight size={18} cursor="pointer" />
        </div>
      </header>

      <div style={{ backgroundColor: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', padding: '24px', minHeight: '600px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border-color)', border: '1px solid var(--border-color)' }}>
          {days.map(day => (
            <div key={day} style={{ backgroundColor: 'var(--bg-panel)', padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              {day}
            </div>
          ))}
          {Array.from({ length: 31 }).map((_, i) => (
            <div key={i} style={{ 
              backgroundColor: 'var(--bg-panel)', minHeight: '100px', padding: '8px', 
              display: 'flex', flexDirection: 'column', gap: '4px',
              border: today.getDate() === i + 1 ? '1px solid var(--accent-color)' : 'none'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: today.getDate() === i + 1 ? 'var(--accent-color)' : 'inherit' }}>{i + 1}</span>
              {i === 9 && (
                <div style={{ fontSize: '10px', padding: '4px 8px', backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', borderRadius: '4px' }}>
                  NovaNote Private 发布
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

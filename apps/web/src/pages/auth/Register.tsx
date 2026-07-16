import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { X, CheckCircle2, Circle } from 'lucide-react';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  
  const navigate = useNavigate();
  const checkAuth = useAuthStore(state => state.checkAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError('请先阅读并同意《用户协议》和《隐私政策》');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/register', { name, email, password });
      await checkAuth(); // Refresh auth state
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败，请稍后再试。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          {/* Header */}
          <h1 style={{ fontSize: '28px', fontWeight: 600, color: '#111', marginBottom: '8px', letterSpacing: '0.5px' }}>
            账号注册
          </h1>
          <p style={{ fontSize: '13px', color: '#888', marginBottom: '32px' }}>
            已有账号？ <Link to="/auth/login" style={{ color: '#111', textDecoration: 'none', fontWeight: 500 }}>去登录</Link>
          </p>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', border: '1px solid #fee2e2' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name Input */}
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="昵称（选填）"
                style={{ 
                  width: '100%', padding: '16px 20px', backgroundColor: '#f5f6f8', 
                  border: '1px solid transparent', borderRadius: '12px', fontSize: '15px',
                  outline: 'none', color: '#111', transition: 'all 0.2s'
                }}
                onFocus={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.border = '1px solid #111'; }}
                onBlur={(e) => { e.target.style.backgroundColor = '#f5f6f8'; e.target.style.border = '1px solid transparent'; }}
              />
              {name && (
                <X 
                  size={16} 
                  color="#aaa" 
                  style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} 
                  onClick={() => setName('')}
                />
              )}
            </div>

            {/* Email Input */}
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="邮箱地址"
                style={{ 
                  width: '100%', padding: '16px 20px', backgroundColor: '#f5f6f8', 
                  border: '1px solid transparent', borderRadius: '12px', fontSize: '15px',
                  outline: 'none', color: '#111', transition: 'all 0.2s'
                }}
                onFocus={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.border = '1px solid #111'; }}
                onBlur={(e) => { e.target.style.backgroundColor = '#f5f6f8'; e.target.style.border = '1px solid transparent'; }}
              />
              {email && (
                <X 
                  size={16} 
                  color="#aaa" 
                  style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} 
                  onClick={() => setEmail('')}
                />
              )}
            </div>
            
            {/* Password Input */}
            <div style={{ marginBottom: '24px', position: 'relative' }}>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="设置密码（至少6位）"
                style={{ 
                  width: '100%', padding: '16px 20px', backgroundColor: '#f5f6f8', 
                  border: '1px solid transparent', borderRadius: '12px', fontSize: '15px',
                  outline: 'none', color: '#111', transition: 'all 0.2s'
                }}
                onFocus={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.border = '1px solid #111'; }}
                onBlur={(e) => { e.target.style.backgroundColor = '#f5f6f8'; e.target.style.border = '1px solid transparent'; }}
              />
              {password && (
                <X 
                  size={16} 
                  color="#aaa" 
                  style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} 
                  onClick={() => setPassword('')}
                />
              )}
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              style={{ 
                width: '100%', padding: '16px', backgroundColor: '#111', 
                color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 500,
                cursor: isLoading ? 'wait' : 'pointer', transition: 'background 0.2s',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? '注册中...' : '注册'}
            </button>

            {/* Agreement */}
            <div 
              onClick={() => { setAgreed(!agreed); if(error) setError(''); }}
              style={{ display: 'flex', alignItems: 'center', marginTop: '16px', cursor: 'pointer', userSelect: 'none' }}
            >
              {agreed ? (
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={12} color="#fff" />
                </div>
              ) : (
                <Circle size={14} color="#ccc" />
              )}
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                我已阅读并同意 <span style={{ color: '#444' }}>《用户协议》</span> 和 <span style={{ color: '#444' }}>《隐私政策》</span>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

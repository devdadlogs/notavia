import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { X } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const checkAuth = useAuthStore(state => state.checkAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/login', { email, password });
      await checkAuth(); // Refresh auth state
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请检查账号和密码。');
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
            账号密码登录
          </h1>
          <p style={{ fontSize: '13px', color: '#888', marginBottom: '32px' }}>
            还没账号？ <Link to="/auth/register" style={{ color: '#111', textDecoration: 'none', fontWeight: 500 }}>立即注册</Link>
          </p>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', border: '1px solid #fee2e2' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
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
                placeholder="登录密码"
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
              {isLoading ? '登录中...' : '登录'}
            </button>

            <p style={{fontSize:12,color:'#999',lineHeight:1.7,marginTop:16}}>登录即表示你将按照已接受的 <Link to="/legal/terms" target="_blank">《用户协议》</Link> 使用本实例。隐私处理方式见 <Link to="/legal/privacy" target="_blank">《隐私政策》</Link>。</p>
          </form>
        </div>
      </div>

    </div>
  );
}

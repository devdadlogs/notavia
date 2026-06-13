import React, { useState, useEffect } from 'react';
import { X, Save, Server, Cloud, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'moonshot', name: 'Kimi (月之暗面)', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'qwen', name: '通义千问 (阿里云)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-air', 'glm-4-flash'] },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-3.5-turbo', 'gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini'] },
  { id: 'custom', name: '自定义配置...', baseUrl: '', models: [] }
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [llmProvider, setLlmProvider] = useState('ollama');
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [selectedProviderId, setSelectedProviderId] = useState('custom');

  useEffect(() => {
    if (isOpen && user) {
      setLlmProvider(user.llmProvider || 'ollama');
      
      const savedBaseUrl = user.openAiBaseUrl || '';
      setOpenAiBaseUrl(savedBaseUrl);
      setOpenAiKey(user.openAiKey || '');
      setOpenAiModel(user.openAiModel || '');

      // Try to auto-match provider based on saved URL
      if (savedBaseUrl) {
        const matched = PROVIDERS.find(p => p.baseUrl === savedBaseUrl && p.id !== 'custom');
        if (matched) {
          setSelectedProviderId(matched.id);
        } else {
          setSelectedProviderId('custom');
        }
      }
    }
  }, [isOpen, user]);

  const handleProviderSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedProviderId(id);
    const provider = PROVIDERS.find(p => p.id === id);
    if (provider && provider.id !== 'custom') {
      setOpenAiBaseUrl(provider.baseUrl);
      setOpenAiModel(provider.models[0] || '');
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await api.put('/auth/me/llm-config', {
        llmProvider,
        openAiBaseUrl,
        openAiKey,
        openAiModel,
      });
      updateUser({
        llmProvider,
        openAiBaseUrl,
        openAiKey,
        openAiModel,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save settings', err);
      alert('保存设置失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-panel)', borderRadius: '12px',
        width: '100%', maxWidth: '500px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>全局设置</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '70vh' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: 'var(--text-primary)' }}>AI 模型配置</h3>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div 
              onClick={() => setLlmProvider('ollama')}
              style={{
                flex: 1, padding: '16px', borderRadius: '8px', cursor: 'pointer',
                border: llmProvider === 'ollama' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                backgroundColor: llmProvider === 'ollama' ? 'var(--accent-light)' : 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
              }}
            >
              <Server size={24} color={llmProvider === 'ollama' ? 'var(--accent-color)' : 'var(--text-secondary)'} />
              <div style={{ fontWeight: 600, color: llmProvider === 'ollama' ? 'var(--accent-color)' : 'var(--text-primary)' }}>本地私有大模型</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>数据不出网<br/>免费无限使用</div>
            </div>
            
            <div 
              onClick={() => setLlmProvider('openai')}
              style={{
                flex: 1, padding: '16px', borderRadius: '8px', cursor: 'pointer',
                border: llmProvider === 'openai' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                backgroundColor: llmProvider === 'openai' ? 'var(--accent-light)' : 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
              }}
            >
              <Cloud size={24} color={llmProvider === 'openai' ? 'var(--accent-color)' : 'var(--text-secondary)'} />
              <div style={{ fontWeight: 600, color: llmProvider === 'openai' ? 'var(--accent-color)' : 'var(--text-primary)' }}>第三方云端大模型</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>支持 DeepSeek、Kimi<br/>千问、Claude 等</div>
            </div>
          </div>

          {llmProvider === 'openai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  选择服务商
                </label>
                <select 
                  value={selectedProviderId}
                  onChange={handleProviderSelect}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none', cursor: 'pointer' }}
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  API Key
                </label>
                <input 
                  type="password" 
                  value={openAiKey} 
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  placeholder="sk-..."
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none' }}
                />
              </div>

              {selectedProviderId !== 'custom' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    选择模型 (Model Name)
                  </label>
                  <select 
                    value={openAiModel}
                    onChange={(e) => setOpenAiModel(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none', cursor: 'pointer' }}
                  >
                    {PROVIDERS.find(p => p.id === selectedProviderId)?.models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      接口地址 (Base URL)
                    </label>
                    <input 
                      type="text" 
                      value={openAiBaseUrl} 
                      onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                      placeholder="例如: https://api.deepseek.com/v1"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      自定义模型名称 (Model Name)
                    </label>
                    <input 
                      type="text" 
                      value={openAiModel} 
                      onChange={(e) => setOpenAiModel(e.target.value)}
                      placeholder="例如: deepseek-chat"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', outline: 'none' }}
                    />
                  </div>
                </>
              )}
              
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ExternalLink size={12} />
                请前往对应厂商官网申请 API Key
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: 'var(--bg-input)'
        }}>
          <button onClick={onClose} className="btn btn-outline">
            取消
          </button>
          <button onClick={handleSave} disabled={isSaving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={16} />
            {isSaving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { X, Save, Server, Cloud, ExternalLink, Trash2 } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";
import { errorMessage } from "../../utils/errors";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
  {
    id: "moonshot",
    name: "Kimi (月之暗面)",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    id: "qwen",
    name: "通义千问 (阿里云)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-turbo", "qwen-plus", "qwen-max"],
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4", "glm-4-air", "glm-4-flash"],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-3.5-turbo", "gpt-4o", "gpt-4-turbo", "gpt-4o-mini"],
  },
  { id: "custom", name: "自定义配置...", baseUrl: "", models: [] },
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);

  const [llmProvider, setLlmProvider] = useState("ollama");
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [clearOpenAiKey, setClearOpenAiKey] = useState(false);
  const [openAiModel, setOpenAiModel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  const [selectedProviderId, setSelectedProviderId] = useState("custom");
  const [cloudConsent, setCloudConsent] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      const savedBaseUrl = user.openAiBaseUrl || "";
      const matched = PROVIDERS.find(
        (provider) =>
          provider.baseUrl === savedBaseUrl && provider.id !== "custom",
      );

      setLlmProvider(user.llmProvider || "ollama");
      setOpenAiBaseUrl(savedBaseUrl);
      setOpenAiKey("");
      setClearOpenAiKey(false);
      setOpenAiModel(user.openAiModel || "");
      setCloudConsent(Boolean(user.cloudAiConsentAt));
      setSelectedProviderId(matched?.id || "custom");
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  const handleProviderSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedProviderId(id);
    const provider = PROVIDERS.find((p) => p.id === id);
    if (provider && provider.id !== "custom") {
      setOpenAiBaseUrl(provider.baseUrl);
      setOpenAiModel(provider.models[0] || "");
    }
  };

  const handleReindex = async () => {
    if (
      !confirm(
        "重建知识库索引可能需要几分钟时间，期间请勿关闭页面。确定要开始吗？",
      )
    )
      return;

    setIsReindexing(true);
    try {
      const response = await api.post("/notes/reindex");
      alert(`✅ 索引重建完成！成功处理了 ${response.data.count || 0} 篇笔记。`);
    } catch (error) {
      console.error("Failed to reindex", error);
      alert("触发重建索引失败，请检查网络或后端状态。");
    } finally {
      setIsReindexing(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    if (llmProvider === "openai" && !cloudConsent) {
      alert("请先确认云模型的数据发送说明");
      return;
    }
    try {
      setIsSaving(true);
      const response = await api.put("/auth/me/llm-config", {
        llmProvider,
        openAiBaseUrl,
        ...(openAiKey ? { openAiKey } : {}),
        clearOpenAiKey,
        openAiModel,
        cloudAiConsent: cloudConsent,
      });
      if (response.data && response.data.user) {
        updateUser(response.data.user);
      } else {
        updateUser({
          llmProvider,
          openAiBaseUrl,
          openAiKeyConfigured: openAiKey ? true : user?.openAiKeyConfigured,
          openAiModel,
        });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save settings", err);
      alert("保存设置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const password = window.prompt(
      "注销会永久删除账号及全部内容。请先导出数据，然后输入当前密码确认：",
    );
    if (!password) return;
    if (!window.confirm("最后确认：注销后无法恢复，确定继续吗？")) return;
    try {
      await api.delete("/auth/me", { data: { password } });
      await logout();
      window.location.href = "/auth/register";
    } catch (error: unknown) {
      alert(errorMessage(error, "注销账号失败"));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-panel)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "500px",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            全局设置
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", overflowY: "auto", maxHeight: "70vh" }}>
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "15px",
              color: "var(--text-primary)",
            }}
          >
            AI 模型配置
          </h3>

          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <div
              onClick={() => setLlmProvider("ollama")}
              style={{
                flex: 1,
                padding: "16px",
                borderRadius: "8px",
                cursor: "pointer",
                border:
                  llmProvider === "ollama"
                    ? "2px solid var(--accent-color)"
                    : "1px solid var(--border-color)",
                backgroundColor:
                  llmProvider === "ollama"
                    ? "var(--accent-light)"
                    : "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Server
                size={24}
                color={
                  llmProvider === "ollama"
                    ? "var(--accent-color)"
                    : "var(--text-secondary)"
                }
              />
              <div
                style={{
                  fontWeight: 600,
                  color:
                    llmProvider === "ollama"
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                }}
              >
                本地私有大模型
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                }}
              >
                数据不出网
                <br />
                免费无限使用
              </div>
            </div>

            <div
              onClick={() => setLlmProvider("openai")}
              style={{
                flex: 1,
                padding: "16px",
                borderRadius: "8px",
                cursor: "pointer",
                border:
                  llmProvider === "openai"
                    ? "2px solid var(--accent-color)"
                    : "1px solid var(--border-color)",
                backgroundColor:
                  llmProvider === "openai"
                    ? "var(--accent-light)"
                    : "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Cloud
                size={24}
                color={
                  llmProvider === "openai"
                    ? "var(--accent-color)"
                    : "var(--text-secondary)"
                }
              />
              <div
                style={{
                  fontWeight: 600,
                  color:
                    llmProvider === "openai"
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                }}
              >
                第三方云端大模型
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                }}
              >
                支持 DeepSeek、Kimi
                <br />
                千问、Claude 等
              </div>
            </div>
          </div>

          {llmProvider === "openai" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "16px",
                backgroundColor: "var(--bg-input)",
                borderRadius: "8px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  选择服务商
                </label>
                <select
                  value={selectedProviderId}
                  onChange={handleProviderSelect}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-panel)",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  API Key
                </label>
                <input
                  type="password"
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  placeholder={
                    user?.openAiKeyConfigured
                      ? "已安全保存；留空表示不修改"
                      : "sk-..."
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-panel)",
                    outline: "none",
                  }}
                />
                {user?.openAiKeyConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearOpenAiKey(!clearOpenAiKey);
                      setOpenAiKey("");
                    }}
                    style={{
                      marginTop: "8px",
                      border: 0,
                      background: "none",
                      color: clearOpenAiKey
                        ? "#dc2626"
                        : "var(--text-secondary)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "12px",
                    }}
                  >
                    {clearOpenAiKey
                      ? "保存后将删除已存密钥（点击撤销）"
                      : "删除已保存的密钥"}
                  </button>
                )}
              </div>

              {selectedProviderId !== "custom" ? (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    选择模型 (Model Name)
                  </label>
                  <select
                    value={openAiModel}
                    onChange={(e) => setOpenAiModel(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-panel)",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    {PROVIDERS.find(
                      (p) => p.id === selectedProviderId,
                    )?.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      接口地址 (Base URL)
                    </label>
                    <input
                      type="text"
                      value={openAiBaseUrl}
                      onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                      placeholder="例如: https://api.deepseek.com/v1"
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--bg-panel)",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      自定义模型名称 (Model Name)
                    </label>
                    <input
                      type="text"
                      value={openAiModel}
                      onChange={(e) => setOpenAiModel(e.target.value)}
                      placeholder="例如: deepseek-chat"
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--bg-panel)",
                        outline: "none",
                      }}
                    />
                  </div>
                </>
              )}

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ExternalLink size={12} />
                请前往对应厂商官网申请 API Key
              </div>
              <label
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-start",
                  padding: "12px",
                  border: "1px solid #f1c88d",
                  borderRadius: 8,
                  background: "#fff8ec",
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#765322",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(e) => setCloudConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  我确认：发起 AI
                  操作时，所选素材、提示词和作品片段会发送到上方配置的第三方服务商，并受该服务商条款约束。
                </span>
              </label>
            </div>
          )}

          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "var(--bg-input)",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
            }}
          >
            <h4
              style={{
                margin: "0 0 8px 0",
                fontSize: "14px",
                color: "var(--text-primary)",
              }}
            >
              知识库维护
            </h4>
            <p
              style={{
                margin: "0 0 12px 0",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              如果您发现全局知识库搜索不到某些旧笔记，可能是因为它们还没有被存入向量数据库中。您可以点击下方按钮，对所有笔记进行重新向量化索引（这可能需要一些时间，由笔记数量决定）。
            </p>
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              className="btn btn-outline"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Save size={16} />
              {isReindexing ? "正在重建索引..." : "重建全部知识库索引"}
            </button>
          </div>
          <div
            style={{
              marginTop: 24,
              padding: 16,
              border: "1px solid #fecaca",
              borderRadius: 8,
              background: "#fffafa",
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#991b1b" }}>
              账号与数据
            </h4>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 12,
                color: "#7f1d1d",
                lineHeight: 1.6,
              }}
            >
              注销会永久删除素材、选题、作品、表达规则和发布记录。请先使用侧边栏的“完整导出”。
            </p>
            <button
              className="btn btn-outline"
              onClick={handleDeleteAccount}
              style={{
                width: "100%",
                justifyContent: "center",
                color: "#b91c1c",
                borderColor: "#fecaca",
              }}
            >
              <Trash2 size={15} />
              注销账号并删除数据
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            backgroundColor: "var(--bg-input)",
          }}
        >
          <button onClick={onClose} className="btn btn-outline">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Save size={16} />
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}

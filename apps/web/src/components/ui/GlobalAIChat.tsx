import React, { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2, BookOpen } from "lucide-react";

interface GlobalAIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function GlobalAIChat({ isOpen, onClose }: GlobalAIChatProps) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMsg = query.trim();
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const API_URL =
        import.meta.env.VITE_API_URL || "http://localhost:3001/api";
      const response = await fetch(`${API_URL}/ai/chat-with-notes`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: userMsg }),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data:")) {
              let data = line.slice(5);
              if (data.startsWith(" ")) data = data.slice(1);

              if (data === "[DONE]") break;

              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                newMessages[lastIdx] = {
                  ...newMessages[lastIdx],
                  content: newMessages[lastIdx].content + data,
                };
                return newMessages;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to chat:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "❌ 抱歉，AI 处理失败。请检查网络或设置。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          zIndex: 9999,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Chat Panel */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          maxWidth: "90vw",
          height: "700px",
          maxHeight: "90vh",
          backgroundColor: "var(--bg-panel)",
          borderRadius: "16px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background:
              "linear-gradient(to right, var(--bg-panel), var(--bg-panel-hover))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                全局知识库检索
              </h3>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginTop: "2px",
                }}
              >
                基于 Qdrant 向量引擎与大语言模型
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              padding: "8px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="hover-bg-input"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                gap: "16px",
              }}
            >
              <Bot size={48} opacity={0.5} />
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "16px",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  我是你的私人知识库管家
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    maxWidth: "300px",
                    lineHeight: 1.5,
                  }}
                >
                  你可以问我任何关于你记过的笔记的内容，我会帮你从浩如烟海的知识库中找到答案并进行总结。
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "12px",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor:
                      msg.role === "user" ? "#3b82f6" : "#10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                  }}
                >
                  {msg.role === "user" ? <User size={18} /> : <Bot size={18} />}
                </div>
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    backgroundColor:
                      msg.role === "user" ? "#3b82f6" : "var(--bg-input)",
                    color:
                      msg.role === "user" ? "white" : "var(--text-primary)",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    borderTopRightRadius: msg.role === "user" ? "4px" : "12px",
                    borderTopLeftRadius:
                      msg.role === "assistant" ? "4px" : "12px",
                  }}
                >
                  {msg.role === "user"
                    ? msg.content
                    : msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                        if (
                          part.startsWith("**") &&
                          part.endsWith("**") &&
                          part.length >= 4
                        ) {
                          return (
                            <strong key={i} style={{ fontWeight: 600 }}>
                              {part.slice(2, -2)}
                            </strong>
                          );
                        }
                        return <span key={i}>{part}</span>;
                      })}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div style={{ display: "flex", gap: "12px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  backgroundColor: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                <Loader2 size={18} className="animate-spin" />
              </div>
              <div
                style={{
                  padding: "12px",
                  color: "var(--text-tertiary)",
                  fontSize: "14px",
                }}
              >
                正在检索知识库并思考...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div
          style={{
            padding: "20px",
            borderTop: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          <form onSubmit={handleSubmit} style={{ position: "relative" }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="向知识库提问... (例如：我上个月总结的运营技巧有哪些？)"
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "16px 50px 16px 20px",
                borderRadius: "24px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: "15px",
                outline: "none",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor:
                  query.trim() && !isLoading
                    ? "#10b981"
                    : "var(--border-color)",
                border: "none",
                cursor: query.trim() && !isLoading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                transition: "background-color 0.2s",
              }}
            >
              <Send size={16} style={{ marginLeft: "-2px" }} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

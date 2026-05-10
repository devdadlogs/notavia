package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/notavia/server/internal/config"
)

// OllamaService handles communication with the local Ollama instance.
type OllamaService struct {
	baseURL string
	model   string
}

// OllamaGenerateRequest is the request body for Ollama /api/generate.
type OllamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// OllamaGenerateResponse is the response body from Ollama /api/generate.
type OllamaGenerateResponse struct {
	Model    string `json:"model"`
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// OllamaModelInfo represents a model entry from Ollama /api/tags.
type OllamaModelInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

type OllamaTagsResponse struct {
	Models []OllamaModelInfo `json:"models"`
}

func NewOllamaService() *OllamaService {
	model := "qwen2.5:1.5b" // Lightweight default, runs well on CPU
	return &OllamaService{
		baseURL: config.AppConfig.OllamaURL,
		model:   model,
	}
}

// CheckHealth checks if Ollama is reachable.
func (s *OllamaService) CheckHealth() (bool, error) {
	resp, err := http.Get(s.baseURL + "/api/tags")
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200, nil
}

// ListModels returns available models from Ollama.
func (s *OllamaService) ListModels() ([]OllamaModelInfo, error) {
	resp, err := http.Get(s.baseURL + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Models, nil
}

// EnsureModel pulls the default model if it's not already available.
func (s *OllamaService) EnsureModel() error {
	models, err := s.ListModels()
	if err != nil {
		return fmt.Errorf("ollama not reachable: %w", err)
	}

	for _, m := range models {
		if strings.HasPrefix(m.Name, strings.Split(s.model, ":")[0]) {
			fmt.Printf("✅ AI model '%s' already available\n", m.Name)
			return nil
		}
	}

	fmt.Printf("⏳ Pulling AI model '%s' (this may take a few minutes on first run)...\n", s.model)
	return s.pullModel(s.model)
}

func (s *OllamaService) pullModel(name string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"name":   name,
		"stream": false,
	})
	resp, err := http.Post(s.baseURL+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to pull model: %s", string(b))
	}
	fmt.Printf("✅ AI model '%s' pulled successfully\n", name)
	return nil
}

// Generate sends a prompt to Ollama and returns the full response (non-streaming).
func (s *OllamaService) Generate(prompt string) (string, error) {
	reqBody := OllamaGenerateRequest{
		Model:  s.model,
		Prompt: prompt,
		Stream: false,
		Options: map[string]interface{}{
			"temperature":   0.7,
			"num_predict":   1024,
		},
	}

	body, _ := json.Marshal(reqBody)
	resp, err := http.Post(s.baseURL+"/api/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama error (status %d): %s", resp.StatusCode, string(b))
	}

	var result OllamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return strings.TrimSpace(result.Response), nil
}

// Summarize generates a summary for the given note content.
func (s *OllamaService) Summarize(content string, mode string) (string, error) {
	var prompt string
	switch mode {
	case "brief":
		prompt = fmt.Sprintf(`请用三句话简洁地总结以下笔记内容。只输出总结，不要添加任何前缀或解释。

笔记内容：
%s`, content)
	default: // "detailed"
		prompt = fmt.Sprintf(`请详细总结以下笔记内容，包含核心要点和关键信息。使用清晰的结构化格式。只输出总结。

笔记内容：
%s`, content)
	}
	return s.Generate(prompt)
}

// ExtractKeyPoints extracts key points, action items, and decisions from the note.
func (s *OllamaService) ExtractKeyPoints(content string) (string, error) {
	prompt := fmt.Sprintf(`从以下笔记内容中提取关键信息，按以下分类输出：

1. **核心观点**：主要论点和结论
2. **待办事项**：需要跟进的行动项
3. **关键数据**：重要的数字和指标
4. **决策项**：已做出或需要做出的决策

如果某个分类没有内容，则跳过。直接输出结果，不要添加前缀。

笔记内容：
%s`, content)
	return s.Generate(prompt)
}

// ContinueWriting continues writing from the given context.
func (s *OllamaService) ContinueWriting(content string) (string, error) {
	prompt := fmt.Sprintf(`请根据以下笔记内容的上下文和风格，自然地续写一到两段内容。直接输出续写内容，不要重复已有内容。

已有内容：
%s

续写：`, content)
	return s.Generate(prompt)
}

// Rewrite rewrites the content in the specified style.
func (s *OllamaService) Rewrite(content string, style string) (string, error) {
	var styleDesc string
	switch style {
	case "formal":
		styleDesc = "正式、专业的风格"
	case "casual":
		styleDesc = "轻松、口语化的风格"
	case "concise":
		styleDesc = "简洁、精炼的风格，去除冗余"
	default:
		styleDesc = "更清晰、更流畅的风格"
	}

	prompt := fmt.Sprintf(`请将以下内容改写为%s。保留核心含义，只输出改写后的内容。

原文：
%s`, styleDesc, content)
	return s.Generate(prompt)
}

// SuggestTags suggests tags for the given note content.
func (s *OllamaService) SuggestTags(content string) (string, error) {
	prompt := fmt.Sprintf(`根据以下笔记内容，推荐 3-5 个简短的分类标签。每个标签用逗号分隔，不要添加序号或其他格式。

笔记内容：
%s

推荐标签：`, content)
	return s.Generate(prompt)
}

// OllamaEmbedRequest is the request body for Ollama /api/embed.
type OllamaEmbedRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

// OllamaEmbedResponse is the response body from Ollama /api/embed.
type OllamaEmbedResponse struct {
	Model      string      `json:"model"`
	Embeddings [][]float32 `json:"embeddings"`
}

// Embed generates an embedding vector for the given text using the nomic-embed-text model.
func (s *OllamaService) Embed(text string) ([]float32, error) {
	reqBody := OllamaEmbedRequest{
		Model: "nomic-embed-text",
		Input: text,
	}

	body, _ := json.Marshal(reqBody)
	resp, err := http.Post(s.baseURL+"/api/embed", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("ollama embed request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama embed error (status %d): %s", resp.StatusCode, string(b))
	}

	var result OllamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("no embeddings returned")
	}

	return result.Embeddings[0], nil
}

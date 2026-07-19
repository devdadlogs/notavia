package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/notavia/server/internal/config"
)

// OllamaService handles communication with the local Ollama instance.
type OllamaService struct {
	baseURL string
	model   string
}

var ollamaInferenceClient = &http.Client{Timeout: 90 * time.Second}

// OllamaGenerateRequest is the request body for Ollama /api/generate.
type OllamaGenerateRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Stream  bool                   `json:"stream"`
	Format  string                 `json:"format,omitempty"`
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
	model := config.AppConfig.OllamaModel
	if model == "" {
		model = "qwen2.5:1.5b"
	}
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
func (s *OllamaService) ListModels() ([]string, error) {
	resp, err := http.Get(s.baseURL + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	names := make([]string, len(result.Models))
	for i, m := range result.Models {
		names[i] = m.Name
	}
	return names, nil
}

// EnsureModel pulls the default model if it's not already available.
func (s *OllamaService) EnsureModel() error {
	models, err := s.ListModels()
	if err != nil {
		return fmt.Errorf("ollama not reachable: %w", err)
	}

	if configuredModelAvailable(models, s.model) {
		fmt.Printf("✅ AI model '%s' already available\n", s.model)
		return nil
	}

	fmt.Printf("⏳ Pulling AI model '%s' (this may take a few minutes on first run)...\n", s.model)
	return s.pullModel(s.model)
}

func configuredModelAvailable(models []string, configured string) bool {
	for _, name := range models {
		if name == configured {
			return true
		}
	}
	return false
}

func (s *OllamaService) responseError(statusCode int, body []byte) error {
	detail := strings.TrimSpace(string(body))
	if statusCode == http.StatusNotFound && strings.Contains(strings.ToLower(detail), "model") {
		return fmt.Errorf("本地模型 %s 尚未安装。请运行 docker compose exec ollama ollama pull %s，完成后重试", s.model, s.model)
	}
	return fmt.Errorf("ollama error (status %d): %s", statusCode, detail)
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
			"temperature": 0.7,
			"num_predict": 1024,
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
		return "", s.responseError(resp.StatusCode, b)
	}

	var result OllamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return strings.TrimSpace(result.Response), nil
}

// GenerateJSON sends a prompt and enforces JSON output formatting.
func (s *OllamaService) GenerateJSON(prompt string) (string, error) {
	reqBody := OllamaGenerateRequest{
		Model:  s.model,
		Prompt: prompt,
		Stream: false,
		Format: "json", // Enforces strict JSON output
		Options: map[string]interface{}{
			"temperature": 0.3, // Lower temperature for more predictable structured output
			"num_predict": 2048,
		},
	}

	body, _ := json.Marshal(reqBody)
	resp, err := ollamaInferenceClient.Post(s.baseURL+"/api/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("ollama JSON request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", s.responseError(resp.StatusCode, b)
	}

	var result OllamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return strings.TrimSpace(result.Response), nil
}

// GenerateStream sends a prompt to Ollama and streams the response back via a channel.
func (s *OllamaService) GenerateStream(prompt string, outChan chan<- string, errChan chan<- error) {
	defer close(outChan)

	reqBody := OllamaGenerateRequest{
		Model:  s.model,
		Prompt: prompt,
		Stream: true,
		Options: map[string]interface{}{
			"temperature": 0.7,
			"num_predict": 1024,
		},
	}

	body, _ := json.Marshal(reqBody)
	resp, err := http.Post(s.baseURL+"/api/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		errChan <- fmt.Errorf("ollama request failed: %w", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		errChan <- s.responseError(resp.StatusCode, b)
		return
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var chunk OllamaGenerateResponse
		if err := decoder.Decode(&chunk); err != nil {
			if err == io.EOF {
				break
			}
			errChan <- err
			return
		}

		if chunk.Response != "" {
			outChan <- chunk.Response
		}

		if chunk.Done {
			break
		}
	}
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

func (s *OllamaService) TranscribeAudio(filePath string) (string, error) {
	return "", fmt.Errorf("audio transcription is not supported by Ollama")
}

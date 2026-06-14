package services

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// OpenAIProvider implements the LLMProvider interface for OpenAI-compatible APIs (e.g., GPT-4o, DeepSeek, GLM, Claude via proxies).
type OpenAIProvider struct {
	baseURL string
	apiKey  string
	model   string
}

func NewOpenAIProvider(baseURL, apiKey, model string) *OpenAIProvider {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	
	// Clean up apiKey
	apiKey = strings.TrimSpace(apiKey)
	apiKey = strings.TrimPrefix(apiKey, "Bearer ")
	apiKey = strings.TrimPrefix(apiKey, "bearer ")
	return &OpenAIProvider{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
	}
}

func (p *OpenAIProvider) CheckHealth() (bool, error) {
	// A simple models fetch can serve as a health check
	req, _ := http.NewRequest("GET", p.baseURL+"/models", nil)
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200, nil
}

func (p *OpenAIProvider) ListModels() ([]string, error) {
	req, _ := http.NewRequest("GET", p.baseURL+"/models", nil)
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var models []string
	for _, m := range result.Data {
		models = append(models, m.ID)
	}
	return models, nil
}

func (p *OpenAIProvider) Generate(prompt string) (string, error) {
	payload := map[string]interface{}{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream":      false,
		"temperature": 0.7,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		maskedKey := p.apiKey
		if len(maskedKey) > 8 {
			maskedKey = maskedKey[:4] + "..." + maskedKey[len(maskedKey)-4:]
		}
		return "", fmt.Errorf("openai error (status %d) url: %s, key: %s", resp.StatusCode, p.baseURL, maskedKey)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", nil
}

func (p *OpenAIProvider) GenerateJSON(prompt string) (string, error) {
	payload := map[string]interface{}{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream":      false,
		"temperature": 0.3,
		"response_format": map[string]string{
			"type": "json_object",
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai json request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		maskedKey := p.apiKey
		if len(maskedKey) > 8 {
			maskedKey = maskedKey[:4] + "..." + maskedKey[len(maskedKey)-4:]
		}
		return "", fmt.Errorf("openai error (status %d) url: %s, key: %s: %s", resp.StatusCode, p.baseURL, maskedKey, string(b))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", nil
}

func (p *OpenAIProvider) GenerateStream(prompt string, outChan chan<- string, errChan chan<- error) {
	defer close(outChan)

	payload := map[string]interface{}{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream":      true,
		"temperature": 0.7,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		errChan <- fmt.Errorf("openai request failed: %w", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		maskedKey := p.apiKey
		if len(maskedKey) > 8 {
			maskedKey = maskedKey[:4] + "..." + maskedKey[len(maskedKey)-4:]
		}
		b, _ := io.ReadAll(resp.Body)
		errChan <- fmt.Errorf("openai error (status %d) url: %s, key: %s, body: %s", resp.StatusCode, p.baseURL, maskedKey, string(b))
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err == nil {
			if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
				outChan <- chunk.Choices[0].Delta.Content
			}
		}
	}

	if err := scanner.Err(); err != nil {
		errChan <- err
	}
}

func (p *OpenAIProvider) Embed(text string) ([]float32, error) {
	payload := map[string]interface{}{
		"model": "text-embedding-3-small", // or any compatible embedding model
		"input": text,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", p.baseURL+"/embeddings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai embed request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no embeddings returned")
	}

	return result.Data[0].Embedding, nil
}

func (p *OpenAIProvider) TranscribeAudio(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open audio file: %w", err)
	}
	defer file.Close()

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	endpoint := p.baseURL + "/audio/transcriptions"
	fileField := "file"

	// Support for onerahmet/openai-whisper-asr-webservice
	if strings.Contains(p.baseURL, "9005") || strings.HasSuffix(p.baseURL, "asr") {
		fileField = "audio_file"
		// If they configured to localhost:9005 or localhost:9005/v1, force it to /asr
		base := strings.TrimSuffix(p.baseURL, "/v1")
		base = strings.TrimSuffix(base, "/")
		if !strings.HasSuffix(base, "/asr") {
			base += "/asr"
		}
		// Request VTT output and force Chinese language via query params for local ASR
		endpoint = base + "?output=vtt&language=zh"
	}

	part, err := writer.CreateFormFile(fileField, filepath.Base(filePath))
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", fmt.Errorf("failed to copy file to form: %w", err)
	}
	// model is optional for local whisper, but required for openai
	if err := writer.WriteField("model", p.model); err != nil {
		return "", err
	}
	// Force language and response_format for OpenAI-compatible endpoints
	if err := writer.WriteField("language", "zh"); err != nil {
		return "", err
	}
	if err := writer.WriteField("response_format", "vtt"); err != nil {
		return "", err
	}
	
	// Add initial prompt to improve accuracy and punctuation for Chinese
	prompt := "以下是一段会议记录，请使用简体中文、准确的标点符号进行转写。"
	if err := writer.WriteField("prompt", prompt); err != nil {
		return "", err
	}
	writer.Close()

	req, err := http.NewRequest("POST", endpoint, &requestBody)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("transcription request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("transcription failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Since we requested VTT, the response is plain text, not JSON.
	// For fallback, if a provider ignored the format and returned JSON {"text": "..."}, try parsing it.
	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(bodyBytes, &result); err == nil && result.Text != "" {
		return result.Text, nil
	}

	// Otherwise return the raw VTT text
	rawVtt := string(bodyBytes)
	return formatVTT(rawVtt), nil
}

func formatVTT(vtt string) string {
	lines := strings.Split(vtt, "\n")
	var result []string
	var currentTimestamp string
	var currentText []string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "WEBVTT" {
			continue
		}
		if strings.Contains(line, "-->") {
			// If we had a previous block, save it
			if currentTimestamp != "" && len(currentText) > 0 {
				result = append(result, currentTimestamp+" "+strings.Join(currentText, " "))
				currentText = nil
			}
			// simplify the timestamp and format it as [00:00.000 - 00:05.400]
			currentTimestamp = "[" + strings.ReplaceAll(line, "-->", "-") + "]"
		} else if line == "" {
			// End of block
			if currentTimestamp != "" && len(currentText) > 0 {
				result = append(result, currentTimestamp+" "+strings.Join(currentText, " "))
				currentTimestamp = ""
				currentText = nil
			}
		} else if currentTimestamp != "" {
			currentText = append(currentText, line)
		} else {
			// Handle cases where there is no timestamp but just text (like the JSON fallback)
			if line != "" {
				currentText = append(currentText, line)
			}
		}
	}
	// Flush last block
	if currentTimestamp != "" && len(currentText) > 0 {
		result = append(result, currentTimestamp+" "+strings.Join(currentText, " "))
	} else if currentTimestamp == "" && len(currentText) > 0 {
		result = append(result, strings.Join(currentText, " "))
	}

	if len(result) == 0 {
		return vtt // return original if parsing failed
	}
	
	return strings.Join(result, "\n")
}

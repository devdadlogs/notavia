package services

import (
	"net/http"
	"strings"
	"testing"
)

func TestGenerateJSONExplainsHowToInstallMissingModel(t *testing.T) {
	service := &OllamaService{model: "qwen2.5:1.5b"}
	err := service.responseError(http.StatusNotFound, []byte(`{"error":"model 'qwen2.5:1.5b' not found"}`))
	if !strings.Contains(err.Error(), "docker compose exec ollama ollama pull qwen2.5:1.5b") {
		t.Fatalf("expected actionable missing-model error, got %v", err)
	}
}

func TestEnsureModelRequiresExactConfiguredModel(t *testing.T) {
	if configuredModelAvailable([]string{"qwen2.5:7b"}, "qwen2.5:1.5b") {
		t.Fatal("a different model size must not satisfy the configured model")
	}
	if !configuredModelAvailable([]string{"qwen2.5:1.5b"}, "qwen2.5:1.5b") {
		t.Fatal("the exact configured model should be accepted")
	}
}

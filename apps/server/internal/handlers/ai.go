package handlers

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"github.com/notavia/server/internal/services"

	"github.com/google/uuid"
)

// --- Helper for Streaming ---
func streamResponse(c *gin.Context, outChan <-chan string, errChan <-chan error) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")

	c.Stream(func(w io.Writer) bool {
		select {
		case msg, ok := <-outChan:
			if !ok {
				return false // Channel closed, stream done
			}
			c.SSEvent("message", msg)
			return true
		case err, ok := <-errChan:
			if ok && err != nil {
				c.SSEvent("error", err.Error())
				c.Writer.Flush()
			}
			return false // End stream on error
		}
	})
}

var qdrantService *services.QdrantService

func getLLMProvider(userID string) services.LLMProvider {
	var user models.User
	if userID != "" {
		config.DB.Where("id = ?", userID).First(&user)
	}

	// Use user settings if they chose a provider
	providerType := user.LLMProvider
	if providerType == "" {
		providerType = config.AppConfig.LLMProvider // Fallback to global
	}

	if providerType == "openai" {
		baseURL := user.OpenAIBaseURL
		if baseURL == "" {
			baseURL = config.AppConfig.OpenAIBaseURL
		}
		apiKey := user.OpenAIKey
		if apiKey == "" {
			apiKey = config.AppConfig.OpenAIKey
		}
		model := user.OpenAIModel
		if model == "" {
			model = config.AppConfig.OpenAIModel
		}
		return services.NewOpenAIProvider(baseURL, apiKey, model)
	}

	// Default to Ollama
	return services.NewOllamaService()
}

// getEmbeddingProvider always returns Ollama because our Qdrant collection is fixed at 768 dimensions (nomic-embed-text).
// OpenAI embeddings (1536 dims) or DeepSeek (unsupported) will break the vector database.
func getEmbeddingProvider() services.LLMProvider {
	return services.NewOllamaService()
}

func getQdrantService() *services.QdrantService {
	if qdrantService == nil {
		qdrantService = services.NewQdrantService()
		// Initialize collection (ignoring errors for now, should be done in main)
		_ = qdrantService.InitCollection()
	}
	return qdrantService
}

// --- Request Structs ---

type SummarizeInput struct {
	NoteID string `json:"noteId" binding:"required"`
	Mode   string `json:"mode"` // "brief" or "detailed"
}

type ExtractInput struct {
	NoteID string `json:"noteId" binding:"required"`
}

type ContinueInput struct {
	Content string `json:"content" binding:"required"`
}

type RewriteInput struct {
	Content string `json:"content" binding:"required"`
	Style   string `json:"style"` // "formal", "casual", "concise"
}

type SuggestTagsInput struct {
	NoteID string `json:"noteId" binding:"required"`
}

type SproutInput struct {
	NoteID  string `json:"noteId"`
	Content string `json:"content" binding:"required"`
}

// --- Handlers ---

// AIHealthCheck returns the status of the AI provider and available models.
func AIHealthCheck(c *gin.Context) {
	userID := middleware.GetUserID(c)
	healthy, err := getLLMProvider(userID).CheckHealth()
	if err != nil || !healthy {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "offline",
			"error":  "Ollama is not reachable. Make sure it's running.",
		})
		return
	}

	models, _ := getLLMProvider(userID).ListModels()

	c.JSON(http.StatusOK, gin.H{
		"status": "online",
		"models": models,
	})
}

// AISummarize generates a summary for a note.
func AISummarize(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input SummarizeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch note
	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", input.NoteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	if note.ContentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note has no text content"})
		return
	}

	outChan := make(chan string)
	errChan := make(chan error)

	logAIUsage(userID, "summarize")

	go services.SummarizeStream(getLLMProvider(userID), note.ContentText, input.Mode, outChan, errChan)
	streamResponse(c, outChan, errChan)
}

// AIExtract extracts key points from a note.
func AIExtract(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input ExtractInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", input.NoteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	if note.ContentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note has no text content"})
		return
	}

	outChan := make(chan string)
	errChan := make(chan error)

	logAIUsage(userID, "extract")

	go services.ExtractKeyPointsStream(getLLMProvider(userID), note.ContentText, outChan, errChan)
	streamResponse(c, outChan, errChan)
}

// AIContinue continues writing from the given content.
func AIContinue(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input ContinueInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	outChan := make(chan string)
	errChan := make(chan error)

	logAIUsage(userID, "continue")

	go services.ContinueWritingStream(getLLMProvider(userID), input.Content, outChan, errChan)
	streamResponse(c, outChan, errChan)
}

// AIRewrite rewrites content in a specified style.
func AIRewrite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input RewriteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	outChan := make(chan string)
	errChan := make(chan error)

	logAIUsage(userID, "rewrite")

	go services.RewriteStream(getLLMProvider(userID), input.Content, input.Style, outChan, errChan)
	streamResponse(c, outChan, errChan)
}

// AISuggestTags suggests tags for a note.
func AISuggestTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input SuggestTagsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", input.NoteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	if note.ContentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note has no text content"})
		return
	}

	outChan := make(chan string)
	errChan := make(chan error)

	logAIUsage(userID, "suggest_tags")

	go services.SuggestTagsStream(getLLMProvider(userID), note.ContentText, outChan, errChan)
	streamResponse(c, outChan, errChan)
}

// AISprout performs a semantic search to find related notes.
func AISprout(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input SproutInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Generate embedding for the input content (Always use local)
	embedding, err := getEmbeddingProvider().Embed(input.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate embedding: " + err.Error()})
		return
	}

	// 2. Search Qdrant for similar notes
	results, err := getQdrantService().SearchRelatedNotes(userID, embedding, 5, input.NoteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search vector db: " + err.Error()})
		return
	}

	logAIUsage(userID, "sprout")
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// --- Global Knowledge Base Chat ---

type AIChatInput struct {
	Query string `json:"query"`
}

func AIChatWithNotes(c *gin.Context) {
	var input AIChatInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	provider := getLLMProvider(userID)

	outChan := make(chan string)
	errChan := make(chan error, 1)

	go func() {
		// 1. Generate embedding for user query (Always use local embeddings to match DB dimensions)
		embedding, err := getEmbeddingProvider().Embed(input.Query)
		if err != nil {
			errChan <- fmt.Errorf("failed to generate embedding: %w", err)
			return
		}

		// 2. Search related notes
		results, err := getQdrantService().SearchRelatedNotes(userID, embedding, 5, "")
		if err != nil {
			errChan <- fmt.Errorf("failed to search notes: %w", err)
			return
		}

		// 3. Construct prompt
		var contextBuilder strings.Builder
		for i, res := range results {
			contextBuilder.WriteString(fmt.Sprintf("\n--- 引用片段 %d (来自笔记《%s》) ---\n%s\n", i+1, res.Title, res.Content))
		}

		prompt := fmt.Sprintf(`你是一个专属私人知识库的AI助手。请基于以下我过往笔记中的引用片段，来回答我的问题。
如果片段中没有相关信息，请基于你自己的常识回答，但要明确说明“你的笔记中未提及此事”。

【我的问题】
%s

【相关笔记片段】%s

请用清晰易懂的语言回答，并在适当的时候提到你参考了哪篇笔记。`, input.Query, contextBuilder.String())

		// 4. Generate stream
		provider.GenerateStream(prompt, outChan, errChan)
	}()

	streamResponse(c, outChan, errChan)
}

// --- Helper ---

func logAIUsage(userID, actionType string) {
	config.DB.Create(&models.AiUsageLog{
		ID:         uuid.New().String(),
		UserID:     userID,
		ActionType: actionType,
	})
}

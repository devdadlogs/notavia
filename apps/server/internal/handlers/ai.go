package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"github.com/notavia/server/internal/services"

	"github.com/google/uuid"
)

var ollamaService *services.OllamaService
var qdrantService *services.QdrantService

func getOllamaService() *services.OllamaService {
	if ollamaService == nil {
		ollamaService = services.NewOllamaService()
	}
	return ollamaService
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

// AIHealthCheck returns the status of the Ollama connection and available models.
func AIHealthCheck(c *gin.Context) {
	healthy, err := getOllamaService().CheckHealth()
	if err != nil || !healthy {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "offline",
			"error":  "Ollama is not reachable. Make sure it's running.",
		})
		return
	}

	models, _ := getOllamaService().ListModels()
	modelNames := make([]string, len(models))
	for i, m := range models {
		modelNames[i] = m.Name
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "online",
		"models": modelNames,
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

	result, err := getOllamaService().Summarize(note.ContentText, input.Mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI processing failed: " + err.Error()})
		return
	}

	// Log AI usage
	logAIUsage(userID, "summarize")

	c.JSON(http.StatusOK, gin.H{"result": result})
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

	result, err := getOllamaService().ExtractKeyPoints(note.ContentText)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI processing failed: " + err.Error()})
		return
	}

	logAIUsage(userID, "extract")
	c.JSON(http.StatusOK, gin.H{"result": result})
}

// AIContinue continues writing from the given content.
func AIContinue(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input ContinueInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := getOllamaService().ContinueWriting(input.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI processing failed: " + err.Error()})
		return
	}

	logAIUsage(userID, "continue")
	c.JSON(http.StatusOK, gin.H{"result": result})
}

// AIRewrite rewrites content in a specified style.
func AIRewrite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input RewriteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := getOllamaService().Rewrite(input.Content, input.Style)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI processing failed: " + err.Error()})
		return
	}

	logAIUsage(userID, "rewrite")
	c.JSON(http.StatusOK, gin.H{"result": result})
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

	result, err := getOllamaService().SuggestTags(note.ContentText)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI processing failed: " + err.Error()})
		return
	}

	logAIUsage(userID, "suggest_tags")
	c.JSON(http.StatusOK, gin.H{"result": result})
}

// AISprout performs a semantic search to find related notes.
func AISprout(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input SproutInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Generate embedding for the input content
	embedding, err := getOllamaService().Embed(input.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate embedding: " + err.Error()})
		return
	}

	// 2. Search Qdrant for similar notes
	results, err := getQdrantService().SearchRelatedNotes(embedding, 5, input.NoteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search vector db: " + err.Error()})
		return
	}

	logAIUsage(userID, "sprout")
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// --- Helper ---

func logAIUsage(userID, actionType string) {
	config.DB.Create(&models.AiUsageLog{
		ID:         uuid.New().String(),
		UserID:     userID,
		ActionType: actionType,
	})
}

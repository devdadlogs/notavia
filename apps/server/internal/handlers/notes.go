package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
)

// --- Request Structs ---

type CreateNoteInput struct {
	Title       string  `json:"title"`
	NotebookID  *string `json:"notebookId"`
	ContentJSON string  `json:"contentJson"`
	ContentText string  `json:"contentText"`
}

type UpdateNoteInput struct {
	Title       *string `json:"title"`
	ContentJSON *string `json:"contentJson"`
	ContentText *string `json:"contentText"`
	CoverImage  *string `json:"coverImage"`
	Icon        *string `json:"icon"`
	IsPinned    *bool   `json:"isPinned"`
	IsTrashed   *bool   `json:"isTrashed"`
}

// --- Handlers ---

func CreateNote(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input CreateNoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note := models.Note{
		ID:          uuid.New().String(),
		UserID:      userID,
		Title:       input.Title,
		NotebookID:  input.NotebookID,
		ContentJSON: input.ContentJSON,
		ContentText: input.ContentText,
	}

	if note.Title == "" {
		note.Title = "Untitled"
	}

	if err := config.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create note"})
		return
	}

	// Index in vector DB for semantic search
	go indexNoteInVectorDB(note.ID, note.Title, note.ContentText)

	c.JSON(http.StatusCreated, note)
}

func GetNotes(c *gin.Context) {
	userID := middleware.GetUserID(c)
	notebookID := c.Query("notebookId")

	var notes []models.Note
	query := config.DB.Where("user_id = ? AND is_trashed = ?", userID, false)

	if notebookID != "" {
		query = query.Where("notebook_id = ?", notebookID)
	}

	if err := query.Order("updated_at DESC").Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notes"})
		return
	}

	c.JSON(http.StatusOK, notes)
}

func GetNote(c *gin.Context) {
	userID := middleware.GetUserID(c)
	noteID := c.Param("id")

	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	c.JSON(http.StatusOK, note)
}

func UpdateNote(c *gin.Context) {
	userID := middleware.GetUserID(c)
	noteID := c.Param("id")

	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	var input UpdateNoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Apply updates
	updates := map[string]interface{}{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.ContentJSON != nil {
		updates["content_json"] = *input.ContentJSON
	}
	if input.ContentText != nil {
		updates["content_text"] = *input.ContentText
	}
	if input.CoverImage != nil {
		updates["cover_image"] = *input.CoverImage
	}
	if input.Icon != nil {
		updates["icon"] = *input.Icon
	}
	if input.IsPinned != nil {
		updates["is_pinned"] = *input.IsPinned
	}
	if input.IsTrashed != nil {
		updates["is_trashed"] = *input.IsTrashed
	}

	// Auto-increment version
	updates["version"] = note.Version + 1

	if err := config.DB.Model(&note).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update note"})
		return
	}

	// Return fresh copy
	config.DB.First(&note, "id = ?", noteID)

	// Update vector DB
	go indexNoteInVectorDB(note.ID, note.Title, note.ContentText)

	c.JSON(http.StatusOK, note)
}

func TrashNote(c *gin.Context) {
	userID := middleware.GetUserID(c)
	noteID := c.Param("id")

	result := config.DB.Model(&models.Note{}).
		Where("id = ? AND user_id = ?", noteID, userID).
		Update("is_trashed", true)

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note trashed"})
}

// --- Helper ---

func indexNoteInVectorDB(noteID, title, contentText string) {
	if contentText == "" {
		return // Skip empty notes
	}
	embedding, err := getOllamaService().Embed(contentText)
	if err != nil {
		fmt.Printf("Failed to embed note %s: %v\n", noteID, err)
		return
	}
	if err := getQdrantService().UpsertNote(noteID, title, contentText, embedding); err != nil {
		fmt.Printf("Failed to upsert note %s to Qdrant: %v\n", noteID, err)
	}
}

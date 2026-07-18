package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"gorm.io/gorm"
)

const (
	maxMaterialIdeaLength  = 10000
	maxSourceExcerptLength = 4000
)

type materialIdeaInput struct {
	Content       string `json:"content"`
	SourceExcerpt string `json:"sourceExcerpt"`
}

func ownedMaterialExists(userID, noteID string) bool {
	var count int64
	config.DB.Model(&models.Note{}).Where("id = ? AND user_id = ? AND is_trashed = ?", noteID, userID, false).Count(&count)
	return count > 0
}

func parseMaterialIdeaInput(c *gin.Context) (materialIdeaInput, bool) {
	var input materialIdeaInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "想法内容格式不正确"})
		return input, false
	}
	input.Content = strings.TrimSpace(input.Content)
	input.SourceExcerpt = strings.TrimSpace(input.SourceExcerpt)
	if input.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "想法内容不能为空"})
		return input, false
	}
	if len([]rune(input.Content)) > maxMaterialIdeaLength || len([]rune(input.SourceExcerpt)) > maxSourceExcerptLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "想法或原文摘录过长"})
		return input, false
	}
	return input, true
}

func ListMaterialIdeas(c *gin.Context) {
	userID, noteID := middleware.GetUserID(c), c.Param("id")
	if !ownedMaterialExists(userID, noteID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "material not found"})
		return
	}
	var ideas []models.MaterialIdea
	if err := config.DB.Where("user_id = ? AND note_id = ?", userID, noteID).Order("created_at ASC, id ASC").Find(&ideas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list material ideas"})
		return
	}
	c.JSON(http.StatusOK, ideas)
}

func CreateMaterialIdea(c *gin.Context) {
	userID, noteID := middleware.GetUserID(c), c.Param("id")
	if !ownedMaterialExists(userID, noteID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "material not found"})
		return
	}
	input, ok := parseMaterialIdeaInput(c)
	if !ok {
		return
	}
	idea := models.MaterialIdea{
		ID: uuid.NewString(), UserID: userID, NoteID: noteID,
		Content: input.Content, SourceExcerpt: input.SourceExcerpt,
	}
	if err := config.DB.Create(&idea).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create material idea"})
		return
	}
	c.JSON(http.StatusCreated, idea)
}

func UpdateMaterialIdea(c *gin.Context) {
	userID, noteID, ideaID := middleware.GetUserID(c), c.Param("id"), c.Param("ideaId")
	input, ok := parseMaterialIdeaInput(c)
	if !ok {
		return
	}
	var idea models.MaterialIdea
	if err := config.DB.Where("id = ? AND note_id = ? AND user_id = ?", ideaID, noteID, userID).First(&idea).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "idea not found"})
		return
	}
	idea.Content, idea.SourceExcerpt = input.Content, input.SourceExcerpt
	if err := config.DB.Save(&idea).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update material idea"})
		return
	}
	c.JSON(http.StatusOK, idea)
}

func DeleteMaterialIdea(c *gin.Context) {
	userID, noteID, ideaID := middleware.GetUserID(c), c.Param("id"), c.Param("ideaId")
	var idea models.MaterialIdea
	if err := config.DB.Where("id = ? AND note_id = ? AND user_id = ?", ideaID, noteID, userID).First(&idea).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "idea not found"})
		return
	}
	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("idea_id = ?", ideaID).Delete(&models.TopicIdea{}).Error; err != nil {
			return err
		}
		return tx.Delete(&idea).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete material idea"})
		return
	}
	c.Status(http.StatusNoContent)
	c.Writer.WriteHeaderNow()
}

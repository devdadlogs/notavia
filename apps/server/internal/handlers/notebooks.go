package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
)

type CreateNotebookInput struct {
	Name     string  `json:"name" binding:"required"`
	ParentID *string `json:"parentId"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
}

func CreateNotebook(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input CreateNotebookInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	notebook := models.Notebook{
		ID:       uuid.New().String(),
		UserID:   userID,
		Name:     input.Name,
		ParentID: input.ParentID,
		Icon:     input.Icon,
		Color:    input.Color,
	}

	if err := config.DB.Create(&notebook).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create notebook"})
		return
	}

	c.JSON(http.StatusCreated, notebook)
}

func GetNotebooks(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var notebooks []models.Notebook
	if err := config.DB.Where("user_id = ?", userID).Order("\"order\" ASC").Find(&notebooks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notebooks"})
		return
	}

	c.JSON(http.StatusOK, notebooks)
}

func UpdateNotebook(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var notebook models.Notebook
	if err := config.DB.Where("id = ? AND user_id = ?", id, userID).First(&notebook).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notebook not found"})
		return
	}

	var input CreateNotebookInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config.DB.Model(&notebook).Updates(map[string]interface{}{
		"name":  input.Name,
		"icon":  input.Icon,
		"color": input.Color,
	})

	c.JSON(http.StatusOK, notebook)
}

func DeleteNotebook(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	result := config.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Notebook{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notebook not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notebook deleted"})
}

package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
)

const maxUploadSize = 50 << 20 // 50MB

func UploadFile(c *gin.Context) {
	// Limit request body size
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize)

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File upload failed: " + err.Error()})
		return
	}
	defer file.Close()

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	filename := uuid.New().String() + ext
	savePath := filepath.Join(config.AppConfig.UploadDir, filename)

	if err := c.SaveUploadedFile(header, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	if err := config.DB.Create(&models.UploadedFile{ID: uuid.NewString(), UserID: middleware.GetUserID(c), Filename: filename}).Error; err != nil {
		_ = os.Remove(savePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register uploaded file"})
		return
	}

	// Return the URL relative to the server
	url := fmt.Sprintf("/uploads/%s", filename)
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func DownloadFile(c *gin.Context) {
	filename := filepath.Base(c.Param("filename"))
	if filename == "." || filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}
	userID := middleware.GetUserID(c)
	var count int64
	config.DB.Model(&models.UploadedFile{}).Where("filename = ? AND user_id = ?", filename, userID).Count(&count)
	if count == 0 {
		like := "%/uploads/" + filename + "%"
		config.DB.Model(&models.Note{}).Where("user_id = ? AND (content_json LIKE ? OR content_text LIKE ? OR source_html LIKE ? OR cover_image LIKE ? OR audio_url LIKE ?)", userID, like, like, like, like, like).Count(&count)
	}
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	c.File(filepath.Join(config.AppConfig.UploadDir, filename))
}

func DownloadAudioFile(c *gin.Context) {
	filename := filepath.Base(c.Param("filename"))
	userID := middleware.GetUserID(c)
	like := "%/static/" + filename
	var count int64
	config.DB.Model(&models.Note{}).Where("user_id = ? AND audio_url LIKE ?", userID, like).Count(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "audio not found"})
		return
	}
	c.File(filepath.Join(config.AppConfig.UploadDir, "audio", filename))
}

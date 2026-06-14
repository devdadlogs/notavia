package handlers

import (
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
)

type ClipperAIResponse struct {
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

func parseClipperAIResponse(raw string) ClipperAIResponse {
	var resp ClipperAIResponse
	// Try to find JSON block if wrapped in markdown code blocks
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start != -1 && end != -1 && end > start {
		jsonStr := raw[start : end+1]
		err := json.Unmarshal([]byte(jsonStr), &resp)
		if err == nil {
			return resp
		}
	}
	// Fallback
	resp.Summary = raw
	resp.Tags = []string{"剪藏"}
	return resp
}

func assignTagsToNote(userID string, noteID string, tags []string) {
	for _, tagName := range tags {
		tagName = strings.TrimSpace(tagName)
		if tagName == "" {
			continue
		}
		var tag models.Tag
		if err := config.DB.Where("user_id = ? AND name = ?", userID, tagName).First(&tag).Error; err != nil {
			tag = models.Tag{
				ID:     uuid.New().String(),
				UserID: userID,
				Name:   tagName,
			}
			config.DB.Create(&tag)
		}
		noteTag := models.NoteTag{
			NoteID: noteID,
			TagID:  tag.ID,
		}
		// Ignore constraint violation if the tag is already linked
		config.DB.Create(&noteTag)
	}
}

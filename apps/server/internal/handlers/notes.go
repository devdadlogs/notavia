package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/PuerkitoBio/goquery"
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
	Transcript  *string `json:"transcript"`
}

// --- Handlers ---

func ReindexNotes(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var notes []models.Note
	if err := config.DB.Where("user_id = ? AND (content_text != '' OR transcript != '') AND is_trashed = ?", userID, false).Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notes"})
		return
	}

	// Delete all existing points for this user to ensure a clean slate
	if err := getQdrantService().DeleteAllNotesByUserID(userID); err != nil {
		fmt.Printf("Warning: Failed to delete all points for user %s: %v\n", userID, err)
	}

	// Run synchronously to ensure progress is tracked and completed before returning
	for _, note := range notes {
		indexText := note.ContentText
		if note.Transcript != "" {
			indexText += "\n\n录音内容:\n" + note.Transcript
		}
		if note.TranscriptSummary != "" {
			indexText += "\n\n录音摘要:\n" + note.TranscriptSummary
		}
		indexNoteInVectorDB(userID, note.ID, note.Title, indexText)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Reindexing completed", "count": len(notes)})
}

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
	go indexNoteInVectorDB(userID, note.ID, note.Title, note.ContentText)

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
	if err := config.DB.Preload("Tags.Tag").Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
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
	if input.Transcript != nil {
		updates["transcript"] = *input.Transcript
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
	if note.IsTrashed {
		go func() {
			if err := getQdrantService().DeleteNotesByNoteID(note.ID); err != nil {
				fmt.Printf("Failed to delete points for trashed note %s: %v\n", note.ID, err)
			}
		}()
	} else {
		indexText := note.ContentText
		if note.Transcript != "" {
			indexText += "\n\n录音内容:\n" + note.Transcript
		}
		if note.TranscriptSummary != "" {
			indexText += "\n\n录音摘要:\n" + note.TranscriptSummary
		}
		go indexNoteInVectorDB(userID, note.ID, note.Title, indexText)
	}

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

	// Delete from vector db when trashed
	go func() {
		if err := getQdrantService().DeleteNotesByNoteID(noteID); err != nil {
			fmt.Printf("Failed to delete points from vector db for trashed note %s: %v\n", noteID, err)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Note trashed"})
}

func UploadAudio(c *gin.Context) {
	userID := middleware.GetUserID(c)
	noteID := c.Param("id")

	// Verify note ownership
	var note models.Note
	if err := config.DB.Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	file, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No audio file uploaded"})
		return
	}

	// Create uploads directory if not exists
	uploadDir := "uploads/audio"
	os.MkdirAll(uploadDir, 0755)

	filePath := fmt.Sprintf("%s/%s-%s", uploadDir, noteID, file.Filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save audio file"})
		return
	}

	// Update note with audio URL
	audioURL := fmt.Sprintf("/static/%s-%s", noteID, file.Filename)
	if err := config.DB.Model(&note).Update("audio_url", audioURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update note record"})
		return
	}

	// Start background transcription
	go func(nID string, uID string, fPath string) {
		audioProvider := getAudioProvider()
		transcript, err := audioProvider.TranscribeAudio(fPath)
		if err != nil {
			fmt.Printf("Transcription failed for note %s: %v\n", nID, err)
			return
		}

		// Save transcript
		config.DB.Model(&models.Note{}).Where("id = ?", nID).Update("transcript", transcript)

		// Generate summary
		textProvider := getLLMProvider(uID)
		summaryPrompt := fmt.Sprintf("请根据以下录音原文生成一段100字以内的核心摘要：\n\n%s", transcript)
		summary, err := textProvider.Generate(summaryPrompt)
		if err == nil {
			config.DB.Model(&models.Note{}).Where("id = ?", nID).Update("transcript_summary", summary)
		}

		// Reindex note in Vector DB now that transcription is complete
		var fullNote models.Note
		if err := config.DB.First(&fullNote, "id = ?", nID).Error; err == nil {
			indexText := fullNote.ContentText
			if transcript != "" {
				indexText += "\n\n录音内容:\n" + transcript
			}
			if summary != "" {
				indexText += "\n\n录音摘要:\n" + summary
			}
			go indexNoteInVectorDB(uID, nID, fullNote.Title, indexText)
		}
	}(noteID, userID, filePath)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Audio uploaded successfully",
		"audioUrl": audioURL,
	})
}

type WebClipperInput struct {
	URL string `json:"url"`
}

func WebClipper(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input WebClipperInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Fetch URL content with User-Agent
	req, err := http.NewRequest("GET", input.URL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	fmt.Printf("🌐 Clipping URL: %s\n", input.URL)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("❌ Clipper fetch error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch URL"})
		return
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		fmt.Printf("❌ Clipper status error: %d %s\n", res.StatusCode, res.Status)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Status code error: %d", res.StatusCode)})
		return
	}

	// 2. Parse HTML and extract text
	doc, err := goquery.NewDocumentFromReader(res.Body)
	if err != nil {
		fmt.Printf("❌ Clipper parse error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse HTML"})
		return
	}

	title := doc.Find("title").Text()
	if title == "" {
		title = "Clipped Article"
	}
	title = strings.TrimSpace(title)

	// Targeted extraction for better results (especially for docs)
	var contentSource *goquery.Selection
	if s := doc.Find("#js_content"); s.Length() > 0 { // WeChat
		contentSource = s
	} else if s := doc.Find(".rich_media_content"); s.Length() > 0 { // WeChat alternative
		contentSource = s
	} else if s := doc.Find(".sl-markdown-content"); s.Length() > 0 {
		contentSource = s
	} else if s := doc.Find("article"); s.Length() > 0 {
		contentSource = s
	} else if s := doc.Find("main"); s.Length() > 0 {
		contentSource = s
	} else {
		contentSource = doc.Selection
	}

	// Remove scripts, styles, etc. from the source
	contentSource.Find("script, style, nav, footer, header, aside").Remove()
	contentHtml, err := contentSource.Html()
	if err != nil {
		contentHtml = contentSource.Text()
	}
	textContent := strings.TrimSpace(contentSource.Text())
	
	fmt.Printf("📝 Clipped content length: %d chars\n", len(textContent))
	
	if len(textContent) < 50 {
		fmt.Printf("⚠️ Warning: Very short content extracted. Might be a SPA or blocked.\n")
	}

	// Limit text length to avoid token limits
	if len(textContent) > 10000 {
		textContent = textContent[:10000]
	}

	// 3. Fetch existing tags for the user
	var existingTags []models.Tag
	config.DB.Where("user_id = ?", userID).Find(&existingTags)
	var tagNames []string
	for _, t := range existingTags {
		tagNames = append(tagNames, t.Name)
	}
	existingTagsStr := "无"
	if len(tagNames) > 0 {
		existingTagsStr = strings.Join(tagNames, ", ")
	}

	// 4. Summarize and Tag using AI
	prompt := fmt.Sprintf(`请作为一位专业的知识管理助手，阅读以下网页内容。
你需要完成两件事：
1. 生成一段简明扼要的摘要（最多3句话）。
2. 根据用户的现有标签库（%s），为这篇文章打上 1-3 个相关标签。如果现有标签库中没有合适的，你可以创造新的简短标签。

请务必严格以 JSON 格式输出，不要输出任何其他内容，例如：
{
  "summary": "这是第一句话。这是第二句话。这是第三句话。",
  "tags": ["效率", "AI"]
}

网页内容：
%s`, existingTagsStr, textContent)

	aiResponse, err := getLLMProvider(userID).Generate(prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI generation failed"})
		return
	}

	// 5. Parse AI Response
	parsedResult := parseClipperAIResponse(aiResponse)
	
	// Format as HTML so Tiptap natively parses it nicely (bypassing naive JSON conversion)
	finalHtml := fmt.Sprintf(`<h3>📝 网页剪藏摘要</h3>
<p><strong>%s</strong></p>
<p><em>来源链接：<a href="%s">%s</a></em></p>
<hr>
<div>%s</div>`, parsedResult.Summary, input.URL, input.URL, contentHtml)

	// 6. Create Note with HTML in ContentText. ContentJSON left empty so frontend parses HTML.
	note := models.Note{
		ID:          uuid.New().String(),
		UserID:      userID,
		Title:       title,
		ContentJSON: "", // Empty triggers frontend HTML fallback
		ContentText: finalHtml, 
	}

	if err := config.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create note"})
		return
	}

	// 8. Assign Tags
	assignTagsToNote(userID, note.ID, parsedResult.Tags)

	// 9. Index in vector DB for semantic search
	go indexNoteInVectorDB(userID, note.ID, note.Title, note.ContentText)

	// Preload tags to return to frontend
	config.DB.Preload("Tags.Tag").First(&note, "id = ?", note.ID)

	c.JSON(http.StatusCreated, note)
}

func GetStats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	
	type DailyCount struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	
	var results []DailyCount
	// Get counts of notes created per day for the last 90 days
	// Using SQLite strftime for date grouping
	config.DB.Raw(`
		SELECT strftime('%Y-%m-%d', created_at) as date, count(*) as count 
		FROM notes 
		WHERE user_id = ? AND created_at > date('now', '-90 days')
		GROUP BY date
	`, userID).Scan(&results)
	
	// Also get total count
	var totalCount int64
	config.DB.Model(&models.Note{}).Where("user_id = ? AND is_trashed = ?", userID, false).Count(&totalCount)

	c.JSON(http.StatusOK, gin.H{
		"daily": results,
		"total": totalCount,
	})
}

// --- Helper ---

func indexNoteInVectorDB(userID, noteID, title, contentText string) {
	if contentText == "" {
		return // Skip empty notes
	}
	// Delete old points for this note first
	if err := getQdrantService().DeleteNotesByNoteID(noteID); err != nil {
		fmt.Printf("Failed to delete old points for note %s: %v\n", noteID, err)
	}

	// Simple chunking (e.g. 500 characters per chunk)
	chunkSize := 500
	runes := []rune(contentText)
	var chunks []string
	var embeddings [][]float32

	for i := 0; i < len(runes); i += chunkSize {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunkText := fmt.Sprintf("【笔记标题：%s】\n%s", title, string(runes[i:end]))
		chunks = append(chunks, chunkText)
		
		embedding, err := getEmbeddingProvider().Embed(chunkText)
		if err != nil {
			fmt.Printf("Failed to embed chunk %d for note %s: %v\n", i/chunkSize, noteID, err)
			return
		}
		embeddings = append(embeddings, embedding)
	}

	if err := getQdrantService().UpsertNoteChunks(userID, noteID, title, chunks, embeddings); err != nil {
		fmt.Printf("Failed to upsert note chunks for %s to Qdrant: %v\n", noteID, err)
	}
}

// markdownToTiptapJSON converts a simple markdown string to Tiptap-compatible JSON.
func markdownToTiptapJSON(md string) string {
	type Node struct {
		Type    string `json:"type"`
		Attrs   map[string]interface{} `json:"attrs,omitempty"`
		Content []interface{}          `json:"content,omitempty"`
		Text    string                 `json:"text,omitempty"`
	}

	doc := struct {
		Type    string `json:"type"`
		Content []Node `json:"content"`
	}{
		Type:    "doc",
		Content: []Node{},
	}

	lines := strings.Split(md, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var node Node
		if strings.HasPrefix(line, "# ") {
			node = Node{
				Type:  "heading",
				Attrs: map[string]interface{}{"level": 1},
				Content: []interface{}{Node{Type: "text", Text: line[2:]}},
			}
		} else if strings.HasPrefix(line, "## ") {
			node = Node{
				Type:  "heading",
				Attrs: map[string]interface{}{"level": 2},
				Content: []interface{}{Node{Type: "text", Text: line[3:]}},
			}
		} else if strings.HasPrefix(line, "### ") {
			node = Node{
				Type:  "heading",
				Attrs: map[string]interface{}{"level": 3},
				Content: []interface{}{Node{Type: "text", Text: line[4:]}},
			}
		} else if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			// Very simple bullet list item representation
			node = Node{
				Type: "paragraph",
				Content: []interface{}{Node{Type: "text", Text: "• " + line[2:]}},
			}
		} else {
			node = Node{
				Type: "paragraph",
				Content: []interface{}{Node{Type: "text", Text: line}},
			}
		}
		doc.Content = append(doc.Content, node)
	}

	jsonData, _ := json.Marshal(doc)
	return string(jsonData)
}

